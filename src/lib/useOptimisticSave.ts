import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiError, isVersionConflictError, readApiJson } from './apiClient';

export interface OptimisticSaveConflict<TLatest = unknown> {
  scope: string;
  expectedVersion: number | null;
  currentVersion: number;
  latest: TLatest;
  changedFields: string[];
}

export type OptimisticSaveResult<TSaved, TLatest> =
  | { status: 'saved'; data: TSaved; responseStatus: number }
  | { status: 'conflict'; conflict: OptimisticSaveConflict<TLatest> }
  | { status: 'error'; error: ApiError }
  | { status: 'busy' };

export interface UseOptimisticSaveOptions<TSaved, TLatest> {
  onSuccess?: (savedData: TSaved) => void;
  computeChangedFields?: (latest: TLatest) => string[];
  successMessage?: string;
}

export interface UseOptimisticSaveReturn<TSaved, TPayload, TLatest> {
  saving: boolean;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  message: string;
  setMessage: (msg: string) => void;
  messageKind: 'success' | 'error' | '';
  conflict: OptimisticSaveConflict<TLatest> | null;
  setConflict: (conflict: OptimisticSaveConflict<TLatest> | null) => void;
  save: (
    url: string,
    payload: TPayload,
    options?: {
      method?: 'PUT' | 'PATCH' | 'POST' | 'DELETE';
      expectedVersion?: number | null;
      customSuccessMessage?: string;
      optimisticUpdate?: () => void;
      rollback?: () => void;
    },
  ) => Promise<OptimisticSaveResult<TSaved, TLatest>>;
  resetConflict: () => void;
}

export interface OptimisticMutationOptions<TPayload, TLatest> {
  url: string;
  method?: 'PUT' | 'PATCH' | 'POST' | 'DELETE';
  payload: TPayload;
  expectedVersion?: number | null;
  fallbackMessage?: string;
  optimisticUpdate?: () => void;
  rollback?: () => void;
  computeChangedFields?: (latest: TLatest) => string[];
}

export async function executeOptimisticMutation<TSaved, TPayload = object, TLatest = TSaved>(
  options: OptimisticMutationOptions<TPayload, TLatest>,
): Promise<OptimisticSaveResult<TSaved, TLatest>> {
  options.optimisticUpdate?.();
  try {
    const response = await fetch(options.url, {
      method: options.method ?? 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(options.payload as Record<string, unknown>),
        ...(options.expectedVersion !== undefined ? { expectedVersion: options.expectedVersion } : {}),
      }),
    });
    const result = await readApiJson<{ data: TSaved }>(response, options.fallbackMessage);

    return { status: 'saved', data: result.data, responseStatus: response.status };
  } catch (cause) {
    options.rollback?.();
    const error = cause instanceof ApiError
      ? cause
      : new ApiError(
        cause instanceof Error ? cause.message : (options.fallbackMessage ?? '網路連線失敗，請稍後重試。'),
        0,
        'NETWORK_ERROR',
      );
    const conflictInfo = error.conflict as {
      scope?: string;
      expectedVersion?: number | null;
      currentVersion?: number;
      latest?: TLatest;
    } | undefined;
    if (
      isVersionConflictError(error)
      && conflictInfo?.scope
      && typeof conflictInfo.currentVersion === 'number'
      && conflictInfo.latest !== undefined
    ) {
      const conflict: OptimisticSaveConflict<TLatest> = {
        scope: conflictInfo.scope,
        expectedVersion: conflictInfo.expectedVersion ?? null,
        currentVersion: conflictInfo.currentVersion,
        latest: conflictInfo.latest,
        changedFields: options.computeChangedFields?.(conflictInfo.latest) ?? ['最新版本資料'],
      };
      return { status: 'conflict', conflict };
    }
    return { status: 'error', error };
  }
}

export function useUnsavedChangesWarning(
  isDirty: boolean,
  message = '目前有尚未儲存的修改，確定要離開嗎？',
) {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const handleLinkClick = (event: MouseEvent) => {
      if (
        !isDirtyRef.current
        || event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return;

      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      const destinationChanged = destination.origin !== current.origin
        || destination.pathname !== current.pathname
        || destination.search !== current.search
        || destination.hash !== current.hash;

      if (destinationChanged && !window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleLinkClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [message]);
}

/**
 * 統一管理樂觀鎖儲存、版本衝突與未儲存狀態。
 * TSaved 是成功回應 data 的形狀；TLatest 是 conflict.latest 的形狀。
 */
export function useOptimisticSave<TSaved = unknown, TPayload = unknown, TLatest = TSaved>(
  initialOptions: UseOptimisticSaveOptions<TSaved, TLatest> = {},
): UseOptimisticSaveReturn<TSaved, TPayload, TLatest> {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'error' | ''>('');
  const [conflict, setConflict] = useState<OptimisticSaveConflict<TLatest> | null>(null);

  const savingRef = useRef(false);
  const optionsRef = useRef(initialOptions);
  optionsRef.current = initialOptions;

  useUnsavedChangesWarning(isDirty);

  const resetConflict = useCallback(() => {
    setConflict(null);
  }, []);

  const save = useCallback(
    async (
      url: string,
      payload: TPayload,
      options?: {
        method?: 'PUT' | 'PATCH' | 'POST' | 'DELETE';
        expectedVersion?: number | null;
        customSuccessMessage?: string;
        optimisticUpdate?: () => void;
        rollback?: () => void;
      },
    ): Promise<OptimisticSaveResult<TSaved, TLatest>> => {
      if (savingRef.current) return { status: 'busy' };
      savingRef.current = true;
      setSaving(true);
      setMessage('');
      setMessageKind('');

      try {
        const result = await executeOptimisticMutation<TSaved, TPayload, TLatest>({
          url,
          method: options?.method,
          payload,
          expectedVersion: options?.expectedVersion,
          optimisticUpdate: options?.optimisticUpdate,
          rollback: options?.rollback,
          computeChangedFields: optionsRef.current.computeChangedFields,
          fallbackMessage: '儲存失敗，請稍後重試。',
        });

        if (result.status === 'conflict') {
          setConflict(result.conflict);
          return result;
        }
        if (result.status === 'error') {
          setMessage(result.error.message);
          setMessageKind('error');
          return result;
        }
        if (result.status === 'busy') return result;

        setIsDirty(false);
        setConflict(null);
        setMessage(options?.customSuccessMessage ?? optionsRef.current.successMessage ?? '儲存成功。');
        setMessageKind('success');
        optionsRef.current.onSuccess?.(result.data);
        return result;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [],
  );

  return {
    saving,
    loading,
    setLoading,
    isDirty,
    setIsDirty,
    message,
    setMessage,
    messageKind,
    conflict,
    setConflict,
    save,
    resetConflict,
  };
}
