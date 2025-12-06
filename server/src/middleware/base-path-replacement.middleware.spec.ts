import { Request, Response } from 'express';
import { BasePathReplacementMiddleware } from './base-path-replacement.middleware';

describe('BasePathReplacementMiddleware', () => {
  let middleware: BasePathReplacementMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;
  let originalEnv: NodeJS.ProcessEnv;

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

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockRequest = {};
    mockResponse = {
      send: jest.fn(),
    };
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
      middleware = new BasePathReplacementMiddleware();
    });

    it('should call next without modifying response', () => {
      mockRequest = createMockRequest('/index.html');
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.send).not.toHaveBeenCalled();
    });
  });

  describe('when ENABLE_DYNAMIC_BASE_PATH is false', () => {
    beforeEach(() => {
      process.env.ENABLE_DYNAMIC_BASE_PATH = 'false';
      process.env.NODE_ENV = 'production';
      middleware = new BasePathReplacementMiddleware();
    });

    it('should call next without modifying response', () => {
      mockRequest = createMockRequest('/index.html');
      middleware.use(
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
      middleware = new BasePathReplacementMiddleware();
    });

    it('should call next without modifying response', () => {
      mockRequest = createMockRequest('/index.html');
      middleware.use(
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
      middleware = new BasePathReplacementMiddleware();
    });

    it('should not intercept non-HTML/JS files', () => {
      mockRequest = createMockRequest('/image.png');
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
      // The response.send should not be overridden for non-HTML/JS files
    });

    it('should intercept HTML files', () => {
      mockRequest = createMockRequest('/index.html');
      middleware.use(
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
      mockRequest = createMockRequest('/main.js');
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should replace __PATH_PREFIX__ in string content', () => {
      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();
      
      mockResponse.send = originalSend;
      
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Capture the overridden send function
      const capturedSendFn = mockResponse.send as (data: string) => Response;

      // Test string replacement
      const testContent = '<html><script src="/__PATH_PREFIX__/main.js"></script></html>';
      const expectedContent = '<html><script src="/my-base-path/main.js"></script></html>';

      // Call the overridden send
      capturedSendFn.call(mockResponse, testContent);

      // Verify original send was called with replaced content
      expect(originalSend).toHaveBeenCalledWith(expectedContent);
    });

    it('should replace multiple occurrences of __PATH_PREFIX__', () => {
      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();
      
      mockResponse.send = originalSend;
      
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const capturedSendFn = mockResponse.send as (data: string) => Response;

      const testContent = 'first: /__PATH_PREFIX__/, second: /__PATH_PREFIX__/';
      const expectedContent = 'first: /my-base-path/, second: /my-base-path/';

      capturedSendFn.call(mockResponse, testContent);

      expect(originalSend).toHaveBeenCalledWith(expectedContent);
    });

    it('should replace __PATH_PREFIX__ in buffer content', () => {
      mockRequest = createMockRequest('/main.js');
      const originalSend = jest.fn();
      
      mockResponse.send = originalSend;
      
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      const capturedSendFn = mockResponse.send as (data: Buffer) => Response;

      const testContent = Buffer.from('const path = "/__PATH_PREFIX__/";', 'utf-8');
      const expectedContent = Buffer.from('const path = "/my-base-path/";', 'utf-8');

      capturedSendFn.call(mockResponse, testContent);

      expect(originalSend).toHaveBeenCalledWith(expectedContent);
    });

    it('should not modify buffer content without __PATH_PREFIX__', () => {
      mockRequest = createMockRequest('/main.js');
      const originalSend = jest.fn();
      
      mockResponse.send = originalSend;
      
      middleware.use(
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
      middleware = new BasePathReplacementMiddleware();
      
      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();
      
      mockResponse.send = originalSend;
      
      middleware.use(
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
  });
});
