import type { CampaignWagon } from '../../shared/types';
import { useCampaignMutation } from './useCampaignMutation';

/**
 * 比對馬車資料在新舊版本之間的差異欄位
 * 
 * 當其他玩家同時更新了馬車，伺服器回傳 409 Conflict 時，
 * 此函式會逐一比對累計時間、共用金錢、備註、工坊、素材等欄位，
 * 回傳易讀的繁體中文欄位名稱陣列，供 UI（VersionConflictPanel）顯示警告。
 *
 * @param before 本機修改前的馬車狀態
 * @param latest 伺服器回傳的最新馬車狀態
 * @returns 有變動的欄位名稱清單，例如 `['素材庫存', '工坊等級']`
 */
function changedWagonFields(before: CampaignWagon, latest: CampaignWagon) {
  const fields: string[] = [];
  if (before.elapsedDays !== latest.elapsedDays) fields.push('累計時間');
  if (before.sharedGold !== latest.sharedGold) fields.push('團隊共用金錢');
  if (before.notes !== latest.notes) fields.push('馬車備註');
  if (before.campaignName !== latest.campaignName) fields.push('戰役名稱');
  if (JSON.stringify(before.upgrades) !== JSON.stringify(latest.upgrades)) fields.push('工坊等級');
  if (JSON.stringify(before.resources) !== JSON.stringify(latest.resources)) fields.push('素材庫存');
  if (JSON.stringify(before.timeTokens) !== JSON.stringify(latest.timeTokens)) fields.push('Time Token');
  if (JSON.stringify(before.equipment) !== JSON.stringify(latest.equipment)) fields.push('裝備庫存');
  return fields.length ? fields : ['馬車版本'];
}

/**
 * 馬車面板專用的樂觀鎖資料變更 Hook (useWagonMutation)
 *
 * 【主要用途】
 * 將通用的 `useCampaignMutation` 特化為「馬車面板（CampaignPage）」專用：
 * 1. 自動綁定 `CampaignWagon` 狀態與其樂觀鎖版本號（`version`）。
 * 2. 注入 `changedWagonFields`，精準偵測馬車衝突欄位（金錢、天數、素材、工坊等）。
 * 3. 預設成功訊息統一為「馬車紀錄已更新。」。
 * 4. 集中管理天數調整、工坊升級、金錢增減、素材消耗與備註儲存的 busy 鎖定與失敗重試。
 *
 * @param wagon 當前馬車狀態（包含 version）
 * @param onWagonChange 更新成功或衝突覆蓋時的狀態回呼函式
 */
export function useWagonMutation(
  wagon: CampaignWagon | null,
  onWagonChange: (wagon: CampaignWagon) => void,
) {
  return useCampaignMutation({
    state: wagon,
    onStateChange: onWagonChange,
    computeChangedFields: changedWagonFields,
    defaultSuccessMessage: () => '馬車紀錄已更新。',
  });
}

