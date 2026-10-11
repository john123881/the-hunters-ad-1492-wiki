import { useCampaignMutation } from './useCampaignMutation';
import type { CampaignMap } from '../../shared/types';

function changedMapFields(before: CampaignMap, latest: CampaignMap) {
  const fields: string[] = [];
  if (
    before.currentLocationType !== latest.currentLocationType
    || before.currentLocationCode !== latest.currentLocationCode
  ) fields.push('獵人目前位置');
  if (before.roadEventNotes !== latest.roadEventNotes) fields.push('道路事件紀錄');
  if (before.townEventNotes !== latest.townEventNotes) fields.push('城鎮事件紀錄');
  if (JSON.stringify(before.tiles) !== JSON.stringify(latest.tiles)) fields.push('地圖卡狀態或備註');
  if (JSON.stringify(before.locations) !== JSON.stringify(latest.locations)) fields.push('地點卡狀態或備註');
  if (JSON.stringify(before.cards) !== JSON.stringify(latest.cards)) fields.push('放置卡片');
  if (JSON.stringify(before.cardProgress) !== JSON.stringify(latest.cardProgress)) fields.push('劇情／任務卡進度');
  return fields.length ? fields : ['地圖版本'];
}

export function useMapMutation(
  map: CampaignMap | null,
  onMapChange: (map: CampaignMap) => void,
) {
  return useCampaignMutation({
    state: map,
    onStateChange: onMapChange,
    computeChangedFields: changedMapFields,
    defaultSuccessMessage: status => status === 201 ? '已新增卡片紀錄。' : '地圖紀錄已更新。',
  });
}
