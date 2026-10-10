import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const statusCode = err.status || err.statusCode || 400;
  console.error(`[Error] [${req.method} ${req.url}]:`, err.message || err);

  res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected server error occurred.',
    timestamp: new Date().toISOString(),
  });
}

// In-memory rate limiter per IP for authentication & sensitive endpoints
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(maxRequests: number = 20, windowMs: number = 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = requestCounts.get(ip);

    if (!entry || entry.resetAt < now) {
      requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count++;
    if (entry.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please wait a moment before trying again.',
      });
    }

    next();
  };
}
