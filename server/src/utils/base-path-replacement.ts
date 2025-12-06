import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

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

    // Store original sendFile function
    const originalSendFile = res.sendFile.bind(res);

    // Override sendFile to intercept static file serving
    res.sendFile = function (
      filePath: string,
      options?: any,
      callback?: any,
    ): void {
      // Determine the actual file path
      const resolvedPath =
        typeof options === 'object' && options?.root
          ? path.join(options.root, filePath)
          : filePath;

      // Check if this is an HTML or JS file
      const isHtmlOrJs =
        resolvedPath.endsWith('.html') ||
        resolvedPath.endsWith('.js') ||
        resolvedPath.endsWith('.mjs');

      if (isHtmlOrJs) {
        // Read the file and replace the placeholder
        readFile(resolvedPath, 'utf-8')
          .then((content) => {
            const replacedContent = content.replace(placeholderRegex, basePath);

            // Set appropriate content type
            if (resolvedPath.endsWith('.html')) {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
            } else {
              res.setHeader(
                'Content-Type',
                'application/javascript; charset=utf-8',
              );
            }

            res.send(replacedContent);

            // Call the callback if provided
            if (typeof callback === 'function') {
              callback(null);
            } else if (typeof options === 'function') {
              options(null);
            }
          })
          .catch(() => {
            // If reading fails, fall back to original sendFile
            if (typeof callback === 'function') {
              originalSendFile(filePath, options, callback);
            } else if (typeof options === 'function') {
              originalSendFile(filePath, options);
            } else {
              originalSendFile(filePath, options);
            }
          });
      } else {
        // For non-HTML/JS files, use original sendFile
        if (typeof callback === 'function') {
          originalSendFile(filePath, options, callback);
        } else if (typeof options === 'function') {
          originalSendFile(filePath, options);
        } else {
          originalSendFile(filePath, options);
        }
      }
    } as any;

    next();
  };
}
