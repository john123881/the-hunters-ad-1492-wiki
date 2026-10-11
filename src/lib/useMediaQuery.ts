import { useCallback, useSyncExternalStore } from 'react';

export const MOBILE_PROGRESS_QUERY = '(max-width: 620px)';
export const COMPACT_MAP_EDITOR_QUERY = '(max-width: 720px), (max-height: 600px) and (pointer: coarse)';

const getServerSnapshot = () => false;

/**
 * 訂閱瀏覽器 Media Query，並交由 React 管理一致的外部狀態快照。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
  }, [query]);

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsMobileProgress(): boolean {
  return useMediaQuery(MOBILE_PROGRESS_QUERY);
}

export function useCompactMapEditor(): boolean {
  return useMediaQuery(COMPACT_MAP_EDITOR_QUERY);
}
