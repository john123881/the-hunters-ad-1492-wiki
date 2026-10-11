import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { CampaignCardProgress } from '../../shared/types';
import { useIsMobileProgress } from '../lib/useMediaQuery';

/**
 * 外部父元件（CampaignMapPage）可呼叫的操作介面
 */
export type CampaignCardProgressSectionHandle = {
  /** 開啟指定卡號的進度，重置篩選並展開抽屜 */
  openCard: (cardCode: string) => void;
  /** 自地圖操作返回時，自動定位焦點並平滑滾動至該卡片 */
  returnToCard: (cardCode: string) => void;
};

type CampaignCardProgressSectionProps = {
  /** 戰役所有劇情卡與任務卡進度陣列 */
  cards: CampaignCardProgress[];
  /** 是否正在儲存或更新中（停用按鈕防連點） */
  busy: boolean;
  /** 點擊已放置卡號時，跳轉並定位至大地圖或地點卡 */
  onLocate: (card: CampaignCardProgress) => void;
  /** 點擊狀態切換按鈕（完成／更正） */
  onChangeStatus: (card: CampaignCardProgress) => void;
};

/** 手機版清單每頁顯示筆數 */
const PAGE_SIZE = 20;

/**
 * 戰役劇情卡（S）與任務卡（J）進度管理區塊 / 抽屜
 * 
 * 包含：
 * 1. 依卡片種類（S/J）、完成狀態（未完成/已完成）、卡號關鍵字多重篩選
 * 2. 手機版分頁與防止背景穿透滾動（Scroll Lock）
 * 3. 點選卡號快速跳轉地圖定位、切換解決狀態
 */
export const CampaignCardProgressSection = forwardRef<
  CampaignCardProgressSectionHandle,
  CampaignCardProgressSectionProps
>(function CampaignCardProgressSection({ cards, busy, onLocate, onChangeStatus }, ref) {
  // 篩選與搜尋狀態
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'STORY' | 'MISSION'>('ALL');
  const [stateFilter, setStateFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [query, setQuery] = useState('');

  // 抽屜開關與分頁狀態
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(0);
  const isMobile = useIsMobileProgress();
  const sectionRef = useRef<HTMLElement>(null);

  // 依條件即時過濾符合的卡片
  const visibleCards = useMemo(() => cards.filter(card => {
    const typeMatches = typeFilter === 'ALL' || card.cardType === typeFilter;
    const stateMatches = stateFilter === 'ALL'
      || (stateFilter === 'RESOLVED' ? card.isResolved : !card.isResolved);
    const queryMatches = card.cardCode.includes(query.trim().toUpperCase());
    return typeMatches && stateMatches && queryMatches;
  }), [cards, query, stateFilter, typeFilter]);

  // 手機版分頁計算
  const pageCount = Math.max(1, Math.ceil(visibleCards.length / PAGE_SIZE));
  const displayedCards = isMobile && !query.trim()
    ? visibleCards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : visibleCards;

  // 手機版下拉選單的區間標籤（例如：S01–S20）
  const ranges = useMemo(() => Array.from({ length: pageCount }, (_, rangePage) => {
    const rangeCards = visibleCards.slice(rangePage * PAGE_SIZE, (rangePage + 1) * PAGE_SIZE);
    return {
      page: rangePage,
      label: rangeCards.length
        ? rangeCards[0].cardCode + '–' + rangeCards[rangeCards.length - 1].cardCode
        : '無卡片',
    };
  }), [pageCount, visibleCards]);

  // 已完成卡片總數統計
  const resolvedCount = useMemo(() => cards.filter(card => card.isResolved).length, [cards]);

  // 監聽手機版螢幕寬度（<= 620px）
  // 當搜尋字串或篩選條件變動時，重置回第一頁
  useEffect(() => {
    setPage(0);
  }, [query, stateFilter, typeFilter]);

  // 防呆：當篩選後的總頁數縮減時，校正當前頁碼不超出邊界
  useEffect(() => {
    if (page < pageCount) return;
    setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  // 手機版抽屜開啟時鎖定背景捲動（防止在滑動卡片清單時背景大地圖跟著滾動）
  useEffect(() => {
    if (!drawerOpen || !isMobile) return;
    const scrollY = window.scrollY;
    const previous = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      document.body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [drawerOpen, isMobile]);

  // 支援 ESC 鍵關閉抽屜
  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  // 暴露給外部父層的 imperative 控制方法
  useImperativeHandle(ref, () => ({
    openCard(cardCode) {
      setQuery(cardCode);
      setTypeFilter('ALL');
      setStateFilter('ALL');
      setPage(0);
      setDrawerOpen(true);
    },
    returnToCard(cardCode) {
      setQuery(cardCode);
      setTypeFilter('ALL');
      setStateFilter('ALL');
      setPage(0);
      if (isMobile) setDrawerOpen(true);
      window.setTimeout(() => {
        sectionRef.current?.querySelector<HTMLElement>('[data-card-code="' + cardCode + '"] .card-progress-code')?.focus();
        if (isMobile) return;
        document.getElementById('campaign-card-progress-title')?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      }, 0);
    },
  }), [isMobile]);

  // 點擊卡號執行地圖定位跳轉
  function locateCard(card: CampaignCardProgress) {
    if (!card.locationCode) return;
    if (isMobile) {
      setDrawerOpen(false);
      window.setTimeout(() => onLocate(card), 0);
      return;
    }
    onLocate(card);
  }

  return <section
    ref={sectionRef}
    className={'campaign-card-progress-section' + (drawerOpen ? ' is-mobile-open' : '')}
    aria-labelledby="campaign-card-progress-title"
    aria-modal={isMobile && drawerOpen ? 'true' : undefined}
    role={isMobile && drawerOpen ? 'dialog' : undefined}
  >
    <header className="campaign-module-heading compact">
      <div>
        <p className="eyebrow">STORY / MISSION CARDS</p>
        <h2 id="campaign-card-progress-title">劇情卡與任務卡清單</h2>
        <p>未放置卡可標記完成；點選已放置卡會前往所在的地圖卡或地點卡。</p>
      </div>
      <span>{resolvedCount} / {cards.length} 已完成</span>
      {isMobile && drawerOpen && <button className="card-progress-close" type="button" onClick={() => setDrawerOpen(false)} aria-label="關閉卡片清單"><X aria-hidden="true" />關閉</button>}
    </header>

    {/* 手機版縮合時的快捷開啟按鈕 */}
    {isMobile && !drawerOpen && <div className="card-progress-mobile-summary">
      <strong>已完成 {resolvedCount} / {cards.length}</strong>
      <button className="button" type="button" onClick={() => setDrawerOpen(true)}>開啟卡片清單</button>
    </div>}

    {/* 電腦版常駐顯示 / 手機版展開抽屜時顯示內容 */}
    {(!isMobile || drawerOpen) && <>
      <div className="card-progress-toolbar">
        <label className="card-progress-search"><span>搜尋卡號</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="例如 S083" /></label>
        {isMobile && !query.trim() && <label className="card-progress-range"><span>顯示範圍</span><select value={page} onChange={event => setPage(Number(event.target.value))}>{ranges.map(range => <option key={range.page} value={range.page}>{range.label}</option>)}</select></label>}
        <div role="group" aria-label="卡片類型">
          {(['ALL', 'STORY', 'MISSION'] as const).map(filter => <button className={typeFilter === filter ? 'active' : ''} key={filter} onClick={() => setTypeFilter(filter)} type="button">{filter === 'ALL' ? '全部' : filter === 'STORY' ? '劇情卡 S' : '任務卡 J'}</button>)}
        </div>
        <div role="group" aria-label="完成狀態">
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map(filter => <button className={stateFilter === filter ? 'active' : ''} key={filter} onClick={() => setStateFilter(filter)} type="button">{filter === 'ALL' ? '全部狀態' : filter === 'OPEN' ? '未完成' : '已完成'}</button>)}
        </div>
        <p><span className="card-progress-key unplaced" />未放置 <span className="card-progress-key placed" />已放置 <span className="card-progress-key resolved" />已完成</p>
        <strong className="card-progress-result-count">找到 {visibleCards.length} 張</strong>
      </div>

      <div className="campaign-card-progress-grid">
        {visibleCards.length === 0 && <p className="card-progress-empty">找不到符合條件的卡片，請調整卡號或篩選條件。</p>}
        {displayedCards.map(card => {
          const state = card.isResolved ? 'resolved' : card.locationCode ? 'placed' : 'unplaced';
          const stateLabel = card.isResolved ? '已完成' : card.locationCode ? '已放置於 ' + card.locationCode : '未放置';
          return <article className={'campaign-card-progress ' + state} data-card-code={card.cardCode} key={card.cardCode}>
            <button className="card-progress-code" disabled={busy || !card.locationCode} onClick={() => locateCard(card)} title={card.locationCode ? '前往 ' + card.locationCode : '尚未放置'} type="button">
              <strong>{card.cardCode}</strong>
              {card.timeToken && <span className="card-progress-token" aria-label={'Token ' + card.timeToken.tokenCode}>{card.timeToken.tokenCode}</span>}
            </button>
            <button className="card-progress-action" disabled={busy} onClick={() => onChangeStatus(card)} type="button">{card.isResolved ? '更正' : '完成'}</button>
            <span className="sr-only">{stateLabel}</span>
          </article>;
        })}
      </div>

      {/* 手機版分頁導航列 */}
      {isMobile && !query.trim() && visibleCards.length > PAGE_SIZE && <nav className="card-progress-pagination" aria-label="卡片清單分頁">
        <button type="button" disabled={page === 0} onClick={() => setPage(current => Math.max(0, current - 1))}>上一組</button>
        <span>{page + 1} / {pageCount}</span>
        <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))}>下一組</button>
      </nav>}
    </>}
  </section>;
});
