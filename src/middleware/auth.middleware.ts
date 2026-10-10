import { Request, Response, NextFunction } from 'express';
import { AuthService, UserSessionData } from '../services/auth.service.js';

export interface AuthenticatedRequest extends Request {
  user?: UserSessionData;
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || (req.headers['x-session-token'] as string);
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  if (!token) {
    return next();
  }

  try {
    const session = await AuthService.getSession(token);
    if (session) {
      req.user = session;
    }
  } catch (err) {
    console.error('[AuthMiddleware] Error fetching session:', err);
  }

  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in to access this resource.',
    });
  }
  next();
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const hasRole = req.user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Authorized roles required: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

export function requireScope(allowedScopeType: 'COLLEGE' | 'DEPARTMENT') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    // System admin and institutional registrar have global scope
    if (req.user.roles.includes('SYSTEM_ADMIN') || req.user.roles.includes('REGISTRAR')) {
      return next();
    }

    const targetScopeId = (req.body?.collegeId || req.query?.collegeId || req.params?.collegeId) as string;
    if (!targetScopeId) {
      return next();
    }

    const match = req.user.scopes.some(
      (s) => s.scopeType === 'GLOBAL' || (s.scopeType === allowedScopeType && s.scopeId === targetScopeId)
    );

    if (!match) {
      return res.status(403).json({
        success: false,
        error: `Cross-organizational access denied. You are only authorized for your assigned ${allowedScopeType.toLowerCase()} scope.`,
      });
    }

    next();
  };
}
