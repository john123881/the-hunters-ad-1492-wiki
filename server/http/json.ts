import type { Context } from 'hono';

export interface ParseJsonOptions {
  code?: string;
  message?: string;
}

export type ParseJsonResult<T> =
  | { success: true; data: T }
  | { success: false; response: Response };

/**
 * Safely parse JSON body from Hono Context.
 * If JSON parsing fails, returns { success: false, response: 400 Response }.
 * Otherwise, returns { success: true, data: T }.
 */
export async function parseJsonBody<T = Record<string, unknown>>(
  c: Context,
  options?: ParseJsonOptions,
): Promise<ParseJsonResult<T>> {
  try {
    const data: unknown = await c.req.json();
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('JSON body must be an object');
    }
    return { success: true, data: data as T };
  } catch {
    const code = options?.code ?? 'INVALID_JSON';
    const message = options?.message ?? '請提供有效的 JSON 資料。';
    const response = c.json({ error: { code, message } }, 400);
    return { success: false, response };
  }
}
