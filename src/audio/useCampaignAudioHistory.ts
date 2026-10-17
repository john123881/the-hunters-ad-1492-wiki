import { useCallback, useEffect, useState } from 'react';
import type { AuthSession } from '../../shared/types';
import type { AudioPlaybackHistoryResponse, AudioPlaybackLog } from '../../shared/audio';
import type { ResolvedAudioTrack } from './types';

async function readHistoryError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message || '無法同步戰役語音紀錄。';
  } catch {
    return '無法同步戰役語音紀錄。';
  }
}

export function useCampaignAudioHistory(session: AuthSession | null, expanded: boolean) {
  const [entries, setEntries] = useState<AudioPlaybackLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!session) {
      setEntries([]);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/campaign/audio-playback', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(await readHistoryError(response));
      const payload = await response.json() as AudioPlaybackHistoryResponse;
      setEntries(payload.data);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法同步戰役語音紀錄。');
    } finally {
      setLoading(false);
    }
  }, [session?.campaignId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session || !expanded) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [expanded, refresh, session]);

  const record = useCallback(async (track: ResolvedAudioTrack, clientEventId: string) => {
    if (!session) return;
    try {
      const response = await fetch('/api/campaign/audio-playback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEventId, code: track.code, title: track.title }),
      });
      if (!response.ok) throw new Error(await readHistoryError(response));
      const payload = await response.json() as { data: AudioPlaybackLog };
      setEntries(current => [
        payload.data,
        ...current.filter(entry => entry.id !== payload.data.id),
      ].slice(0, 50));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法寫入戰役語音紀錄。');
    }
  }, [session?.campaignId]);

  return { entries, loading, error, refresh, record };
}
