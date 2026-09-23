import type { ApiErrorResponse } from '../../shared/types';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function fetchApi<T>(path: string, signal: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  let response: Response;
  try {
    response = await fetch(path, { signal: AbortSignal.any([signal, timeout]), headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(timeout.aborted ? '讀取時間過長，請稍後重試。' : '無法連線至檔案館，請確認網路後重試。', 0);
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError('資料服務的回應格式不正確，請稍後重試。', response.status);
  }
  if (!response.ok) {
    const body = await response.json() as ApiErrorResponse;
    throw new ApiError(body.error?.message ?? '讀取失敗，請稍後重試。', response.status);
  }
  return response.json() as Promise<T>;
}
