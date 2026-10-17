import { useContext, useMemo, useSyncExternalStore } from 'react';
import { AudioPlayerContext } from './AudioPlayerProvider';

function useAudioPlayerController() {
  const controller = useContext(AudioPlayerContext);
  if (!controller) {
    throw new Error('音訊播放器 Hook 必須在 AudioPlayerProvider 內使用。');
  }
  return controller;
}

export function useAudioPlayerState() {
  const controller = useAudioPlayerController();
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}

export function useAudioPlayerControls() {
  const controller = useAudioPlayerController();

  return useMemo(() => ({
    playByCode: controller.playByCode.bind(controller),
    pause: controller.pause.bind(controller),
    resume: controller.resume.bind(controller),
    replay: controller.replay.bind(controller),
    retry: controller.retry.bind(controller),
    seek: controller.seek.bind(controller),
    setVolume: controller.setVolume.bind(controller),
    show: controller.show.bind(controller),
    expand: controller.expand.bind(controller),
    collapse: controller.collapse.bind(controller),
    hide: controller.hide.bind(controller),
    stop: controller.stop.bind(controller),
  }), [controller]);
}

export function useAudioPlayer() {
  const state = useAudioPlayerState();
  const controls = useAudioPlayerControls();
  return { ...state, ...controls };
}
