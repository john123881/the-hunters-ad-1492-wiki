import { normalizeAudioCode } from '../../shared/audio';
import type { AudioManifest, ResolvedAudioTrack } from './types';

export interface AudioManifestRepository {
  find(input: string): Promise<ResolvedAudioTrack | null>;
}

export class FetchAudioManifestRepository implements AudioManifestRepository {
  private manifestPromise: Promise<AudioManifest> | null = null;

  constructor(
    private readonly manifestUrl = '/audio/manifest.json',
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly origin = globalThis.location?.origin ?? 'http://localhost',
  ) {}

  async find(input: string): Promise<ResolvedAudioTrack | null> {
    const code = normalizeAudioCode(input);
    if (!code) return null;

    const manifest = await this.load();
    const entry = manifest.entries[code];
    if (!entry) return null;

    const mediaBaseUrl = manifest.mediaBaseUrl
      ? new URL(manifest.mediaBaseUrl, this.origin).href
      : new URL('.', new URL(this.manifestUrl, this.origin)).href;

    return {
      ...entry,
      url: new URL(entry.path, mediaBaseUrl).href,
    };
  }

  clearCache(): void {
    this.manifestPromise = null;
  }

  private load(): Promise<AudioManifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = this.fetcher(this.manifestUrl, {
        headers: { accept: 'application/json' },
      }).then(async response => {
        if (!response.ok) throw new Error('Manifest HTTP ' + response.status);
        const manifest = await response.json() as AudioManifest;
        if (!manifest || typeof manifest !== 'object' || !manifest.entries) {
          throw new Error('Manifest 格式不正確');
        }
        return manifest;
      }).catch(error => {
        this.manifestPromise = null;
        throw error;
      });
    }
    return this.manifestPromise;
  }
}
