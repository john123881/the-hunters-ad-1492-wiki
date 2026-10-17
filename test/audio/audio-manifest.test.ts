import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FetchAudioManifestRepository } from '../../src/audio/audioManifest';
import type { AudioManifest } from '../../src/audio/types';

const manifest: AudioManifest = {
  version: 1,
  mediaBaseUrl: 'https://media.example/audio/',
  entryCount: 1,
  entries: {
    Q1: {
      code: 'Q1',
      category: 'quest',
      title: '任務 Q1',
      path: 'quest/Q1.mp3',
    },
  },
};

describe('audio manifest repository', () => {
  it('loads lazily, caches the manifest and resolves normalized codes', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify(manifest));
    };

    const repository = new FetchAudioManifestRepository('/audio/manifest.json', fetcher, 'https://wiki.example');
    assert.equal(fetchCount, 0);

    const first = await repository.find(' q-1 ');
    const second = await repository.find('Q1');

    assert.equal(first?.url, 'https://media.example/audio/quest/Q1.mp3');
    assert.equal(second?.code, 'Q1');
    assert.equal(fetchCount, 1);
  });

  it('does not request the manifest for an invalid code', async () => {
    let fetched = false;
    const repository = new FetchAudioManifestRepository(
      '/audio/manifest.json',
      async () => {
        fetched = true;
        return new Response(JSON.stringify(manifest));
      },
      'https://wiki.example',
    );

    assert.equal(await repository.find('not-a-code'), null);
    assert.equal(fetched, false);
  });

  it('clears a failed request so retry can load the manifest again', async () => {
    let attempts = 0;
    const repository = new FetchAudioManifestRepository(
      '/audio/manifest.json',
      async () => {
        attempts += 1;
        if (attempts === 1) return new Response('', { status: 503 });
        return new Response(JSON.stringify(manifest));
      },
      'https://wiki.example',
    );

    await assert.rejects(repository.find('Q1'));
    assert.equal((await repository.find('Q1'))?.code, 'Q1');
    assert.equal(attempts, 2);
  });
});
