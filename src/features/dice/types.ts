export interface DieFaceDefinition {
  id: string;
  label: string;
  value?: number;
  textureUrl?: string;
}

export interface DieDefinition {
  id: string;
  name: string;
  shortName: string;
  faceCount: number;
  maxCount: number;
  colorLight: string;
  colorDark: string;
  inkColor: string;
  faces: DieFaceDefinition[];
  modelUrl?: string;
}

export interface DiceResult {
  dieId: string;
  dieType: string;
  dieName: string;
  faceId: string;
  label: string;
  value?: number;
}

export type DiceArenaStatus = 'loading' | 'ready' | 'rolling' | 'settled' | 'error';
