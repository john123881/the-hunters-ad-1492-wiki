import { useEffect, useRef } from 'react';
import type { AuthSession } from '../../shared/types';
import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { AudioCodeInput } from './AudioCodeInput';
import { AudioPlaybackHistory } from './AudioPlaybackHistory';
import { useCampaignAudioHistory } from './useCampaignAudioHistory';
import { useAudioPlayerControls, useAudioPlayerState } from './useAudioPlayer';

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return String(minutes) + ':' + seconds;
}

interface GlobalAudioPlayerProps {
  session: AuthSession | null;
}

export function GlobalAudioPlayer({ session }: GlobalAudioPlayerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const loggedPlaybackRef = useRef(0);
  const state = useAudioPlayerState();
  const controls = useAudioPlayerControls();
  const busy = state.status === 'resolving' || state.status === 'loading';
  const playing = state.status === 'playing';
  const playable = Boolean(state.track);
  const duration = state.duration || 0;
  const history = useCampaignAudioHistory(session, state.expanded);

  useEffect(() => {
    document.body.classList.toggle('audio-player-visible', state.visible);
    return () => document.body.classList.remove('audio-player-visible');
  }, [state.visible]);

  useEffect(() => {
    if (state.expanded) window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [state.expanded]);

  useEffect(() => {
    if (state.status !== 'playing' || !state.track || state.playbackId <= 0) return;
    if (loggedPlaybackRef.current === state.playbackId) return;
    loggedPlaybackRef.current = state.playbackId;
    if (session) void history.record(state.track, crypto.randomUUID());
  }, [history.record, session, state.playbackId, state.status, state.track]);

  if (!state.visible) return null;

  const togglePlayback = () => {
    if (playing) controls.pause();
    else void controls.resume();
  };

  return <div className="global-audio-player" data-expanded={state.expanded}>
    {state.expanded && <button
      type="button"
      className="audio-player-backdrop"
      aria-label="收合語音播放器"
      onClick={controls.collapse}
    />}

    {state.expanded && <section className="audio-player-drawer" aria-label="語音播放器">
      <header>
        <div>
          <p className="eyebrow">NARRATION ARCHIVE</p>
          <h2>語音播放器</h2>
        </div>
        <button type="button" onClick={controls.collapse} aria-label="收合語音播放器">
          <ChevronDown aria-hidden="true" />
        </button>
      </header>

      <AudioCodeInput inputRef={inputRef} />

      <div className="audio-now-playing" aria-live="polite">
        <span>{state.track?.category ?? '尚未選擇'}</span>
        <strong>{state.track?.title ?? '輸入規則書上的語音代碼'}</strong>
        {busy && <small><LoaderCircle className="audio-spinner" aria-hidden="true" />載入語音中…</small>}
        {state.error && <small className="audio-error">{state.error.message}</small>}
      </div>

      <div className="audio-drawer-controls">
        <button type="button" onClick={togglePlayback} disabled={!playable || busy} aria-label={playing ? '暫停語音' : '播放語音'}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" onClick={() => void controls.replay()} disabled={!playable || busy} aria-label="重新播放">
          <RotateCcw aria-hidden="true" />
        </button>
        {state.error && <button type="button" onClick={() => void controls.retry()} className="audio-retry">重試</button>}
        <button type="button" onClick={controls.stop} disabled={!playable} aria-label="停止播放">
          <Square aria-hidden="true" />
        </button>
      </div>

      <AudioPlaybackHistory
        session={session}
        entries={history.entries}
        loading={history.loading}
        error={history.error}
        onRefresh={() => void history.refresh()}
        onReplay={code => {
          if (state.track?.code === code) void controls.replay();
          else void controls.playByCode(code);
        }}
      />
    </section>}

    <section className="audio-player-bar" aria-label="語音播放控制">
      <button
        type="button"
        className="audio-primary-control"
        onClick={togglePlayback}
        disabled={!playable || busy}
        aria-label={playing ? '暫停語音' : '播放語音'}
      >
        {busy
          ? <LoaderCircle className="audio-spinner" aria-hidden="true" />
          : playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>

      <button type="button" className="audio-track-summary" onClick={controls.expand} aria-label="展開語音播放器">
        <span>{state.track?.title ?? '語音播放器'}</span>
        <small>{state.error?.message ?? (busy ? '載入語音中…' : '輸入代碼開始播放')}</small>
      </button>

      <div className="audio-progress">
        <span>{formatTime(state.currentTime)}</span>
        <input
          type="range"
          min="0"
          max={Math.max(duration, 1)}
          step="0.1"
          value={Math.min(state.currentTime, Math.max(duration, 1))}
          disabled={!duration}
          onChange={event => controls.seek(Number(event.target.value))}
          aria-label="語音播放進度"
        />
        <span>{formatTime(duration)}</span>
      </div>

      <label className="audio-volume">
        <Volume2 aria-hidden="true" />
        <span className="sr-only">音量</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.volume}
          onChange={event => controls.setVolume(Number(event.target.value))}
        />
      </label>

      <button type="button" className="audio-expand-button" onClick={state.expanded ? controls.collapse : controls.expand} aria-label={state.expanded ? '收合語音播放器' : '展開語音播放器'}>
        {state.expanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
      </button>
      <button type="button" className="audio-hide-button" onClick={controls.hide} aria-label="隱藏語音播放器">
        <X aria-hidden="true" />
      </button>
    </section>
  </div>;
}
