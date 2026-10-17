import { History, LoaderCircle, Play, RefreshCw } from 'lucide-react';
import type { AuthSession } from '../../shared/types';
import type { AudioPlaybackLog } from '../../shared/audio';

interface AudioPlaybackHistoryProps {
  session: AuthSession | null;
  entries: AudioPlaybackLog[];
  loading: boolean;
  error: string;
  onRefresh(): void;
  onReplay(code: string): void;
}

function formatPlayedAt(value: string): string {
  const timestamp = new Date(value.endsWith('Z') ? value : value + 'Z');
  if (Number.isNaN(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

export function AudioPlaybackHistory({
  session,
  entries,
  loading,
  error,
  onRefresh,
  onReplay,
}: AudioPlaybackHistoryProps) {
  return <section className="audio-history" aria-labelledby="audio-history-title">
    <header>
      <div>
        <p className="eyebrow">CAMPAIGN HISTORY</p>
        <h3 id="audio-history-title"><History aria-hidden="true" />共用播放紀錄</h3>
      </div>
      {session && <button type="button" onClick={onRefresh} disabled={loading} aria-label="重新整理播放紀錄">
        {loading ? <LoaderCircle className="audio-spinner" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      </button>}
    </header>

    {!session && <p className="audio-history-empty">登入戰役後，即可與其他玩家共用播放紀錄。</p>}
    {session && error && <p className="audio-history-error" role="status">{error}</p>}
    {session && !loading && !error && entries.length === 0 && <p className="audio-history-empty">尚無播放紀錄。輸入語音代碼並成功播放後會顯示於此。</p>}

    {session && entries.length > 0 && <ol>
      {entries.map(entry => <li key={entry.id}>
        <button type="button" onClick={() => onReplay(entry.code)} aria-label={`播放 ${entry.code} ${entry.title}`}>
          <Play aria-hidden="true" />
          <span>
            <strong><b>{entry.code}</b>{entry.title}</strong>
            <small>{entry.playerAlias} · 玩家 {entry.playerNumber} · {formatPlayedAt(entry.playedAt)}</small>
          </span>
        </button>
      </li>)}
    </ol>}
  </section>;
}
