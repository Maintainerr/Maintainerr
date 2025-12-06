import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that dynamically replaces __PATH_PREFIX__ placeholder in HTML and JS files
 * with the actual BASE_PATH environment variable value.
 *
 * This allows the application to work on read-only file systems where the start.sh script
 * cannot modify files at runtime.
 *
 * Only activated when ENABLE_DYNAMIC_BASE_PATH environment variable is set to 'true'.
 */
@Injectable()
export class BasePathReplacementMiddleware implements NestMiddleware {
  private readonly enabled: boolean;
  private readonly basePath: string;
  private readonly placeholderRegex = /\/__PATH_PREFIX__/g;

  constructor() {
    this.enabled = process.env.ENABLE_DYNAMIC_BASE_PATH === 'true';
    this.basePath = process.env.BASE_PATH?.trim() || '';
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Skip if not enabled or not in production
    if (!this.enabled || process.env.NODE_ENV !== 'production') {
      return next();
    }

    // Only intercept HTML and JS files
    const isHtmlOrJs = req.path.endsWith('.html') || req.path.endsWith('.js');
    if (!isHtmlOrJs) {
      return next();
    }

    // Store original send function
    const originalSend = res.send;
    const basePath = this.basePath;
    const placeholderRegex = this.placeholderRegex;

    // Override send function to replace placeholder
    res.send = function (data: any): Response {
      // Only process string/buffer data
      if (typeof data === 'string') {
        data = data.replace(placeholderRegex, basePath);
      } else if (Buffer.isBuffer(data)) {
        const content = data.toString('utf-8');
        if (content.includes('__PATH_PREFIX__')) {
          data = Buffer.from(content.replace(placeholderRegex, basePath), 'utf-8');
        }
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  }
}
