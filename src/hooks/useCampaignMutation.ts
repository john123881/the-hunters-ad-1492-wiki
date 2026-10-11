import { useCallback, useEffect, useRef, useState } from 'react';
import { executeOptimisticMutation } from '../lib/useOptimisticSave';

export type CampaignMutationMethod = 'PATCH' | 'POST' | 'PUT' | 'DELETE';

export type CampaignMutationRequest = {
  path: string;
  method: CampaignMutationMethod;
  payload: object;
  action: string;
  successMessage?: string;
};

export type CampaignMutationConflict<TState> = {
  fields: string[];
  expectedVersion: number | null;
  currentVersion: number;
  latest: TState;
};

type UseCampaignMutationOptions<TState extends { version: number | null }, TSaved = TState, TLatest = TState> = {
  state: TState | null;
  onStateChange: (state: TState) => void;
  onConflictStateChange?: (state: TState) => void;
  selectSavedState?: (saved: TSaved) => TState;
  selectConflictState?: (latest: TLatest) => TState;
  computeChangedFields: (before: TState, latest: TState) => string[];
  defaultSuccessMessage?: (responseStatus: number) => string;
};

export function useCampaignMutation<TState extends { version: number | null }, TSaved = TState, TLatest = TState>({
  state,
  onStateChange,
  onConflictStateChange = onStateChange,
  selectSavedState = saved => saved as unknown as TState,
  selectConflictState = latest => latest as unknown as TState,
  computeChangedFields,
  defaultSuccessMessage = responseStatus => responseStatus === 201 ? '已新增紀錄。' : '資料已更新。',
}: UseCampaignMutationOptions<TState, TSaved, TLatest>) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'error'>('success');
  const [failedMutation, setFailedMutation] = useState<CampaignMutationRequest | null>(null);
  const [versionConflict, setVersionConflict] = useState<CampaignMutationConflict<TState> | null>(null);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [savedAction, setSavedAction] = useState('');
  const stateRef = useRef(state);
  const optionsRef = useRef({ onStateChange, onConflictStateChange, selectSavedState, selectConflictState, computeChangedFields, defaultSuccessMessage });
  const busyRef = useRef('');
  const savedTimerRef = useRef<number | null>(null);

  stateRef.current = state;
  optionsRef.current = { onStateChange, onConflictStateChange, selectSavedState, selectConflictState, computeChangedFields, defaultSuccessMessage };

  useEffect(() => () => {
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
  }, []);

  const clearToast = useCallback(() => setMessage(''), []);

  const showSuccess = useCallback((nextMessage: string) => {
    setReauthRequired(false);
    setMessageKind('success');
    setMessage(nextMessage);
  }, []);

  const showError = useCallback((nextMessage: string, options?: { reauthRequired?: boolean }) => {
    setMessageKind('error');
    setMessage(nextMessage);
    setReauthRequired(Boolean(options?.reauthRequired));
  }, []);

  const clearMutationContext = useCallback(() => {
    setFailedMutation(null);
    setVersionConflict(null);
    setReauthRequired(false);
  }, []);

  const beginExternal = useCallback((action: string) => {
    if (busyRef.current) return false;
    busyRef.current = action;
    setBusy(action);
    setSavedAction('');
    clearMutationContext();
    setMessage('');
    return true;
  }, [clearMutationContext]);

  const endExternal = useCallback(() => {
    busyRef.current = '';
    setBusy('');
  }, []);

  const mutate = useCallback(async (
    path: string,
    method: CampaignMutationMethod,
    payload: object,
    action: string,
    options?: { successMessage?: string; expectedVersion?: number | null },
  ): Promise<boolean> => {
    const current = stateRef.current;
    if (!current || busyRef.current) return false;

    const request = { path, method, payload, action, successMessage: options?.successMessage };
    const expectedVersion = options && 'expectedVersion' in options ? options.expectedVersion ?? null : current.version;
    busyRef.current = action;
    setBusy(action);
    setSavedAction('');
    clearMutationContext();
    setMessage('');
    setMessageKind('success');

    try {
      const result = await executeOptimisticMutation<TSaved, object, TLatest>({
        url: path,
        method,
        payload,
        expectedVersion,
        fallbackMessage: '資料格式不正確，請檢查輸入內容。',
        computeChangedFields: latest => optionsRef.current.computeChangedFields(current, optionsRef.current.selectConflictState(latest)),
      });

      if (result.status === 'conflict') {
        const latest = optionsRef.current.selectConflictState(result.conflict.latest);
        optionsRef.current.onConflictStateChange(latest);
        setFailedMutation(request);
        setVersionConflict({
          fields: result.conflict.changedFields,
          expectedVersion,
          currentVersion: result.conflict.currentVersion,
          latest,
        });
        setMessageKind('error');
        setMessage('');
        return false;
      }

      if (result.status === 'error') {
        setMessageKind('error');
        if (result.error.status === 401) {
          setReauthRequired(true);
          setMessage('登入已失效，請重新登入後再操作。');
        } else if (result.error.status === 409) {
          setMessage(result.error.message || '資料發生衝突，請檢查後再試。');
        } else if (result.error.status >= 500 || result.error.status === 0) {
          setFailedMutation(request);
          setMessage(result.error.status === 0 ? '無法連線到伺服器，請檢查網路後重試。' : '伺服器暫時無法完成儲存，請稍後重試。');
        } else {
          setMessage(result.error.message);
        }
        return false;
      }

      if (result.status === 'busy') return false;

      optionsRef.current.onStateChange(optionsRef.current.selectSavedState(result.data));
      setVersionConflict(null);
      setMessageKind('success');
      setMessage(request.successMessage ?? optionsRef.current.defaultSuccessMessage(result.responseStatus));
      setSavedAction(action);
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSavedAction(''), 1800);
      return true;
    } finally {
      busyRef.current = '';
      setBusy('');
    }
  }, [clearMutationContext]);

  const retry = useCallback(async () => {
    if (!failedMutation) return false;
    return mutate(failedMutation.path, failedMutation.method, failedMutation.payload, failedMutation.action, { successMessage: failedMutation.successMessage });
  }, [failedMutation, mutate]);

  const adoptLatest = useCallback((nextMessage: string) => {
    clearMutationContext();
    showSuccess(nextMessage);
  }, [clearMutationContext, showSuccess]);

  return {
    busy,
    message,
    messageKind,
    versionConflict,
    reauthRequired,
    savedAction,
    canRetry: Boolean(failedMutation),
    mutate,
    retry,
    adoptLatest,
    clearToast,
    showSuccess,
    showError,
    beginExternal,
    endExternal,
  };
}
