import { createContext, useState, type PropsWithChildren } from 'react';
import { AudioPlayerController } from './AudioPlayerController';
import { FetchAudioManifestRepository } from './audioManifest';

export const AudioPlayerContext = createContext<AudioPlayerController | null>(null);

export function AudioPlayerProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() => new AudioPlayerController(
    new FetchAudioManifestRepository(),
    new Audio(),
  ));


  return <AudioPlayerContext.Provider value={controller}>
    {children}
  </AudioPlayerContext.Provider>;
}
