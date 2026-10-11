import { useCallback, useEffect, useRef, useState } from 'react';
import { executeOptimisticMutation } from '../lib/useOptimisticSave';

/**
 * 戰役資料更新支援的 HTTP 請求方法
 */
export type CampaignMutationMethod = 'PATCH' | 'POST' | 'DELETE';

/**
 * 失敗時暫存的更新請求物件，用於提供使用者重試（Retry）
 */
export type CampaignMutationRequest = {
  path: string;
  method: CampaignMutationMethod;
  payload: object;
  action: string;
  successMessage?: string;
};

/**
 * 版本衝突資訊，用於顯示被其他玩家更新的欄位與版本差異
 */
export type CampaignMutationConflict = {
  fields: string[];
  expectedVersion: number;
  currentVersion: number;
};

/**
 * useCampaignMutation Hook 的設定選項
 */
type UseCampaignMutationOptions<TState extends { version: number }> = {
  /** 目前的戰役資料狀態（包含樂觀鎖的 version 欄位） */
  state: TState | null;
  /** 當更新成功或發生版本衝突拉回最新資料時觸發的狀態更新回呼 */
  onStateChange: (state: TState) => void;
  /** 計算新舊狀態之間哪些欄位被其他人修改，用於顯示在衝突提示面板 */
  computeChangedFields: (before: TState, latest: TState) => string[];
  /** 預設成功訊息產生器（可依 HTTP status 如 201 Created 客製） */
  defaultSuccessMessage?: (responseStatus: number) => string;
};

/**
 * 戰役樂觀鎖變更通用 Hook (useCampaignMutation)
 *
 * 【主要職責】
 * 1. 統一管理戰役狀態（地圖、馬車等）的樂觀鎖（Optimistic Locking）寫入流程。
 * 2. 自動帶入 expectedVersion，偵測伺服器 409 Conflict（版本衝突）。
 * 3. 處理失敗請求的暫存與重試機制（Retry）。
 * 4. 統一管理 Toast 訊息（成功、錯誤、401 需重新登入、網路失敗）。
 * 5. 提供外部非 mutate 操作的忙碌狀態鎖（beginExternal / endExternal）。
 */
export function useCampaignMutation<TState extends { version: number }>({
  state,
  onStateChange,
  computeChangedFields,
  defaultSuccessMessage = responseStatus => responseStatus === 201 ? '已新增紀錄。' : '資料已更新。',
}: UseCampaignMutationOptions<TState>) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'error'>('success');
  const [failedMutation, setFailedMutation] = useState<CampaignMutationRequest | null>(null);
  const [versionConflict, setVersionConflict] = useState<CampaignMutationConflict | null>(null);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [savedAction, setSavedAction] = useState('');
  const stateRef = useRef(state);
  const optionsRef = useRef({ onStateChange, computeChangedFields, defaultSuccessMessage });
  const busyRef = useRef('');
  const savedTimerRef = useRef<number | null>(null);

  stateRef.current = state;
  optionsRef.current = { onStateChange, computeChangedFields, defaultSuccessMessage };

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
    options?: { successMessage?: string },
  ): Promise<boolean> => {
    const current = stateRef.current;
    if (!current || busyRef.current) return false;

    const request = { path, method, payload, action, successMessage: options?.successMessage };
    busyRef.current = action;
    setBusy(action);
    setSavedAction('');
    clearMutationContext();
    setMessage('');
    setMessageKind('success');

    try {
      const result = await executeOptimisticMutation<TState, object, TState>({
        url: path,
        method,
        payload,
        expectedVersion: current.version,
        fallbackMessage: '資料格式不正確，請檢查輸入內容。',
        computeChangedFields: latest => optionsRef.current.computeChangedFields(current, latest),
      });

      if (result.status === 'conflict') {
        optionsRef.current.onStateChange(result.conflict.latest);
        setFailedMutation(request);
        setVersionConflict({
          fields: result.conflict.changedFields,
          expectedVersion: current.version,
          currentVersion: result.conflict.currentVersion,
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
          setMessage(result.error.status === 0
            ? '無法連線到伺服器，請檢查網路後重試。'
            : '伺服器暫時無法完成儲存，請稍後重試。');
        } else {
          setMessage(result.error.message);
        }
        return false;
      }

      if (result.status === 'busy') return false;

      optionsRef.current.onStateChange(result.data);
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
    return mutate(
      failedMutation.path,
      failedMutation.method,
      failedMutation.payload,
      failedMutation.action,
      { successMessage: failedMutation.successMessage },
    );
  }, [failedMutation, mutate]);

  const adoptLatest = useCallback((nextMessage: string) => {
    clearMutationContext();
    showSuccess(nextMessage);
  }, [clearMutationContext, showSuccess]);

  return {
    /** 當前正在執行的操作識別字串（非空代表正在與伺服器通訊） */
    busy,
    /** 目前提示訊息內容（顯示於 Toast） */
    message,
    /** 提示訊息類型：'success' | 'error' */
    messageKind,
    /** 版本衝突物件，若有值代表伺服器版本較新且已被覆蓋 */
    versionConflict,
    /** 是否因為 401 Unauthorized 需要使用者重新登入 */
    reauthRequired,
    /** 最近一次成功儲存的操作識別字串（用於短暫顯示打勾/綠燈動畫） */
    savedAction,
    /** 是否有失敗請求可供點擊重試 */
    canRetry: Boolean(failedMutation),
    /** 執行樂觀鎖 API 更新（回傳 boolean 表示成功與否） */
    mutate,
    /** 重新執行上次失敗的更新操作 */
    retry,
    /** 接受最新版本資料並清除衝突提示 */
    adoptLatest,
    /** 清除目前 Toast 提示 */
    clearToast,
    /** 主動觸發成功提示訊息 */
    showSuccess,
    /** 主動觸發錯誤提示訊息 */
    showError,
    /** 啟動外部非 mutate 操作的 busy 鎖定（例如上傳、放置 Token） */
    beginExternal,
    /** 結束外部操作的 busy 鎖定 */
    endExternal,
  };
}
