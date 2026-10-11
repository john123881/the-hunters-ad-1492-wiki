import { useEffect, useState } from 'react';
import { Loader2, PackageOpen } from 'lucide-react';
import { preloadImage } from '../lib/imagePreload';

/**
 * 候選清單縮圖元件的 Props
 */
type CandidateThumbnailProps = {
  /** 裝備卡片圖片網址 */
  imageUrl: string;
  /** 裝備名稱（用於無障礙與放大浮層標題） */
  name: string;
};

/**
 * 裝備候選清單縮圖與桌面懸停放大鏡元件
 *
 * 【設計重點】
 * 1. 列表縮圖：在清單中呈現小尺寸縮圖或 PackageOpen 缺圖圖示。
 * 2. 懸停放大鏡（方案 2）：在支援滑鼠懸停（Hover）或鍵盤焦點的桌面環境下，浮現清晰高解析卡片放大窗。
 * 3. 預熱快取（Warm-up）：當使用者滑鼠移入（onPointerEnter）或焦點進入（onFocus）時，
 *    立即觸發 `preloadImage` 預載圖片，消除後續點擊展開時的白畫面延遲。
 */
export function EquipmentCandidateThumbnail({ imageUrl, name }: CandidateThumbnailProps) {
  function warmPreview() {
    if (imageUrl) void preloadImage(imageUrl).catch(() => undefined);
  }

  return (
    <span
      className="equipment-candidate-thumb-wrap"
      onPointerEnter={warmPreview}
      onFocus={warmPreview}
    >
      {imageUrl
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" />
        : <PackageOpen aria-hidden="true" />}
      {imageUrl && (
        <span className="equipment-candidate-hover-zoom" aria-hidden="true">
          <img src={imageUrl} alt="" decoding="async" />
          <small>{name}</small>
        </span>
      )}
    </span>
  );
}

/**
 * 裝備選中預覽卡片元件的 Props
 */
type EquipmentCandidatePreviewProps = {
  /** 裝備完整圖片網址 */
  imageUrl: string;
  /** 裝備名稱 */
  name: string;
  /** 分類名稱（如：近戰武器、防具、飾品） */
  categoryName: string;
  /** 占用欄位格數 */
  slotCount: number;
  /** 預覽即將占用的孔位代碼清單（例如 `['HAND_1', 'HAND_2']`） */
  previewSlotKeys: string[];
  /** 來源標籤：'WAGON' (既有馬車裝備) 或 'CATALOG' (從圖鑑建立新裝備) */
  source: 'WAGON' | 'CATALOG';
  /** 裝備實體 ID（馬車裝備專屬） */
  instanceId?: number;
  /** 毀損標記數量（大於 0 顯示已毀損紅標） */
  damageMarkers?: number;
  /** 自訂備註說明 */
  notes?: string;
};

/**
 * 裝備選中展開大圖與屬性摘要元件（方案 1 - 手機／平板／抽屜底欄預覽）
 *
 * 【設計重點】
 * 1. 完整比例卡片圖：不限制在 72x72 正方形內，以原始長寬比顯示整張卡片，看清卡片底部骰子與技能數值。
 * 2. 圖片非同步解碼保護：選中卡片時使用 `preloadImage()` 解碼，未載入完成前顯示 `Loader2` 轉圈圈，
 *    解碼完成才淡入大圖；載入失敗時優雅降級為 `PackageOpen` 圖示。
 * 3. 清楚的狀態摘要標籤：整合分類、格數、來源（馬車／圖鑑）、毀損標籤與即將占用的格位。
 */
export function EquipmentCandidatePreview({
  imageUrl,
  name,
  categoryName,
  slotCount,
  previewSlotKeys,
  source,
  instanceId,
  damageMarkers = 0,
  notes,
}: EquipmentCandidatePreviewProps) {
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'error'>(
    imageUrl ? 'loading' : 'error',
  );

  // 當選中的裝備圖片變更時，重新執行圖片預載與解碼流程
  useEffect(() => {
    if (!imageUrl) {
      setImageStatus('error');
      return;
    }

    let active = true;
    setImageStatus('loading');
    void preloadImage(imageUrl)
      .then(() => {
        if (active) setImageStatus('ready');
      })
      .catch(() => {
        if (active) setImageStatus('error');
      });
    return () => {
      active = false;
    };
  }, [imageUrl]);

  return (
    <div className="equipment-selected-preview">
      {/* 左側：卡片大圖展示框（含載入中/失敗/成功三態） */}
      <div className={'equipment-preview-card-frame status-' + imageStatus}>
        {imageStatus === 'loading' && <Loader2 className="spinning-icon" aria-hidden="true" />}
        {imageStatus === 'error' && <PackageOpen aria-hidden="true" />}
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            decoding="async"
            className={imageStatus === 'ready' ? 'ready' : ''}
          />
        )}
      </div>

      {/* 右側：裝備屬性徽章與占用格位預覽 */}
      <div className="equipment-preview-details">
        <div className="equipment-preview-header">
          <strong>{name}</strong>
          {instanceId != null && <span className="equipment-preview-id">#{instanceId}</span>}
        </div>
        <div className="equipment-preview-meta">
          <span>{categoryName}</span>
          <span>占 {slotCount} 格</span>
          <span>{source === 'WAGON' ? '馬車裝備' : '圖鑑新增'}</span>
          {damageMarkers > 0 && <span className="danger">已毀損</span>}
        </div>
        <p className="equipment-preview-slots">
          預覽占用：<strong>{previewSlotKeys.join('、')}</strong>
        </p>
        {notes && <p className="equipment-preview-notes">{notes}</p>}
      </div>
    </div>
  );
}


type AttachmentCandidatePreviewProps = {
  imageUrl: string;
  name: string;
  connectorName: string;
  source: 'WAGON' | 'CATALOG';
  instanceId?: number;
  damageMarkers?: number;
  notes?: string;
};

export function AttachmentCandidatePreview({
  imageUrl,
  name,
  connectorName,
  source,
  instanceId,
  damageMarkers = 0,
  notes,
}: AttachmentCandidatePreviewProps) {
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'error'>(
    imageUrl ? 'loading' : 'error',
  );

  useEffect(() => {
    if (!imageUrl) {
      setImageStatus('error');
      return;
    }
    let active = true;
    setImageStatus('loading');
    void preloadImage(imageUrl)
      .then(() => { if (active) setImageStatus('ready'); })
      .catch(() => { if (active) setImageStatus('error'); });
    return () => { active = false; };
  }, [imageUrl]);

  return (
    <div className="equipment-selected-preview attachment-selected-preview">
      <div className={'equipment-preview-card-frame status-' + imageStatus}>
        {imageStatus === 'loading' && <Loader2 className="spinning-icon" aria-hidden="true" />}
        {imageStatus === 'error' && <PackageOpen aria-hidden="true" />}
        {imageUrl && <img src={imageUrl} alt="" decoding="async" className={imageStatus === 'ready' ? 'ready' : ''} />}
      </div>
      <div className="equipment-preview-details">
        <div className="equipment-preview-header">
          <strong>{name}</strong>
          {instanceId != null && <span className="equipment-preview-id">#{instanceId}</span>}
        </div>
        <div className="equipment-preview-meta">
          <span>{connectorName}</span>
          <span>{source === 'WAGON' ? '馬車附件' : '附件列表新增'}</span>
          {damageMarkers > 0 && <span className="danger">已毀損</span>}
        </div>
        {notes && <p className="equipment-preview-notes">{notes}</p>}
      </div>
    </div>
  );
}
