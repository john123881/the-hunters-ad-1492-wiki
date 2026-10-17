import { normalizeAudioCode } from '../../shared/audio';
import type { AudioManifestRepository } from './audioManifest';
import type {
  AudioPlayerError,
  AudioPlayerSnapshot,
  ResolvedAudioTrack,
} from './types';

export interface AudioElementLike {
  src: string;
  currentTime: number;
  duration: number;
  volume: number;
  ended: boolean;
  error: MediaError | null;
  load(): void;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

type Listener = () => void;

const initialSnapshot: AudioPlayerSnapshot = {
  status: 'idle',
  playbackId: 0,
  track: null,
  currentTime: 0,
  duration: 0,
  volume: 1,
  visible: false,
  expanded: false,
  error: null,
};

function finiteTime(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export class AudioPlayerController {
  private snapshot: AudioPlayerSnapshot = initialSnapshot;
  private readonly listeners = new Set<Listener>();
  private requestId = 0;
  private lastRequestedCode: string | null = null;
  private disposed = false;

  private readonly handleLoadStart = () => {
    if (this.snapshot.track) this.update({ status: 'loading', error: null });
  };

  private readonly handleLoadedMetadata = () => {
    this.update({
      duration: finiteTime(this.audio.duration),
      status: this.snapshot.status === 'playing' ? 'playing' : 'ready',
    });
  };

  private readonly handleCanPlay = () => {
    if (this.snapshot.status === 'loading') this.update({ status: 'ready' });
  };

  private readonly handlePlaying = () => this.update({ status: 'playing', error: null });

  private readonly handlePause = () => {
    if (this.audio.ended || this.snapshot.status === 'ended' || this.snapshot.status === 'error') return;
    if (this.snapshot.track) this.update({ status: 'paused' });
  };

  private readonly handleTimeUpdate = () => {
    this.update({
      currentTime: finiteTime(this.audio.currentTime),
      duration: finiteTime(this.audio.duration),
    });
  };

  private readonly handleEnded = () => {
    this.update({
      status: 'ended',
      currentTime: finiteTime(this.audio.duration) || this.snapshot.currentTime,
    });
  };

  private readonly handleError = () => {
    this.update({
      status: 'error',
      error: {
        code: 'AUDIO_LOAD_FAILED',
        message: '語音載入失敗，請檢查網路後重試。',
      },
    });
  };

  constructor(
    private readonly repository: AudioManifestRepository,
    private readonly audio: AudioElementLike,
  ) {
    this.audio.volume = initialSnapshot.volume;
    this.bindEvents('addEventListener');
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): AudioPlayerSnapshot => this.snapshot;

  async playByCode(input: string): Promise<void> {
    const code = normalizeAudioCode(input);
    if (!code) {
      this.fail({ code: 'INVALID_CODE', message: '語音代碼格式不正確。' });
      return;
    }

    this.lastRequestedCode = code;
    const requestId = ++this.requestId;

    if (this.snapshot.track?.code === code) {
      if (this.snapshot.status === 'ended') {
        this.audio.currentTime = 0;
        this.update({ playbackId: this.snapshot.playbackId + 1 });
      }
      await this.startPlayback(requestId);
      return;
    }

    this.update({ status: 'resolving', error: null });

    let track: ResolvedAudioTrack | null;
    try {
      track = await this.repository.find(code);
    } catch {
      if (requestId !== this.requestId || this.disposed) return;
      this.fail({
        code: 'MANIFEST_LOAD_FAILED',
        message: '無法載入語音索引，請稍後重試。',
      });
      return;
    }

    if (requestId !== this.requestId || this.disposed) return;
    if (!track) {
      this.fail({ code: 'CODE_NOT_FOUND', message: '找不到語音代碼 ' + code + '。' });
      return;
    }

    this.audio.pause();
    this.audio.src = track.url;
    this.audio.currentTime = 0;
    this.update({
      status: 'loading',
      playbackId: this.snapshot.playbackId + 1,
      track,
      currentTime: 0,
      duration: 0,
      error: null,
    });
    this.audio.load();
    await this.startPlayback(requestId);
  }

  async resume(): Promise<void> {
    if (!this.snapshot.track) return;
    if (this.snapshot.status === 'ended') {
      this.audio.currentTime = 0;
      this.update({ playbackId: this.snapshot.playbackId + 1 });
    }
    await this.startPlayback(this.requestId);
  }

  pause(): void {
    if (this.snapshot.status !== 'playing') return;
    this.audio.pause();
    this.update({ status: 'paused' });
  }

  async replay(): Promise<void> {
    if (!this.snapshot.track) return;
    this.audio.currentTime = 0;
    this.update({ currentTime: 0, playbackId: this.snapshot.playbackId + 1 });
    await this.startPlayback(this.requestId);
  }

  async retry(): Promise<void> {
    if (!this.lastRequestedCode) return;

    if (this.snapshot.error?.code === 'AUDIO_LOAD_FAILED' && this.snapshot.track) {
      this.update({ status: 'loading', error: null });
      this.audio.load();
      await this.startPlayback(this.requestId);
      return;
    }

    const code = this.lastRequestedCode;
    if (this.snapshot.error?.code === 'MANIFEST_LOAD_FAILED' && 'clearCache' in this.repository) {
      const repository = this.repository as AudioManifestRepository & { clearCache(): void };
      repository.clearCache();
    }
    await this.playByCode(code);
  }

  seek(seconds: number): void {
    if (!this.snapshot.track) return;
    const maximum = finiteTime(this.audio.duration) || this.snapshot.duration;
    const target = Math.min(Math.max(0, seconds), maximum || seconds);
    this.audio.currentTime = target;
    this.update({ currentTime: target });
  }

  setVolume(volume: number): void {
    const next = Math.min(1, Math.max(0, volume));
    this.audio.volume = next;
    this.update({ volume: next });
  }

  show(): void {
    this.update({ visible: true, expanded: true });
  }

  expand(): void {
    this.update({ visible: true, expanded: true });
  }

  collapse(): void {
    this.update({ visible: true, expanded: false });
  }

  hide(): void {
    this.update({ visible: false, expanded: false });
  }

  stop(): void {
    this.requestId += 1;
    this.lastRequestedCode = null;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.src = '';
    this.update({
      ...initialSnapshot,
      playbackId: this.snapshot.playbackId,
      volume: this.audio.volume,
      visible: this.snapshot.visible,
      expanded: this.snapshot.expanded,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.requestId += 1;
    this.audio.pause();
    this.bindEvents('removeEventListener');
    this.listeners.clear();
  }

  private async startPlayback(requestId: number): Promise<void> {
    try {
      await this.audio.play();
      if (requestId === this.requestId && !this.disposed) {
        this.update({ status: 'playing', error: null });
      }
    } catch {
      if (requestId !== this.requestId || this.disposed) return;
      this.fail({
        code: 'PLAYBACK_BLOCKED',
        message: '瀏覽器未能開始播放，請再次按下播放。',
      });
    }
  }

  private fail(error: AudioPlayerError): void {
    this.update({ status: 'error', error });
  }

  private update(changes: Partial<AudioPlayerSnapshot>): void {
    const next = { ...this.snapshot, ...changes };
    if (
      next.status === this.snapshot.status
      && next.playbackId === this.snapshot.playbackId
      && next.track === this.snapshot.track
      && next.currentTime === this.snapshot.currentTime
      && next.duration === this.snapshot.duration
      && next.volume === this.snapshot.volume
      && next.visible === this.snapshot.visible
      && next.expanded === this.snapshot.expanded
      && next.error === this.snapshot.error
    ) return;
    this.snapshot = next;
    this.listeners.forEach(listener => listener());
  }

  private bindEvents(method: 'addEventListener' | 'removeEventListener'): void {
    this.audio[method]('loadstart', this.handleLoadStart);
    this.audio[method]('loadedmetadata', this.handleLoadedMetadata);
    this.audio[method]('canplay', this.handleCanPlay);
    this.audio[method]('playing', this.handlePlaying);
    this.audio[method]('pause', this.handlePause);
    this.audio[method]('timeupdate', this.handleTimeUpdate);
    this.audio[method]('ended', this.handleEnded);
    this.audio[method]('error', this.handleError);
  }
}
