import { Request, Response, NextFunction } from 'express';

/**
 * Creates middleware that dynamically replaces __PATH_PREFIX__ placeholder in HTML and JS files
 * with the actual BASE_PATH environment variable value.
 *
 * This allows the application to work on read-only file systems where the start.sh script
 * cannot modify files at runtime.
 *
 * Only activated when ENABLE_DYNAMIC_BASE_PATH environment variable is set to 'true'.
 */
export function createBasePathReplacementMiddleware() {
  const enabled = process.env.ENABLE_DYNAMIC_BASE_PATH === 'true';
  const basePath = process.env.BASE_PATH?.trim() || '';
  const placeholderRegex = /\/__PATH_PREFIX__/g;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if not enabled or not in production
    if (!enabled || process.env.NODE_ENV !== 'production') {
      return next();
    }

    // Store original send and end functions
    const originalSend = res.send;
    const originalEnd = res.end;

    // Helper function to process and replace content
    const processContent = (data: any): any => {
      // Check if this is an HTML or JS file based on Content-Type header
      const contentType = res.getHeader('Content-Type')?.toString() || '';
      const isHtmlOrJs =
        contentType.includes('text/html') ||
        contentType.includes('application/javascript') ||
        contentType.includes('text/javascript');

      if (isHtmlOrJs) {
        // Only process string/buffer data
        if (typeof data === 'string') {
          return data.replace(placeholderRegex, basePath);
        } else if (Buffer.isBuffer(data)) {
          const content = data.toString('utf-8');
          if (content.includes('__PATH_PREFIX__')) {
            return Buffer.from(
              content.replace(placeholderRegex, basePath),
              'utf-8',
            );
          }
        }
      }
      return data;
    };

    // Override send function to replace placeholder
    res.send = function (data: any): Response {
      data = processContent(data);
      return originalSend.call(this, data);
    };

    // Override end function to catch sendFile and other cases
    res.end = function (chunk?: any, encoding?: any, callback?: any): Response {
      if (chunk) {
        chunk = processContent(chunk);
      }
      // Handle the different signatures of res.end()
      if (typeof encoding === 'function') {
        return originalEnd.call(this, chunk, encoding);
      } else if (typeof callback === 'function') {
        return originalEnd.call(this, chunk, encoding, callback);
      } else {
        return originalEnd.call(this, chunk, encoding);
      }
    } as any;

    next();
  };
}
