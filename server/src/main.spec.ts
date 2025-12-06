import { Request, Response } from 'express';
import * as fs from 'fs';
import { createBasePathReplacementMiddleware } from './utils/base-path-replacement';

// Mock fs.readFile
jest.mock('fs');

// Mock environment variables
const originalEnv = process.env;

describe('BasePathReplacementMiddleware (main.ts)', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  const createMockRequest = (path: string): Request => {
    const req = {} as Request;
    Object.defineProperty(req, 'path', {
      value: path,
      writable: false,
      enumerable: true,
      configurable: true,
    });
    return req;
  };

  const createMockResponse = (): Partial<Response> => {
    return {
      send: jest.fn().mockReturnThis(),
      sendFile: jest.fn(),
      setHeader: jest.fn(),
    };
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockRequest = {};
    mockResponse = createMockResponse();
    nextFunction = jest.fn();
    
    // Mock fs.readFile to work with promisify
    (fs.readFile as unknown as jest.Mock).mockImplementation((path, encoding, callback) => {
      if (typeof encoding === 'function') {
        callback = encoding;
      }
      // We'll set up specific mocks in individual tests
      callback(new Error('Not mocked'), null);
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('when ENABLE_DYNAMIC_BASE_PATH is not set', () => {
    beforeEach(() => {
      process.env.ENABLE_DYNAMIC_BASE_PATH = undefined;
      process.env.NODE_ENV = 'production';
    });

    it('should call next without modifying response', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('when ENABLE_DYNAMIC_BASE_PATH is false', () => {
    beforeEach(() => {
      process.env.ENABLE_DYNAMIC_BASE_PATH = 'false';
      process.env.NODE_ENV = 'production';
    });

    it('should call next without modifying response', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('when not in production', () => {
    beforeEach(() => {
      process.env.ENABLE_DYNAMIC_BASE_PATH = 'true';
      process.env.NODE_ENV = 'development';
    });

    it('should call next without modifying response', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('when ENABLE_DYNAMIC_BASE_PATH is true and in production', () => {
    beforeEach(() => {
      process.env.ENABLE_DYNAMIC_BASE_PATH = 'true';
      process.env.NODE_ENV = 'production';
      process.env.BASE_PATH = '/my-base-path';
    });

    it('should override sendFile method', () => {
      const middleware = createBasePathReplacementMiddleware();
      const originalSendFile = mockResponse.sendFile;
      mockRequest = createMockRequest('/index.html');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      
      expect(nextFunction).toHaveBeenCalled();
      // sendFile should be overridden
      expect(mockResponse.sendFile).not.toBe(originalSendFile);
    });

    it('should replace __PATH_PREFIX__ in HTML files served via sendFile', async () => {
      // Mock fs.readFile to return HTML with placeholder
      (fs.readFile as unknown as jest.Mock).mockImplementation((path, encoding, callback) => {
        callback(null, '<html><script src="/__PATH_PREFIX__/main.js"></script></html>');
      });

      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Call the overridden sendFile
      const sendFileFn = mockResponse.sendFile as jest.Mock;
      sendFileFn('/path/to/index.html');

      // Wait for promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(mockResponse.send).toHaveBeenCalledWith('<html><script src="/my-base-path/main.js"></script></html>');
    });

    it('should replace __PATH_PREFIX__ in JS files served via sendFile', async () => {
      // Mock fs.readFile to return JS with placeholder
      (fs.readFile as unknown as jest.Mock).mockImplementation((path, encoding, callback) => {
        callback(null, 'const path = "/__PATH_PREFIX__/";');
      });

      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/main.js');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Call the overridden sendFile
      const sendFileFn = mockResponse.sendFile as jest.Mock;
      sendFileFn('/path/to/main.js');

      // Wait for promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript; charset=utf-8');
      expect(mockResponse.send).toHaveBeenCalledWith('const path = "/my-base-path/";');
    });

    it('should replace __PATH_PREFIX__ in CSS files served via sendFile', async () => {
      // Mock fs.readFile to return CSS with placeholder
      (fs.readFile as unknown as jest.Mock).mockImplementation((path, encoding, callback) => {
        callback(null, '.icon { background: url(/__PATH_PREFIX__/logo.png); }');
      });

      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/styles.css');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Call the overridden sendFile
      const sendFileFn = mockResponse.sendFile as jest.Mock;
      sendFileFn('/path/to/styles.css');

      // Wait for promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/css; charset=utf-8');
      expect(mockResponse.send).toHaveBeenCalledWith('.icon { background: url(/my-base-path/logo.png); }');
    });

    it('should not process non-HTML/JS/CSS files', async () => {
      const middleware = createBasePathReplacementMiddleware();
      const originalSendFile = jest.fn();
      mockResponse.sendFile = originalSendFile;
      mockRequest = createMockRequest('/image.png');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Call the overridden sendFile with a non-text file
      const sendFileFn = mockResponse.sendFile as jest.Mock;
      sendFileFn('/path/to/image.png');

      // Wait for any async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have called original sendFile
      expect(originalSendFile).toHaveBeenCalled();
    });

    it('should handle multiple occurrences of __PATH_PREFIX__', async () => {
      // Mock fs.readFile to return content with multiple occurrences
      (fs.readFile as unknown as jest.Mock).mockImplementation((path, encoding, callback) => {
        callback(null, 'first: /__PATH_PREFIX__/, second: /__PATH_PREFIX__/');
      });

      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const sendFileFn = mockResponse.sendFile as jest.Mock;
      sendFileFn('/path/to/index.html');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockResponse.send).toHaveBeenCalledWith('first: /my-base-path/, second: /my-base-path/');
    });

    it('should use empty string when BASE_PATH is not set', async () => {
      process.env.BASE_PATH = undefined;
      
      // Mock fs.readFile
      (fs.readFile as unknown as jest.Mock).mockImplementation((path, encoding, callback) => {
        callback(null, '<base href="/__PATH_PREFIX__/">');
      });

      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const sendFileFn = mockResponse.sendFile as jest.Mock;
      sendFileFn('/path/to/index.html');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockResponse.send).toHaveBeenCalledWith('<base href="/">');
    });
  });
});
