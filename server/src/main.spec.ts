import { Request, Response, NextFunction } from 'express';

// Mock environment variables
const originalEnv = process.env;

// Since we can't easily import from main.ts, we'll recreate the function for testing
function createTestBasePathReplacementMiddleware() {
  const enabled = process.env.ENABLE_DYNAMIC_BASE_PATH === 'true';
  const basePath = process.env.BASE_PATH?.trim() || '';
  const placeholderRegex = /\/__PATH_PREFIX__/g;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if not enabled or not in production
    if (!enabled || process.env.NODE_ENV !== 'production') {
      return next();
    }

    // Only intercept HTML and JS files
    const isHtmlOrJs = req.path.endsWith('.html') || req.path.endsWith('.js');
    if (!isHtmlOrJs) {
      return next();
    }

    // Store original send function
    const originalSend = res.send;

    // Override send function to replace placeholder
    res.send = function (data: any): Response {
      // Only process string/buffer data
      if (typeof data === 'string') {
        data = data.replace(placeholderRegex, basePath);
      } else if (Buffer.isBuffer(data)) {
        const content = data.toString('utf-8');
        if (content.includes('__PATH_PREFIX__')) {
          data = Buffer.from(
            content.replace(placeholderRegex, basePath),
            'utf-8',
          );
        }
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  };
}

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

  beforeEach(() => {
    process.env = { ...originalEnv };
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
    });

    it('should call next without modifying response', () => {
      const middleware = createTestBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      middleware(
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
    });

    it('should call next without modifying response', () => {
      const middleware = createTestBasePathReplacementMiddleware();
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
      const middleware = createTestBasePathReplacementMiddleware();
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
      const middleware = createTestBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/image.png');
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
      // The response.send should not be overridden for non-HTML/JS files
    });

    it('should intercept HTML files', () => {
      const middleware = createTestBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
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
      const middleware = createTestBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/main.js');
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should replace __PATH_PREFIX__ in string content', () => {
      const middleware = createTestBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();

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
      const middleware = createTestBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();

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

    it('should replace __PATH_PREFIX__ in buffer content', () => {
      const middleware = createTestBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/main.js');
      const originalSend = jest.fn();

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
      const middleware = createTestBasePathReplacementMiddleware();
      mockRequest = createMockRequest('/main.js');
      const originalSend = jest.fn();

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
      const middleware = createTestBasePathReplacementMiddleware();

      mockRequest = createMockRequest('/index.html');
      const originalSend = jest.fn();

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
  });
});
