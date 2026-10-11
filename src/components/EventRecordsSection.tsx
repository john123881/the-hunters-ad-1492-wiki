import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { VersionConflictPanel } from './VersionConflictPanel';
import { useUnsavedChangesWarning } from '../lib/useOptimisticSave';
import type { ApiErrorResponse, CampaignMap, CampaignMapResponse } from '../../shared/types';

/**
 * 事件人工紀錄區塊 Props 介面
 */
interface EventRecordsSectionProps {
  /** 道路事件備忘錄初始內容 */
  initialRoadNotes: string;
  /** 城鎮事件備忘錄初始內容 */
  initialTownNotes: string;
  /** 當前地圖預期樂觀鎖版本號（用於防並行衝突） */
  expectedVersion?: number;
  /** 成功儲存後的資料回呼，回傳最新地圖物件 */
  onSaved?: (map: CampaignMap) => void;
  /** 當遭遇衝突時，玩家選擇「採用並載入最新版本」時的回呼 */
  onAdoptLatest?: (map: CampaignMap) => void;
  /** 成功操作時的 Toast 提示回呼 */
  onToast?: (message: string) => void;
  /** 發生錯誤時的錯誤訊息提示回呼 */
  onError?: (message: string) => void;
  /** 是否全面停用輸入與按鈕（例如未登入或檢視模式） */
  disabled?: boolean;
  /** 儲存狀態變更回呼（通知父元件是否正在發送網路請求） */
  onSavingChange?: (saving: boolean) => void;
  /** 呈現樣式變體：'map' 用於地圖頁，'wagon' 用於馬車面板 */
  variant?: 'map' | 'wagon';
}

/**
 * 事件人工紀錄共用區塊（道路事件卡 / 城鎮事件卡）
 *
 * 職責：
 * 1. 同時嵌入於「戰役馬車頁」與「戰役地圖頁」，兩處資料同步共享同一個地圖 DB 欄位。
 * 2. 支援道路事件卡（Road Card）與城鎮事件卡（Town Card）的多行筆記記錄。
 * 3. 內建尚未儲存修改偵測（isDirty）與防誤關防護（useUnsavedChangesWarning）。
 * 4. 內建 409 MAP_VERSION_CONFLICT 衝突處理與覆蓋／採用最新機制（VersionConflictPanel）。
 */
export function EventRecordsSection({
  initialRoadNotes,
  initialTownNotes,
  expectedVersion,
  onSaved,
  onAdoptLatest,
  onToast,
  onError,
  disabled = false,
  onSavingChange,
  variant = 'map',
}: EventRecordsSectionProps) {
  // 道路與城鎮事件文字狀態
  const [roadNotes, setRoadNotes] = useState(initialRoadNotes);
  const [townNotes, setTownNotes] = useState(initialTownNotes);

  // 儲存中與儲存成功反饋狀態
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // 版本衝突物件（若有其他玩家同時修改時觸發）
  const [conflict, setConflict] = useState<{ latest: CampaignMap; expectedVersion: number | null } | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  // 當外部傳入的初始備忘錄變動時，同步回內部輸入框
  useEffect(() => {
    setRoadNotes(initialRoadNotes);
  }, [initialRoadNotes]);

  useEffect(() => {
    setTownNotes(initialTownNotes);
  }, [initialTownNotes]);

  // 組件卸載時清除成功計時器
  useEffect(() => () => {
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
  }, []);

  // 檢查是否有尚未儲存的修改，並開啟防手殘離開視窗警告
  const isDirty = roadNotes !== initialRoadNotes || townNotes !== initialTownNotes;
  useUnsavedChangesWarning(isDirty);

  /**
   * 送出儲存事件備忘錄
   * @param versionOverride 當從版本衝突面板點擊「以我的內容覆蓋」時，強制傳入最新版本號
   */
  async function saveNotes(versionOverride?: number) {
    if (busy || disabled) return;
    setBusy(true);
    onSavingChange?.(true);
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {
        roadEventNotes: roadNotes,
        townEventNotes: townNotes,
      };
      const version = versionOverride ?? expectedVersion;
      if (typeof version === 'number') {
        payload.expectedVersion = version;
      }

      // 發送更新請求
      const response = await fetch('/api/campaign/map/event-notes', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null) as CampaignMapResponse | ApiErrorResponse | null;
      if (!response.ok || !result || !('data' in result)) {
        // 捕捉樂觀鎖版本衝突（HTTP 409）
        if (response.status === 409 && result && 'error' in result && result.error.code === 'MAP_VERSION_CONFLICT') {
          const details = result.error.conflict;
          if (details?.scope === 'MAP') {
            setConflict({ latest: details.latest as CampaignMap, expectedVersion: details.expectedVersion });
          } else {
            onError?.(result.error.message);
          }
          return;
        }
        const errorMsg = (result as ApiErrorResponse | null)?.error?.message ?? '無法儲存事件紀錄，請稍後重試。';
        onError?.(errorMsg);
        return;
      }

      // 儲存成功：顯示反饋並觸發通知
      setSaved(true);
      setConflict(null);
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 2000);

      onSaved?.(result.data);
      onToast?.('事件人工紀錄已儲存');
    } catch {
      onError?.('無法連線到伺服器，請檢查網路連線。');
    } finally {
      setBusy(false);
      onSavingChange?.(false);
    }
  }

  // 依據頁面容器（地圖頁或馬車頁）切換外層 CSS class
  const containerClass = variant === 'wagon'
    ? 'wagon-panel event-records-wagon-panel'
    : 'event-notes-section';

  return (
    <section className={containerClass} aria-labelledby="event-notes-title">
      {/* 發生 409 版本衝突時展示的互動對話盒 */}
      {conflict && <VersionConflictPanel
        title="事件紀錄已被其他玩家更新"
        changedFields={['道路事件卡或城鎮事件卡紀錄']}
        expectedVersion={conflict.expectedVersion}
        currentVersion={conflict.latest.version}
        busy={busy}
        onReload={() => {
          setRoadNotes(conflict.latest.roadEventNotes);
          setTownNotes(conflict.latest.townEventNotes);
          onAdoptLatest?.(conflict.latest);
          setConflict(null);
        }}
        onReapply={() => void saveNotes(conflict.latest.version)}
      />}

      {/* 區塊標題 */}
      <header className="campaign-module-heading compact">
        <div>
          <p className="eyebrow">EVENT RECORDS</p>
          <h2 id="event-notes-title">事件人工紀錄</h2>
          <p>直接記錄已觸發的卡片名稱或桌遊結果（地圖與馬車同步）。</p>
        </div>
        {isDirty && <small className="unsaved-badge">有尚未儲存的修改</small>}
      </header>

      {/* 道路事件與城鎮事件多行文字輸入區 */}
      <div className="event-note-fields">
        <label className="map-field">
          <span>道路事件卡 Road Card</span>
          <textarea
            value={roadNotes}
            onChange={event => setRoadNotes(event.target.value)}
            disabled={busy || disabled}
            rows={6}
            placeholder="每行記錄一張已觸發的道路事件卡"
          />
        </label>
        <label className="map-field">
          <span>城鎮事件卡 Town Card</span>
          <textarea
            value={townNotes}
            onChange={event => setTownNotes(event.target.value)}
            disabled={busy || disabled}
            rows={6}
            placeholder="每行記錄一張已觸發的城鎮事件卡"
          />
        </label>
      </div>

      {/* 儲存操作按鈕 */}
      <div className="map-editor-primary-actions">
        <button
          className="button"
          disabled={busy || disabled || !isDirty}
          onClick={() => void saveNotes()}
          type="button"
        >
          <Save aria-hidden="true" />
          {busy ? '儲存中…' : saved ? '已儲存' : isDirty ? '儲存事件紀錄 *' : '儲存事件紀錄'}
        </button>
      </div>
    </section>
  );
}
