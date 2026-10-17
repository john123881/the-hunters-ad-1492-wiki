import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AudioPlayerController, type AudioElementLike } from '../../src/audio/AudioPlayerController';
import type { AudioManifestRepository } from '../../src/audio/audioManifest';
import type { ResolvedAudioTrack } from '../../src/audio/types';

class FakeAudio implements AudioElementLike {
  src = '';
  currentTime = 0;
  duration = 120;
  volume = 1;
  ended = false;
  error = null;
  loadCount = 0;
  playCount = 0;
  pauseCount = 0;
  rejectPlay = false;
  private listeners = new Map<string, Set<EventListener>>();

  load(): void {
    this.loadCount += 1;
    this.emit('loadstart');
    this.emit('loadedmetadata');
    this.emit('canplay');
  }

  async play(): Promise<void> {
    this.playCount += 1;
    if (this.rejectPlay) throw new Error('blocked');
    this.ended = false;
    this.emit('playing');
  }

  pause(): void {
    this.pauseCount += 1;
    this.emit('pause');
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach(listener => listener(new Event(type)));
  }
}

const q1: ResolvedAudioTrack = {
  code: 'Q1',
  category: 'quest',
  title: '任務 Q1',
  path: 'quest/Q1.mp3',
  url: 'https://media.example/audio/quest/Q1.mp3',
};

function repository(entry: ResolvedAudioTrack | null = q1): AudioManifestRepository {
  return { find: async () => entry };
}

describe('audio player controller', () => {
  it('resolves a code and controls one audio instance', async () => {
    const audio = new FakeAudio();
    const controller = new AudioPlayerController(repository(), audio);

    controller.show();
    assert.equal(controller.getSnapshot().visible, true);
    assert.equal(controller.getSnapshot().expanded, true);
    controller.collapse();
    assert.equal(controller.getSnapshot().expanded, false);
    controller.expand();

    await controller.playByCode('q-1');
    assert.equal(controller.getSnapshot().status, 'playing');
    assert.equal(controller.getSnapshot().track?.code, 'Q1');
    assert.equal(controller.getSnapshot().playbackId, 1);
    assert.equal(audio.src, q1.url);
    assert.equal(audio.loadCount, 1);

    controller.pause();
    assert.equal(controller.getSnapshot().status, 'paused');

    await controller.resume();
    assert.equal(controller.getSnapshot().status, 'playing');
    assert.equal(controller.getSnapshot().playbackId, 1, '暫停後繼續不應新增播放紀錄');

    audio.currentTime = 42;
    audio.emit('timeupdate');
    assert.equal(controller.getSnapshot().currentTime, 42);

    controller.seek(30);
    assert.equal(audio.currentTime, 30);

    controller.setVolume(0.4);
    assert.equal(audio.volume, 0.4);
    assert.equal(controller.getSnapshot().volume, 0.4);
  });

  it('reports invalid and missing codes with typed errors', async () => {
    const controller = new AudioPlayerController(repository(null), new FakeAudio());

    await controller.playByCode('bad-code');
    assert.equal(controller.getSnapshot().error?.code, 'INVALID_CODE');

    await controller.playByCode('Q99');
    assert.equal(controller.getSnapshot().error?.code, 'CODE_NOT_FOUND');
  });

  it('keeps only the latest asynchronous code request', async () => {
    let resolveFirst: ((track: ResolvedAudioTrack | null) => void) | undefined;
    const first = new Promise<ResolvedAudioTrack | null>(resolve => { resolveFirst = resolve; });
    const secondTrack = { ...q1, code: 'Q2', title: '任務 Q2', url: 'https://media.example/audio/quest/Q2.mp3' };
    const manifest: AudioManifestRepository = {
      find: code => code === 'Q1' ? first : Promise.resolve(secondTrack),
    };
    const audio = new FakeAudio();
    const controller = new AudioPlayerController(manifest, audio);

    const oldRequest = controller.playByCode('Q1');
    await controller.playByCode('Q2');
    resolveFirst?.(q1);
    await oldRequest;

    assert.equal(controller.getSnapshot().track?.code, 'Q2');
    assert.equal(audio.src, secondTrack.url);
  });

  it('supports playback failure, retry, replay, ended and stop', async () => {
    const audio = new FakeAudio();
    audio.rejectPlay = true;
    const controller = new AudioPlayerController(repository(), audio);
    controller.show();

    await controller.playByCode('Q1');
    assert.equal(controller.getSnapshot().error?.code, 'PLAYBACK_BLOCKED');

    audio.rejectPlay = false;
    await controller.retry();
    assert.equal(controller.getSnapshot().status, 'playing');

    audio.emit('error');
    const loadCountBeforeRetry = audio.loadCount;
    await controller.retry();
    assert.equal(audio.loadCount, loadCountBeforeRetry + 1);
    assert.equal(controller.getSnapshot().status, 'playing');

    audio.currentTime = 120;
    audio.ended = true;
    audio.emit('ended');
    assert.equal(controller.getSnapshot().status, 'ended');

    const playbackIdBeforeReplay = controller.getSnapshot().playbackId;
    await controller.replay();
    assert.equal(controller.getSnapshot().playbackId, playbackIdBeforeReplay + 1);
    assert.equal(audio.currentTime, 0);
    assert.equal(controller.getSnapshot().status, 'playing');

    controller.stop();
    assert.equal(controller.getSnapshot().status, 'idle');
    assert.equal(controller.getSnapshot().track, null);
    assert.equal(controller.getSnapshot().volume, 1);
    assert.equal(controller.getSnapshot().visible, true);
    assert.equal(controller.getSnapshot().expanded, true);
  });
});
