import { useEffect, useState } from 'react';
import { Clock3, Trash2 } from 'lucide-react';
import type { CampaignMapCard } from '../../shared/types';

/** 可用的 Time Token 代碼 (A, B, C, D) */
type TimeTokenCode = 'A' | 'B' | 'C' | 'D';

/** 下拉選單中可放置的位置選項（包含 M01~M20 地圖卡與 L01~L14 地點卡） */
type PlacementOption = {
  value: string;
  label: string;
};

/** 卡片欄位修改物件（位置、狀態、備註或城鎮牌庫） */
type CardChanges = Partial<Pick<
  CampaignMapCard,
  'locationType' | 'locationCode' | 'status' | 'notes' | 'isInTownDeck'
>>;

type PlacedCampaignCardProps = {
  /** 放置於地圖上的卡片資料物件 */
  card: CampaignMapCard;
  /** 當前正在執行的操作識別字串（用於按鈕停用與 loading 提示） */
  busy: string;
  /** 所有可移動到達的地圖與地點選項 */
  placementOptions: PlacementOption[];
  /** 目前馬車中尚未被使用的 Time Token 代碼清單 */
  availableTimeTokenCodes: TimeTokenCode[];
  /** 點擊卡號時，跳轉並開啟右側進度抽屜進行查看 */
  onOpenProgress: (card: CampaignMapCard) => void;
  /** 更新卡片屬性（移動位置、變更備註、切換城鎮牌庫或完成狀態） */
  onUpdate: (card: CampaignMapCard, changes: CardChanges, action: string) => Promise<boolean>;
  /** 自地圖或地點移除此卡片放置紀錄 */
  onRemove: (card: CampaignMapCard) => void;
  /** 放置 Time Token（倒數計時解鎖） */
  onPlaceTimeToken: (cardCode: string, tokenCode: TimeTokenCode, delay: number) => Promise<boolean>;
};

/**
 * 已放置於地圖卡或地點卡上的卡片單項列元件
 *
 * 職責：
 * 1. 顯示卡片代號、卡片類型（劇情卡/任務卡/大劇情卡）與 Time Token 倒數狀態
 * 2. 快捷移動位置下拉選單、刪除卡片放置紀錄
 * 3. 行內備忘錄（Note）編輯表單（狀態就地自治，打字不觸發外層大地圖重繪）
 * 4. 行內 Time Token 放置表單（選擇 A/B/C/D 與倒數天數）
 * 5. 標記完成前檢查（若有未解鎖 Token 彈出警示確認）
 */
export function PlacedCampaignCard({
  card,
  busy,
  placementOptions,
  availableTimeTokenCodes,
  onOpenProgress,
  onUpdate,
  onRemove,
  onPlaceTimeToken,
}: PlacedCampaignCardProps) {
  // 行內備忘錄編輯狀態
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [note, setNote] = useState(card.notes);

  // 行內 Time Token 放置表單狀態
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [tokenCode, setTokenCode] = useState<TimeTokenCode>(availableTimeTokenCodes[0] ?? 'A');
  const [tokenDelay, setTokenDelay] = useState(1);
  const disabled = Boolean(busy);

  // 當外部傳入的卡片備註變動且未處於編輯狀態時，同步本地 note
  useEffect(() => {
    if (!noteEditorOpen) setNote(card.notes);
  }, [card.notes, noteEditorOpen]);

  // 若當前選取的 Token 代碼已被使用，自動切換至下一個可用代碼
  useEffect(() => {
    if (availableTimeTokenCodes.includes(tokenCode)) return;
    const nextCode = availableTimeTokenCodes[0];
    if (nextCode) setTokenCode(nextCode);
  }, [availableTimeTokenCodes, tokenCode]);

  // 繁體中文卡片種類標籤
  const typeLabel = card.cardType === 'STORY'
    ? '劇情卡'
    : card.cardType === 'MISSION'
      ? '任務卡'
      : '大劇情卡';

  // Time Token 標籤文字（例如：A · 第 19 天）
  const tokenLabel = card.timeToken
    ? card.timeToken.tokenCode + (card.timeToken.unlockAtDay === null ? '' : ' · 第 ' + card.timeToken.unlockAtDay + ' 天')
    : '';

  // 標記完成防呆：若卡片上有未觸發的 Time Token，提醒玩家完成會連帶移除 Token
  function confirmResolution() {
    if (!card.timeToken) return true;
    const unlockText = card.timeToken.unlockAtDay === null ? '' : `，第 ${card.timeToken.unlockAtDay} 天解鎖`;
    return window.confirm(`${card.cardCode} 目前仍有 Token ${card.timeToken.tokenCode}${unlockText}。標記完成後會同時移除這枚 Token，確定繼續嗎？`);
  }

  return <article className="placed-card-item">
    {/* 卡片頂部資訊列：卡號、類別、Token 標籤與快捷操作 */}
    <header className="placed-card-item-header">
      <div className="placed-card-identity">
        <div className="placed-card-title-line">
          <button className="placed-card-progress-link" type="button" onClick={() => onOpenProgress(card)}>{card.cardCode}</button>
          <small>{typeLabel}</small>
        </div>
        {card.timeToken && <span className="time-token-chip"><Clock3 aria-hidden="true" />{tokenLabel}</span>}
      </div>

      <div className="placed-card-quick-actions">
        {/* 快速移動卡片至其他地圖卡或地點卡 */}
        <select
          aria-label={'移動 ' + card.cardCode}
          disabled={disabled || card.status === 'RESOLVED'}
          value={card.locationType + ':' + card.locationCode}
          onChange={event => {
            const [locationType, locationCode] = event.target.value.split(':') as ['MAP' | 'LOCATION', string];
            void onUpdate(card, { locationType, locationCode }, 'move-card');
          }}
        >
          {placementOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {/* 移除卡片放置紀錄 */}
        <button
          className="icon-button danger"
          aria-label={'移除 ' + card.cardCode}
          disabled={disabled}
          onClick={() => {
            if (window.confirm('移除 ' + card.cardCode + ' 的位置紀錄？')) onRemove(card);
          }}
          type="button"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </header>

    {/* 顯示現有備註（非編輯中） */}
    {card.notes && !noteEditorOpen && (
      <p className="placed-card-note"><strong>備註</strong><span>{card.notes}</span></p>
    )}

    {/* 操作動作按鈕列 */}
    <div className="placed-card-actions-row">
      {/* 大劇情卡（FEATURE）：切換是否已加入城鎮牌庫 */}
      {card.cardType === 'FEATURE' && <button
        className={'status-toggle ' + (card.isInTownDeck ? 'resolved' : 'pending')}
        disabled={disabled}
        onClick={() => void onUpdate(card, { isInTownDeck: !card.isInTownDeck }, 'town-deck')}
        type="button"
      >
        {card.isInTownDeck ? '已加入城鎮' : '未加入城鎮'}
      </button>}

      {/* 開啟 / 關閉備註編輯框 */}
      <button
        className="status-toggle pending"
        disabled={disabled}
        onClick={() => {
          setNote(card.notes);
          setNoteEditorOpen(open => !open);
        }}
        type="button"
      >
        {card.notes ? '修改備註' : '新增備註'}
      </button>

      {/* 放置 Time Token 按鈕（僅限未完成且無 Token 的劇情卡） */}
      {card.cardType === 'STORY' && card.status === 'PENDING' && !card.timeToken && <button
        className="status-toggle pending"
        disabled={disabled || availableTimeTokenCodes.length === 0}
        onClick={() => {
          const nextCode = availableTimeTokenCodes[0];
          if (nextCode) setTokenCode(nextCode);
          setTokenFormOpen(open => !open);
        }}
        type="button"
      >
        {availableTimeTokenCodes.length === 0 ? 'Token 已用完' : '放置 Token'}
      </button>}

      {/* 切換完成狀態 */}
      <button
        className={'status-toggle ' + card.status.toLowerCase()}
        disabled={disabled || card.status === 'RESOLVED'}
        onClick={() => {
          if (!confirmResolution()) return;
          void onUpdate(card, { status: 'RESOLVED' }, 'card-status');
        }}
        type="button"
      >
        {card.status === 'PENDING' ? '標記完成' : '已完成'}
      </button>
    </div>

    {/* 行內 Time Token 放置表單 */}
    {tokenFormOpen && <div className="inline-time-token-form">
      <label>
        <span>Time Token</span>
        <select value={tokenCode} onChange={event => setTokenCode(event.target.value as TimeTokenCode)}>
          {availableTimeTokenCodes.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
      </label>
      <label>
        <span>等待天數</span>
        <input min={1} max={59} type="number" value={tokenDelay} onChange={event => setTokenDelay(Math.max(1, Number(event.target.value) || 1))} />
      </label>
      <button
        className="button"
        disabled={disabled || !availableTimeTokenCodes.includes(tokenCode)}
        onClick={async () => {
          if (await onPlaceTimeToken(card.cardCode, tokenCode, tokenDelay)) setTokenFormOpen(false);
        }}
        type="button"
      >
        {busy === 'time-token-' + card.cardCode ? '放置中…' : '確認放置'}
      </button>
    </div>}

    {/* 行內備忘錄編輯表單 */}
    {noteEditorOpen && <div className="inline-card-note-form">
      <label>
        <span>卡片備註</span>
        <textarea maxLength={500} rows={2} value={note} onChange={event => setNote(event.target.value)} />
      </label>
      <div>
        <button
          className="button"
          disabled={disabled}
          onClick={async () => {
            if (await onUpdate(card, { notes: note }, 'card-note-' + card.id)) setNoteEditorOpen(false);
          }}
          type="button"
        >
          {busy === 'card-note-' + card.id ? '儲存中…' : '儲存備註'}
        </button>
        <button className="button secondary" disabled={disabled} onClick={() => setNoteEditorOpen(false)} type="button">取消</button>
      </div>
    </div>}
  </article>;
}
