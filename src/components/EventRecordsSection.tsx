import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { VersionConflictPanel } from './VersionConflictPanel';
import { useUnsavedChangesWarning } from '../lib/useOptimisticSave';
import type { ApiErrorResponse, CampaignMap, CampaignMapResponse } from '../../shared/types';

interface EventRecordsSectionProps {
  initialRoadNotes: string;
  initialTownNotes: string;
  expectedVersion?: number;
  onSaved?: (map: CampaignMap) => void;
  onAdoptLatest?: (map: CampaignMap) => void;
  onToast?: (message: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  onSavingChange?: (saving: boolean) => void;
  variant?: 'map' | 'wagon';
}

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
  const [roadNotes, setRoadNotes] = useState(initialRoadNotes);
  const [townNotes, setTownNotes] = useState(initialTownNotes);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState<{ latest: CampaignMap; expectedVersion: number | null } | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setRoadNotes(initialRoadNotes);
  }, [initialRoadNotes]);

  useEffect(() => {
    setTownNotes(initialTownNotes);
  }, [initialTownNotes]);

  useEffect(() => () => {
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
  }, []);

  const isDirty = roadNotes !== initialRoadNotes || townNotes !== initialTownNotes;
  useUnsavedChangesWarning(isDirty);

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
      const response = await fetch('/api/campaign/map/event-notes', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null) as CampaignMapResponse | ApiErrorResponse | null;
      if (!response.ok || !result || !('data' in result)) {
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

  const containerClass = variant === 'wagon'
    ? 'wagon-panel event-records-wagon-panel'
    : 'event-notes-section';

  return (
    <section className={containerClass} aria-labelledby="event-notes-title">
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
      <header className="campaign-module-heading compact">
        <div>
          <p className="eyebrow">EVENT RECORDS</p>
          <h2 id="event-notes-title">事件人工紀錄</h2>
          <p>直接記錄已觸發的卡片名稱或桌遊結果（地圖與馬車同步）。</p>
        </div>
        {isDirty && <small className="unsaved-badge">有尚未儲存的修改</small>}
      </header>
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
