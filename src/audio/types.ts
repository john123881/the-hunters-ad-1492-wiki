import type { AudioCategory } from '../../shared/audio';

export type AudioPlayerStatus =
  | 'idle'
  | 'resolving'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export interface AudioManifestEntry {
  code: string;
  category: AudioCategory;
  title: string;
  path: string;
  sourcePath?: string;
  bytes?: number;
}

export interface AudioManifest {
  version: number;
  source?: string;
  sourceSha256?: string;
  mediaBaseUrl?: string;
  entryCount: number;
  entries: Record<string, AudioManifestEntry>;
}

export interface ResolvedAudioTrack extends AudioManifestEntry {
  url: string;
}

export type AudioPlayerErrorCode =
  | 'INVALID_CODE'
  | 'CODE_NOT_FOUND'
  | 'MANIFEST_LOAD_FAILED'
  | 'AUDIO_LOAD_FAILED'
  | 'PLAYBACK_BLOCKED';

export interface AudioPlayerError {
  code: AudioPlayerErrorCode;
  message: string;
}

export interface AudioPlayerSnapshot {
  status: AudioPlayerStatus;
  playbackId: number;
  track: ResolvedAudioTrack | null;
  currentTime: number;
  duration: number;
  volume: number;
  visible: boolean;
  expanded: boolean;
  error: AudioPlayerError | null;
}
