import { useEffect, useState } from 'react';
import { ApiError, fetchApi } from './api';

type State<T> = { path: string; data?: T; error?: ApiError; loading: boolean };

export function useApi<T>(path: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State<T>>({ path, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ path, loading: true });
    fetchApi<T>(path, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ path, data, loading: false }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ path, loading: false,
          error: error instanceof ApiError ? error : new ApiError('無法讀取資料，請稍後重試。', 0) });
      });
    return () => controller.abort();
  }, [path, attempt]);
  const current = state.path === path ? state : { path, loading: true };
  return { ...current, retry: () => setAttempt(value => value + 1) };
}
