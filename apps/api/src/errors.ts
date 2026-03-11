import type { Request, Response } from 'express';

type PgLikeError = {
  code?: string;
  message?: string;
  detail?: string;
  column?: string;
  table?: string;
  constraint?: string;
};

function isPgError(error: unknown): error is PgLikeError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function handleApiError(error: unknown, _req: Request, res: Response) {
  if (isPgError(error)) {
    const message = error.message ?? 'Database operation failed';
    if (error.code === '42703') {
      res.status(500).json({
        error: 'Database schema mismatch',
        message: `Save failed because database column ${error.column ?? 'unknown'} is missing. Run migrations and redeploy.`,
        details: error.detail ?? message
      });
      return;
    }

    if (error.code === '42P01') {
      res.status(500).json({
        error: 'Database schema mismatch',
        message: `Save failed because table ${error.table ?? 'unknown'} is missing. Run migrations and redeploy.`,
        details: error.detail ?? message
      });
      return;
    }

    if (error.code === '23514') {
      res.status(400).json({
        error: 'Validation failed',
        message: error.constraint
          ? `Save failed due to constraint ${error.constraint}. Please review your values.`
          : 'Save failed due to a database validation constraint.',
        details: error.detail ?? message
      });
      return;
    }
  }

  console.error('[api] Unhandled route error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error instanceof Error ? error.message : 'An unexpected error occurred'
  });
}
