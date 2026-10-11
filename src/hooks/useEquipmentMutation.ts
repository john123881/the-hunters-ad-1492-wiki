import { useCampaignMutation, type CampaignMutationMethod } from './useCampaignMutation';

/**
 * useEquipmentMutation Hook 的設定選項
 */
type EquipmentMutationOptions<TLoadout extends { version: number }> = {
  /** 目前的角色裝備配置狀態（包含 version） */
  loadout: TLoadout | null;
  /** 裝備操作儲存成功時觸發的狀態更新回呼 */
  onSaved: (loadout: TLoadout) => unknown;
  /** 發生版本衝突被其他玩家覆蓋時觸發的回呼 */
  onConflict: (latest: TLoadout) => unknown;
  /** API 呼叫失敗時的錯誤回呼 */
  onError: (error: unknown) => unknown;
};

/**
 * 角色裝備面板專用的樂觀鎖資料變更 Hook (useEquipmentMutation)
 *
 * 【核心用途】
 * 專門負責角色裝備格位（HAND、BODY、PACK）、裝備放置、更換、移入馬車、
 * 附件（Attachment）安裝與孔位覆蓋板（XP Cover）等操作的樂觀鎖與版本控制：
 * 1. 綁定角色裝備 Loadout 狀態與其 version 欄位。
 * 2. 衝突時標註變更欄位為「角色裝備與面板格位」。
 * 3. 預設成功訊息統一為「裝備面板已更新。」。
 * 4. 提供 `mutateEquipment` 捷徑方法，簡化裝備各類 API 請求調用。
 *
 * @param options Hook 設定選項
 */
export function useEquipmentMutation<TLoadout extends { version: number }>({
  loadout,
  onSaved,
  onConflict,
  onError,
}: EquipmentMutationOptions<TLoadout>) {
  const mutation = useCampaignMutation<TLoadout>({
    state: loadout,
    onStateChange: onSaved,
    onConflictStateChange: onConflict,
    onError,
    computeChangedFields: () => ['角色裝備與面板格位'],
    defaultSuccessMessage: () => '裝備面板已更新。',
  });

  /**
   * 呼叫裝備更新 API 的封裝方法
   *
   * @param path API 路徑（例如 `/api/campaign/characters/:slug/equipment`）
   * @param method HTTP 方法（'PATCH' | 'POST' | 'PUT' | 'DELETE'）
   * @param payload 請求 JSON Payload
   * @param action 操作識別名稱（例如 'equip'、'remove'、'socket'）
   */
  const mutateEquipment = (
    path: string,
    method: CampaignMutationMethod,
    payload: object,
    action: string,
  ) => mutation.mutate(path, method, payload, action);

  return { ...mutation, mutateEquipment };
}

