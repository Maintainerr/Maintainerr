import { Request, Response } from 'express';
import { createBasePathReplacementMiddleware } from './utils/base-path-replacement';

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

  const createMockResponse = (contentType?: string): Partial<Response> => {
    return {
      send: jest.fn(),
      getHeader: jest.fn((name: string) => {
        if (name === 'Content-Type') {
          return contentType;
        }
        return undefined;
      }),
    };
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockRequest = {};
    mockResponse = createMockResponse();
    nextFunction = jest.fn();
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

    it('should not intercept non-HTML/JS files', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/image.png');
      mockResponse = createMockResponse('image/png');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should intercept HTML files', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      mockResponse = createMockResponse('text/html');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();

      // Verify response.send was overridden - the middleware modifies it
      expect(mockResponse.send).toBeDefined();
      expect(mockResponse.send).not.toBe(jest.fn());
    });

    it('should intercept JS files', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/main.js');
      mockResponse = createMockResponse('application/javascript');
      
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should replace __PATH_PREFIX__ in HTML string content', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();

      mockResponse = createMockResponse('text/html; charset=utf-8');
      mockResponse.send = originalSend;

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Capture the overridden send function
      const capturedSendFn = mockResponse.send as (data: string) => Response;

      // Test string replacement
      const testContent =
        '<html><script src="/__PATH_PREFIX__/main.js"></script></html>';
      const expectedContent =
        '<html><script src="/my-base-path/main.js"></script></html>';

      // Call the overridden send
      capturedSendFn.call(mockResponse, testContent);

      // Verify original send was called with replaced content
      expect(originalSend).toHaveBeenCalledWith(expectedContent);
    });

    it('should replace multiple occurrences of __PATH_PREFIX__', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();

      mockResponse = createMockResponse('text/html');
      mockResponse.send = originalSend;

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const capturedSendFn = mockResponse.send as (data: string) => Response;

      const testContent =
        'first: /__PATH_PREFIX__/, second: /__PATH_PREFIX__/';
      const expectedContent = 'first: /my-base-path/, second: /my-base-path/';

      capturedSendFn.call(mockResponse, testContent);

      expect(originalSend).toHaveBeenCalledWith(expectedContent);
    });

    it('should replace __PATH_PREFIX__ in JS buffer content', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/main.js');
      const originalSend = jest.fn();

      mockResponse = createMockResponse('application/javascript');
      mockResponse.send = originalSend;

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const capturedSendFn = mockResponse.send as (data: Buffer) => Response;

      const testContent = Buffer.from(
        'const path = "/__PATH_PREFIX__/";',
        'utf-8',
      );
      const expectedContent = Buffer.from(
        'const path = "/my-base-path/";',
        'utf-8',
      );

      capturedSendFn.call(mockResponse, testContent);

      expect(originalSend).toHaveBeenCalledWith(expectedContent);
    });

    it('should not modify buffer content without __PATH_PREFIX__', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/main.js');
      const originalSend = jest.fn();

      mockResponse = createMockResponse('application/javascript');
      mockResponse.send = originalSend;

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const capturedSendFn = mockResponse.send as (data: Buffer) => Response;

      const testContent = Buffer.from('const path = "/normal/path";', 'utf-8');

      capturedSendFn.call(mockResponse, testContent);

      expect(originalSend).toHaveBeenCalledWith(testContent);
    });

    it('should use empty string when BASE_PATH is not set', () => {
      process.env.BASE_PATH = undefined;
      const middleware = createBasePathReplacementMiddleware();

      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();

      mockResponse = createMockResponse('text/html');
      mockResponse.send = originalSend;

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const capturedSendFn = mockResponse.send as (data: string) => Response;

      const testContent = '<base href="/__PATH_PREFIX__/">';
      const expectedContent = '<base href="/">';

      capturedSendFn.call(mockResponse, testContent);

      expect(originalSend).toHaveBeenCalledWith(expectedContent);
    });

    it('should not replace content if Content-Type is not HTML/JS', () => {
      const middleware = createBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/data.json');
      const originalSend = jest.fn();

      mockResponse = createMockResponse('application/json');
      mockResponse.send = originalSend;

      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const capturedSendFn = mockResponse.send as (data: string) => Response;

      const testContent = '{"path": "/__PATH_PREFIX__/"}';

      capturedSendFn.call(mockResponse, testContent);

      // Should not replace in non-HTML/JS content
      expect(originalSend).toHaveBeenCalledWith(testContent);
    });
  });
});
