import type { ApiErrorResponse } from '../../shared/types';

const DEFAULT_ERROR_MESSAGE = '\u64cd\u4f5c\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002';

type ApiErrorDetail = ApiErrorResponse['error'] & { conflict?: unknown };

function errorDetail(payload: unknown): ApiErrorDetail | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const detail = error as Partial<ApiErrorDetail>;
  if (typeof detail.message !== 'string' || typeof detail.code !== 'string') return null;
  return detail as ApiErrorDetail;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly conflict?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isVersionConflictError(error: unknown): error is ApiError {
  return error instanceof ApiError
    && error.status === 409
    && (error.code.endsWith('_VERSION_CONFLICT') || error.code === 'EQUIPMENT_VERSION_CONFLICT');
}

export function getApiErrorMessage(payload: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  return errorDetail(payload)?.message ?? fallback;
}

export async function readApiError(
  response: Response,
  fallback = DEFAULT_ERROR_MESSAGE,
): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the fallback for empty or non-JSON error responses.
  }
  const detail = errorDetail(payload);
  return new ApiError(
    detail?.message ?? fallback,
    response.status,
    detail?.code ?? 'UNKNOWN_ERROR',
    detail?.conflict,
  );
}

export async function readApiJson<T>(response: Response, fallback = DEFAULT_ERROR_MESSAGE): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(fallback, response.status, 'INVALID_RESPONSE');
  }

  const detail = errorDetail(payload);
  if (!response.ok || detail) {
    throw new ApiError(
      detail?.message ?? fallback,
      response.status,
      detail?.code ?? 'UNKNOWN_ERROR',
      detail?.conflict,
    );
  }

  return payload as T;
}
