import type { CampaignCharacter, CampaignCharactersResponse } from '../../shared/types';
import { useCampaignMutation } from './useCampaignMutation';

const characterFieldLabels: Record<string, string> = {
  heroSlug: '角色', customName: '角色名稱', moralePosition: '士氣位置', strengthLevel: '力量',
  knowledgeLevel: '知識', perceptionLevel: '洞察', agilityLevel: '敏捷', maxHealthLevel: '最大生命軌',
  currentHealth: '當前生命', xpTens: '經驗值十位', xpOnes: '經驗值個位', accumulatedXp: '累積經驗值',
  isPoisoned: '中毒狀態', notes: '角色備註',
};

function changedCharacterFields(before: CampaignCharacter | null, latest: CampaignCharacter) {
  if (!before) return ['角色已由其他玩家建立'];
  const fields = Object.keys(characterFieldLabels).filter(
    key => before[key as keyof CampaignCharacter] !== latest[key as keyof CampaignCharacter],
  );
  return fields.length ? fields.map(key => characterFieldLabels[key]) : ['角色版本'];
}

export type CharacterMutationState = {
  version: number | null;
  character: CampaignCharacter | null;
  characters: CampaignCharacter[];
};

type UseCharacterMutationOptions = {
  playerNumber: number;
  state: CharacterMutationState;
  onSaved: (state: CharacterMutationState) => void;
  onConflict: (state: CharacterMutationState) => void;
};

export function useCharacterMutation({ playerNumber, state, onSaved, onConflict }: UseCharacterMutationOptions) {
  const toState = (characters: CampaignCharacter[]): CharacterMutationState => {
    const character = characters.find(entry => entry.playerNumber === playerNumber) ?? null;
    return { version: character?.version ?? null, character, characters };
  };

  return useCampaignMutation<CharacterMutationState, CampaignCharactersResponse['data'], CampaignCharacter[]>({
    state,
    onStateChange: onSaved,
    onConflictStateChange: onConflict,
    selectSavedState: data => toState(data.characters),
    selectConflictState: toState,
    computeChangedFields: (before, latest) => latest.character
      ? changedCharacterFields(before.character, latest.character)
      : ['角色版本'],
    defaultSuccessMessage: () => '角色面板已儲存。',
  });
}
