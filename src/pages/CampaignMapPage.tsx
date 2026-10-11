import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, MapPin, MapPinned, Save, Shield, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { VersionConflictPanel } from '../components/VersionConflictPanel';
import { EventRecordsSection } from '../components/EventRecordsSection';
import { CampaignCardProgressSection, type CampaignCardProgressSectionHandle } from '../components/CampaignCardProgressSection';
import { Toast } from '../components/common/Toast';
import { PlacedCampaignCard } from '../components/PlacedCampaignCard';
import { getApiErrorMessage, readApiJson } from '../lib/apiClient';
import { preloadImage, preloadImages } from '../lib/imagePreload';
import { useBatchSelection } from '../lib/useBatchSelection';
import { useCompactMapEditor } from '../lib/useMediaQuery';
import { useUnsavedChangesWarning } from '../lib/useOptimisticSave';
import { useMapMutation } from '../hooks/useMapMutation';
import type { ApiErrorResponse, AuthSession, CampaignCardProgress, CampaignLocationCard, CampaignMap, CampaignMapCard, CampaignMapResponse, CampaignMapTile, CampaignWagonResponse } from '../../shared/types';


function mapImageUrl(mapCode: string, revealed: boolean) {
  return '/images/campaign/maps/' + mapCode + '-' + (revealed ? 'front' : 'back') + '.webp?v=12';
}

export function CampaignMapPage({ session, loading }: { session: AuthSession | null; loading: boolean }) {
  const [map, setMap] = useState<CampaignMap | null>(null);
  const {
    busy,
    message,
    messageKind,
    versionConflict,
    reauthRequired,
    savedAction,
    canRetry,
    mutate,
    retry,
    adoptLatest,
    clearToast,
    showSuccess,
    showError,
    beginExternal,
    endExternal,
  } = useMapMutation(map, setMap);
  const [selectedCode, setSelectedCode] = useState('M01');
  const availableMapCodes = useMemo(() => map?.tiles.map(tile => tile.mapCode) ?? [], [map?.tiles]);
  const availableLocationCodes = useMemo(() => map?.locations.map(location => location.locationCode) ?? [], [map?.locations]);
  const mapSelection = useBatchSelection(availableMapCodes);
  const locationSelection = useBatchSelection(availableLocationCodes);
  const compactMapEditor = useCompactMapEditor();
  const [draft, setDraft] = useState<CampaignMapTile | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedLocationCode, setSelectedLocationCode] = useState('L01');
  const locationRecordsRef = useRef<HTMLDivElement>(null);
  const [locationDraft, setLocationDraft] = useState<CampaignLocationCard | null>(null);
  const [roadEventNotes, setRoadEventNotes] = useState('');
  const [townEventNotes, setTownEventNotes] = useState('');
  const [cardCode, setCardCode] = useState('');
  const [cardNotes, setCardNotes] = useState('');
  const [progressReturnCardCode, setProgressReturnCardCode] = useState('');
  const [flippingCode, setFlippingCode] = useState('');
  const [loadingFlipCode, setLoadingFlipCode] = useState('');
  const [returnToProgress, setReturnToProgress] = useState(false);
  const progressSectionRef = useRef<CampaignCardProgressSectionHandle>(null);

  const loadMap = useCallback(async () => {
    if (!session) return;
    const response = await fetch('/api/campaign/map', { credentials: 'same-origin' });
    const payload = await readApiJson<CampaignMapResponse>(response, '目前無法讀取地圖。');
    setMap(payload.data);
  }, [session]);

  useEffect(() => {
    document.title = '戰役地圖｜THE HUNTERS A.D. 1492';
    loadMap().catch(error => {
      showError(error instanceof Error ? error.message : '目前無法讀取地圖。');
    });
  }, [loadMap, showError]);

  useEffect(() => {
    const tile = map?.tiles.find(item => item.mapCode === selectedCode);
    setDraft(tile ? { ...tile, face: tile.isRevealed ? 'FRONT' : 'BACK' } : null);
  }, [map, selectedCode]);

  useEffect(() => {
    const location = map?.locations.find(item => item.locationCode === selectedLocationCode);
    setLocationDraft(location ? { ...location } : null);
  }, [map, selectedLocationCode]);

  useEffect(() => {
    if (!draft || !editorOpen) return;
    void preloadImage(mapImageUrl(draft.mapCode, !draft.isRevealed)).catch(() => undefined);
  }, [draft?.mapCode, draft?.isRevealed, editorOpen]);

  useEffect(() => {
    if (!map) return;
    setRoadEventNotes(map.roadEventNotes);
    setTownEventNotes(map.townEventNotes);
  }, [map]);

  useEffect(() => {
    if (!editorOpen || !compactMapEditor) return;
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
  }, [compactMapEditor, editorOpen]);

  const savedSelectedTile = useMemo(
    () => map?.tiles.find(tile => tile.mapCode === draft?.mapCode) ?? null,
    [draft?.mapCode, map],
  );
  const mapDraftDirty = Boolean(draft && savedSelectedTile && (
    draft.isRevealed !== savedSelectedTile.isRevealed
    || draft.face !== savedSelectedTile.face
    || draft.resourceNotes !== savedSelectedTile.resourceNotes
    || draft.notes !== savedSelectedTile.notes
  ));

  useUnsavedChangesWarning(mapDraftDirty);

  function closeMapEditor() {
    if (mapDraftDirty && !window.confirm('這張地圖卡有尚未儲存的修改，確定要放棄嗎？')) return;
    setEditorOpen(false);
    setReturnToProgress(false);
  }

  function openMapEditor(mapCode: string) {
    if (mapDraftDirty && draft?.mapCode !== mapCode && !window.confirm('目前地圖卡有尚未儲存的修改，確定要放棄並切換嗎？')) return;
    setSelectedCode(mapCode);
    setEditorOpen(true);
  }

  function startMapBatchSelection() {
    if (mapDraftDirty && !window.confirm('這張地圖卡有尚未儲存的修改，確定要放棄並開始批次選取嗎？')) return;
    setEditorOpen(false);
    mapSelection.start();
  }

  async function applyBatchFlip(kind: 'MAP' | 'LOCATION') {
    const selection = kind === 'MAP' ? mapSelection : locationSelection;
    const codes = selection.selected;
    if (!codes.length || busy || !map) return;
    const records = kind === 'MAP' ? map.tiles : map.locations;
    const updates = codes.map(code => {
      const record = records.find(item => (kind === 'MAP' ? 'mapCode' in item && item.mapCode === code : 'locationCode' in item && item.locationCode === code));
      return { code, isRevealed: !record?.isRevealed };
    });
    if (kind === 'MAP') {
      try {
        await preloadImages(updates.filter(update => update.isRevealed).map(update => mapImageUrl(update.code, true)));
      } catch {
        showError('部分地圖圖片載入失敗，請檢查網路後重試。');
        return;
      }
    }
    const succeeded = await mutate(
      kind === 'MAP' ? '/api/campaign/map/tiles/batch' : '/api/campaign/map/locations/batch',
      'PATCH',
      { updates },
      kind === 'MAP' ? 'map-batch' : 'location-batch',
    );
    if (!succeeded) return;
    showSuccess(kind === 'MAP' ? `已翻轉並儲存 ${codes.length} 張地圖卡。` : `已翻轉並儲存 ${codes.length} 張地點卡。`);
    selection.cancel();
  }

  function returnToCardProgress() {
    if (editorOpen && mapDraftDirty && !window.confirm('這張地圖卡有尚未儲存的修改，確定要放棄並返回卡片清單嗎？')) return;
    setEditorOpen(false);
    setReturnToProgress(false);
    progressSectionRef.current?.returnToCard(progressReturnCardCode);
  }

  const selectedCards = useMemo(
    () => map?.cards.filter(card => card.locationType === 'MAP' && card.locationCode === selectedCode) ?? [],
    [map, selectedCode],
  );
  function selectLocationCard(locationCode: string) {
    setSelectedLocationCode(locationCode);
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    window.requestAnimationFrame(() => {
      locationRecordsRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  }

  const selectedLocationCards = useMemo(
    () => map?.cards.filter(card => card.locationType === 'LOCATION' && card.locationCode === selectedLocationCode) ?? [],
    [map, selectedLocationCode],
  );
  const placementOptions = useMemo(() => [
    ...map?.tiles.map(tile => ({ value: 'MAP:' + tile.mapCode, label: tile.mapCode })) ?? [],
    ...map?.locations.map(location => ({ value: 'LOCATION:' + location.locationCode, label: location.locationCode })) ?? [],
  ], [map]);
  const normalizedCardCode = cardCode.trim().toUpperCase();
  const placedCardCodes = useMemo(() => new Set(map?.cards.map(card => card.cardCode) ?? []), [map]);
  const availablePlacementCards = useMemo(() => ({
    story: map?.cardProgress.filter(card => card.cardType === 'STORY' && !card.isResolved && !card.locationCode) ?? [],
    mission: map?.cardProgress.filter(card => card.cardType === 'MISSION' && !card.isResolved && !card.locationCode) ?? [],
    feature: Array.from({ length: 16 }, (_, index) => `F${String(index + 1).padStart(3, '0')}`)
      .filter(code => !placedCardCodes.has(code)),
  }), [map, placedCardCodes]);
  const existingProgressForInput = map?.cardProgress.find(card => card.cardCode === normalizedCardCode);
  const placementBlockedMessage = existingProgressForInput?.isResolved
    ? normalizedCardCode + ' 已完成／不再使用，不能再次放置。'
    : '';
  const usedTimeTokenCodes = useMemo(() => new Set([
    ...(map?.cardProgress.flatMap(card => card.timeToken ? [card.timeToken.tokenCode] : []) ?? []),
    ...(map?.cards.flatMap(card => card.timeToken ? [card.timeToken.tokenCode] : []) ?? []),
  ]), [map]);
  const availableTimeTokenCodes = (['A', 'B', 'C', 'D'] as const).filter(code => !usedTimeTokenCodes.has(code));

  async function placeTimeToken(storyCardCode: string, tokenCode: 'A' | 'B' | 'C' | 'D', tokenDelay: number) {
    if (!availableTimeTokenCodes.includes(tokenCode) || !beginExternal('time-token-' + storyCardCode)) return false;
    try {
      const response = await fetch('/api/campaign/wagon/time-tokens', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyCardCode, tokenCode, unlockAfterDays: tokenDelay }),
      });
      const result = await response.json().catch(() => null) as CampaignWagonResponse | ApiErrorResponse | null;
      if (!response.ok || !result || !('data' in result)) {
        if (response.status === 401) {
          showError('登入已失效，請重新登入後再操作。', { reauthRequired: true });
        } else if (response.status === 409) {
          showError('這枚 Token 或劇情卡已有有效的時間標記，已重新載入地圖。');
        } else if (response.status >= 500) {
          showError('伺服器暫時無法放置 Time Token，請稍後重試。');
        } else {
          showError(getApiErrorMessage(result, '無法放置 Time Token，請檢查輸入。'));
        }
        await loadMap().catch(() => undefined);
        return false;
      }
      await loadMap();
      showSuccess(storyCardCode + ' 已放置 Token ' + tokenCode + '。');
      return true;
    } catch {
      showError('無法連線到伺服器，請檢查網路後重試。');
      return false;
    } finally {
      endExternal();
    }
  }

  async function flipLocationCard() {
    if (!locationDraft || busy) return;
    const next = {
      ...locationDraft,
      isRevealed: !locationDraft.isRevealed,
      face: locationDraft.isRevealed ? 'BACK' as const : 'FRONT' as const,
    };
    await mutate('/api/campaign/map/locations/' + locationDraft.locationCode, 'PATCH', next, 'location-flip');
  }

  async function flipDraftCard() {
    if (!draft || flippingCode || loadingFlipCode) return;

    const mapCode = draft.mapCode;
    const nextRevealed = !draft.isRevealed;
    const nextDraft = {
      ...draft,
      isRevealed: nextRevealed,
      face: nextRevealed ? 'FRONT' as const : 'BACK' as const,
    };

    setLoadingFlipCode(mapCode);
    clearToast();
    try {
      await preloadImage(mapImageUrl(mapCode, nextRevealed));
    } catch {
      showError('地圖圖片載入失敗，請檢查網路後重試。');
      return;
    } finally {
      setLoadingFlipCode('');
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDraft(nextDraft);
      return;
    }

    setFlippingCode(mapCode);
    await new Promise(resolve => window.setTimeout(resolve, 170));
    setDraft(nextDraft);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setFlippingCode(''));
    });
  }

  function confirmResolutionWithTimeToken(cardCode: string, timeToken: { tokenCode: 'A' | 'B' | 'C' | 'D'; unlockAtDay: number | null } | null) {
    if (!timeToken) return true;
    const unlockText = timeToken.unlockAtDay === null ? '' : `，第 ${timeToken.unlockAtDay} 天解鎖`;
    return window.confirm(`${cardCode} 目前仍有 Token ${timeToken.tokenCode}${unlockText}。標記完成後會同時移除這枚 Token，確定繼續嗎？`);
  }



  function openProgressCard(card: CampaignMapCard) {
    setProgressReturnCardCode(card.cardCode);
    progressSectionRef.current?.openCard(card.cardCode);
  }

  function locateProgressCard(card: CampaignCardProgress) {
    if (!card.locationCode) return;
    setProgressReturnCardCode(card.cardCode);
    setReturnToProgress(true);
    if (card.locationType === 'MAP') {
      openMapEditor(card.locationCode);
      document.getElementById('core-map-grid')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      return;
    }
    setSelectedLocationCode(card.locationCode);
    document.getElementById('location-cards-title')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function changeProgressStatus(card: CampaignCardProgress) {
    if (card.isResolved && !window.confirm('將 ' + card.cardCode + ' 更正為未完成？這只應用於修正誤記。')) return;
    if (!card.isResolved && !confirmResolutionWithTimeToken(card.cardCode, card.timeToken)) return;
    void mutate('/api/campaign/map/card-progress/' + card.cardCode, 'PATCH', { isResolved: !card.isResolved }, 'card-progress');
  }

  async function updatePlacedCard(
    card: CampaignMapCard,
    changes: Partial<Pick<CampaignMapCard, 'locationType' | 'locationCode' | 'status' | 'notes' | 'isInTownDeck'>>,
    action: string,
  ) {
    return mutate('/api/campaign/map/cards', 'POST', {
      cardCode: card.cardCode,
      locationType: changes.locationType ?? card.locationType,
      locationCode: changes.locationCode ?? card.locationCode,
      status: changes.status ?? card.status,
      notes: changes.notes ?? card.notes,
      isInTownDeck: changes.isInTownDeck ?? card.isInTownDeck,
    }, action);
  }

  function renderPlacedCard(card: CampaignMapCard) {
    return <PlacedCampaignCard
      key={card.id}
      card={card}
      busy={busy}
      placementOptions={placementOptions}
      availableTimeTokenCodes={availableTimeTokenCodes}
      onOpenProgress={openProgressCard}
      onUpdate={updatePlacedCard}
      onRemove={item => void mutate('/api/campaign/map/cards/' + item.id, 'DELETE', {}, 'remove-card')}
      onPlaceTimeToken={placeTimeToken}
    />;
  }

  if (loading) return <section className="campaign-gate"><p className="eyebrow">VERIFYING SESSION</p><h1>正在確認戰役憑證…</h1></section>;
  if (!session) return <section className="campaign-gate"><Shield aria-hidden="true" /><p className="eyebrow">CAMPAIGN ACCESS REQUIRED</p><h1>登入後查看地圖</h1><Link className="button" to="/login" state={{ from: '/campaigns/map' }}>登入戰役</Link></section>;
  if (!map) return <section className="campaign-gate"><MapPinned aria-hidden="true" /><p className="eyebrow">LOADING CAMPAIGN MAP</p><h1>{message || '正在載入戰役地圖…'}</h1><button className="button" onClick={() => loadMap()} type="button">重新載入</button></section>;

  return <section className="campaign-page campaign-map-page" aria-labelledby="campaign-map-title">
    <header className="campaign-module-heading">
      <div><p className="eyebrow">CAMPAIGN MAP · CORE SET</p><h1 id="campaign-map-title">戰役地圖</h1><p>{session.campaignName} · 核心地圖 M01～M20</p></div>
      <span><MapPinned aria-hidden="true" />4 × 5</span>
    </header>

    {!editorOpen&&versionConflict&&canRetry&&<VersionConflictPanel title="地圖資料已被其他玩家更新" changedFields={versionConflict.fields} expectedVersion={versionConflict.expectedVersion} currentVersion={versionConflict.currentVersion} busy={Boolean(busy)} onReload={()=>adoptLatest('已採用最新地圖資料。')} onReapply={()=>void retry()}/>}

    <Toast
      message={message}
      kind={messageKind === 'error' ? 'error' : 'success'}
      className="map-toast"
      onClose={clearToast}
      onRetry={canRetry ? () => void retry() : undefined}
      reauthRequired={reauthRequired}
    />

    <div className="map-workspace">
      <div className="map-batch-toolbar" aria-label="地圖卡批次操作">
        {!mapSelection.active
          ? <button className="button secondary" disabled={Boolean(busy)} onClick={startMapBatchSelection} type="button">批次選取地圖卡</button>
          : <>
            <strong>已選擇 {mapSelection.selectedCount} 張地圖卡</strong>
            <button type="button" disabled={Boolean(busy)} onClick={mapSelection.selectAll}>全選</button>
            <button type="button" disabled={Boolean(busy) || !mapSelection.selectedCount} onClick={mapSelection.clear}>清除</button>
            <button type="button" disabled={Boolean(busy) || !mapSelection.selectedCount} onClick={() => void applyBatchFlip('MAP')}>{busy === 'map-batch' ? '儲存中…' : '翻轉並儲存'}</button>
            <button type="button" disabled={Boolean(busy)} onClick={mapSelection.cancel}>取消</button>
          </>}
      </div>
      <div className="core-map-grid" id="core-map-grid" aria-label="核心地圖 M01 到 M20">
        {map.tiles.map(tile => {
          const cards = map.cards.filter(card => card.locationType === 'MAP' && card.locationCode === tile.mapCode);
          const occupied = map.currentMapCode === tile.mapCode;
          const displayRevealed = editorOpen && draft?.mapCode === tile.mapCode ? draft.isRevealed : tile.isRevealed;
          return <button
            className={'map-card-placeholder' + (displayRevealed ? ' is-revealed' : '') + (!mapSelection.active && selectedCode === tile.mapCode ? ' is-selected' : '') + (mapSelection.isSelected(tile.mapCode) ? ' is-batch-selected' : '') + (flippingCode === tile.mapCode ? ' is-flipping' : '')}
            key={tile.mapCode} onClick={() => { if (flippingCode || loadingFlipCode) return; if (mapSelection.active) mapSelection.toggle(tile.mapCode); else openMapEditor(tile.mapCode); }} type="button"
            aria-pressed={mapSelection.active ? mapSelection.isSelected(tile.mapCode) : selectedCode === tile.mapCode}
          >
            <img
              alt={tile.mapCode + (displayRevealed ? ' 正面' : ' 背面')}
              src={mapImageUrl(tile.mapCode, displayRevealed)}
              loading="lazy"
              decoding="async"
            />
            <span className="map-tile-state">{displayRevealed ? '已揭示' : '未揭示'}</span>
            {occupied && <span className="hunter-marker" title={map.currentLocationType === 'LOCATION' ? '獵人目前位於 ' + map.currentLocationCode : '獵人目前位置'}><MapPin aria-hidden="true" /></span>}
            {cards.length > 0 && (
              <span
                className="map-card-codes"
                aria-label={'放置卡片：' + cards.map(card => card.cardCode).join('、')}
              >
                {cards.map(card => (
                  <span className={'map-card-code ' + card.status.toLowerCase()} key={card.id}>
                    {card.cardCode}{card.timeToken ? ' · ' + card.timeToken.tokenCode : ''}
                  </span>
                ))}
              </span>
            )}
          </button>;
        })}
      </div>

      {draft && editorOpen && <aside className="map-editor map-editor-drawer" aria-labelledby="map-editor-title" aria-modal="true" role="dialog">
        <header><div><p className="eyebrow">SELECTED MAP CARD</p><h2 id="map-editor-title">{draft.mapCode}</h2>{mapDraftDirty && <span className="unsaved-badge">尚未儲存</span>}</div><div className="map-editor-header-actions">{returnToProgress && <button className="text-button" onClick={returnToCardProgress} type="button">返回卡片清單</button>}<button className="icon-button" aria-label="關閉地圖卡紀錄" onClick={closeMapEditor} type="button"><X aria-hidden="true" /></button></div></header>

        {versionConflict&&canRetry&&<VersionConflictPanel title="地圖資料已被其他玩家更新" changedFields={versionConflict.fields} expectedVersion={versionConflict.expectedVersion} currentVersion={versionConflict.currentVersion} busy={Boolean(busy)} onReload={()=>adoptLatest('已採用最新地圖資料。')} onReapply={()=>void retry()}/>}

        <div className="map-editor-actions">
          <button
            className={'reveal-toggle ' + (draft.isRevealed ? 'is-revealed' : '')}
            disabled={Boolean(flippingCode || loadingFlipCode)}
            onClick={() => void flipDraftCard()}
            type="button"
          >
            {loadingFlipCode === draft.mapCode
              ? <>圖片載入中…</>
              : draft.isRevealed
                ? <><Check aria-hidden="true" />正面 · 已揭示</>
                : <>背面 · 未揭示</>}
          </button>
        </div>

        <label className="map-field"><span>資源與其他標記</span><textarea value={draft.resourceNotes} onChange={event => setDraft({ ...draft, resourceNotes: event.target.value })} placeholder="人工輸入，例如：藥草 2、線索標記 1" rows={3} /></label>
        <label className="map-field"><span>地圖卡備註</span><textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="記錄桌遊上的特殊狀態" rows={3} /></label>

        <div className="map-editor-primary-actions map-editor-save-bar" aria-live="polite">
          <button className="button" disabled={Boolean(busy)} onClick={() => mutate('/api/campaign/map/tiles/' + draft.mapCode, 'PATCH', draft, 'tile')} type="button"><Save aria-hidden="true" />{busy === 'tile' ? '儲存中…' : savedAction === 'tile' ? '已儲存' : '儲存卡片紀錄'}</button>
          <button className="button secondary" disabled={Boolean(busy)} onClick={() => mutate('/api/campaign/map/position', 'PATCH', { locationType: 'MAP', locationCode: draft.mapCode }, 'position')} type="button"><MapPin aria-hidden="true" />{busy === 'position' ? '儲存中…' : savedAction === 'position' ? '已儲存' : '設為獵人位置'}</button>
          <button className="button secondary mobile-map-close" onClick={closeMapEditor} type="button"><X aria-hidden="true" />關閉</button>
        </div>

        <section className="map-placed-cards">
          <div className="map-subheading"><div><p className="eyebrow">S / J / F CARDS</p><h3>放置卡片</h3></div><span>{selectedCards.length} 張</span></div>
          <div className="map-card-form">
            <label><span>卡片編號</span><select aria-invalid={Boolean(placementBlockedMessage)} value={cardCode} onChange={event => setCardCode(event.target.value)}>
              <option value="">選擇卡片</option>
              <optgroup label="劇情卡 S">{availablePlacementCards.story.map(card => <option key={card.cardCode} value={card.cardCode}>{card.cardCode}</option>)}</optgroup>
              <optgroup label="任務卡 J">{availablePlacementCards.mission.map(card => <option key={card.cardCode} value={card.cardCode}>{card.cardCode}</option>)}</optgroup>
              <optgroup label="大劇情卡 F">{availablePlacementCards.feature.map(code => <option key={code} value={code}>{code}</option>)}</optgroup>
            </select></label>
            <label><span>備註</span><input value={cardNotes} onChange={event => setCardNotes(event.target.value)} placeholder="可留空" /></label>
            <button className="button" disabled={Boolean(busy) || !cardCode.trim() || Boolean(placementBlockedMessage)} onClick={async () => {
              const succeeded = await mutate('/api/campaign/map/cards', 'POST', { cardCode, locationCode: draft.mapCode, status: 'PENDING', notes: cardNotes }, 'card');
              if (succeeded) { setCardCode(''); setCardNotes(''); }
            }} type="button">放置</button>
            {placementBlockedMessage && <p className="map-form-error" role="alert">{placementBlockedMessage}</p>}
          </div>
          <div className="placed-card-list">
            {selectedCards.length === 0 && <p className="map-empty">這張地圖卡目前沒有 S／J／F 卡。</p>}
            {selectedCards.map(renderPlacedCard)}
          </div>
        </section>
      </aside>}
    </div>

    <section className="location-card-section" aria-labelledby="location-cards-title">
      <header className="campaign-module-heading compact">
        <div><p className="eyebrow">LOCATION CARDS</p><h2 id="location-cards-title">地點卡</h2><p>核心 L01～L11 · 擴充 L12～L14</p></div>
        <span>{map.locations.length} 張</span>
      </header>
      <div className="map-batch-toolbar location-batch-toolbar" aria-label="地點卡批次操作">
        {!locationSelection.active
          ? <button className="button secondary" disabled={Boolean(busy)} onClick={locationSelection.start} type="button">批次選取地點卡</button>
          : <>
            <strong>已選擇 {locationSelection.selectedCount} 張地點卡</strong>
            <button type="button" disabled={Boolean(busy)} onClick={locationSelection.selectAll}>全選</button>
            <button type="button" disabled={Boolean(busy) || !locationSelection.selectedCount} onClick={locationSelection.clear}>清除</button>
            <button type="button" disabled={Boolean(busy) || !locationSelection.selectedCount} onClick={() => void applyBatchFlip('LOCATION')}>{busy === 'location-batch' ? '儲存中…' : '翻轉並儲存'}</button>
            <button type="button" disabled={Boolean(busy)} onClick={locationSelection.cancel}>取消</button>
          </>}
      </div>
      <div className="location-card-grid">
        {map.locations.map(location => {
          const occupied = map.currentLocationType === 'LOCATION' && map.currentLocationCode === location.locationCode;
          const count = map.cards.filter(card => card.locationType === 'LOCATION' && card.locationCode === location.locationCode).length;
          return <button
            className={'location-card-button' + (!locationSelection.active && selectedLocationCode === location.locationCode ? ' is-selected' : '') + (locationSelection.isSelected(location.locationCode) ? ' is-batch-selected' : '') + (location.isRevealed ? ' is-revealed' : '')}
            key={location.locationCode}
            onClick={() => locationSelection.active ? locationSelection.toggle(location.locationCode) : selectLocationCard(location.locationCode)}
            type="button"
            aria-pressed={locationSelection.active ? locationSelection.isSelected(location.locationCode) : selectedLocationCode === location.locationCode}
          >
            <strong>{location.locationCode}</strong><small>{location.isRevealed ? (location.face === 'FRONT' ? '正面' : '背面') : '尚未揭示'}</small>
            {occupied && <MapPin aria-hidden="true" />}
            {count > 0 && <span>{count}</span>}
          </button>;
        })}
      </div>

      {locationDraft && !locationSelection.active && <div className="location-editor">
        <div className="location-editor-fields">
          <div className="map-editor-actions">
            <button className={'reveal-toggle ' + (locationDraft.isRevealed ? 'is-revealed' : '')} disabled={Boolean(busy)} onClick={() => void flipLocationCard()} type="button"><Check aria-hidden="true" />{busy === 'location-flip' ? '翻轉儲存中…' : '翻轉並儲存'}<small>{locationDraft.isRevealed ? '目前：正面' : '目前：覆蓋面'}</small></button>
          </div>
          <label className="map-field"><span>資源與其他標記</span><textarea value={locationDraft.resourceNotes} onChange={event => setLocationDraft({ ...locationDraft, resourceNotes: event.target.value })} rows={3} /></label>
          <label className="map-field"><span>地點卡備註</span><textarea value={locationDraft.notes} onChange={event => setLocationDraft({ ...locationDraft, notes: event.target.value })} rows={3} /></label>
          <div className="map-editor-primary-actions"><button className="button" disabled={Boolean(busy)} onClick={() => mutate('/api/campaign/map/locations/' + locationDraft.locationCode, 'PATCH', locationDraft, 'location')} type="button"><Save aria-hidden="true" />{busy === 'location' ? '儲存中…' : savedAction === 'location' ? '已儲存' : '儲存地點卡'}</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => mutate('/api/campaign/map/position', 'PATCH', { locationType: 'LOCATION', locationCode: locationDraft.locationCode }, 'position')} type="button"><MapPin aria-hidden="true" />設為獵人位置</button></div>
        </div>
        <div className="location-card-records" ref={locationRecordsRef}>
          <div className="map-subheading"><div><p className="eyebrow">PLACED CARDS</p><h3>{locationDraft.locationCode} 上的卡片</h3></div><div className="map-subheading-actions">{returnToProgress && <button className="text-button" onClick={returnToCardProgress} type="button">返回卡片清單</button>}<span>{selectedLocationCards.length} 張</span><button className={"mobile-location-flip " + (locationDraft.isRevealed ? "is-revealed" : "")} disabled={Boolean(busy)} onClick={() => void flipLocationCard()} type="button"><Check aria-hidden="true" />{busy === "location-flip" ? "翻轉中…" : locationDraft.isRevealed ? "正面" : "覆蓋面"}</button></div></div>
          <div className="map-card-form"><label><span>卡片編號</span><select aria-invalid={Boolean(placementBlockedMessage)} value={cardCode} onChange={event => setCardCode(event.target.value)}>
              <option value="">選擇卡片</option>
              <optgroup label="劇情卡 S">{availablePlacementCards.story.map(card => <option key={card.cardCode} value={card.cardCode}>{card.cardCode}</option>)}</optgroup>
              <optgroup label="任務卡 J">{availablePlacementCards.mission.map(card => <option key={card.cardCode} value={card.cardCode}>{card.cardCode}</option>)}</optgroup>
              <optgroup label="大劇情卡 F">{availablePlacementCards.feature.map(code => <option key={code} value={code}>{code}</option>)}</optgroup>
            </select></label><label><span>備註</span><input value={cardNotes} onChange={event => setCardNotes(event.target.value)} /></label><button className="button" disabled={Boolean(busy) || !cardCode.trim() || Boolean(placementBlockedMessage)} onClick={async () => { const succeeded = await mutate('/api/campaign/map/cards', 'POST', { cardCode, locationType: 'LOCATION', locationCode: locationDraft.locationCode, status: 'PENDING', notes: cardNotes }, 'card'); if (succeeded) { setCardCode(''); setCardNotes(''); } }} type="button">放置</button>{placementBlockedMessage && <p className="map-form-error" role="alert">{placementBlockedMessage}</p>}</div>
          <div className="placed-card-list">
            {selectedLocationCards.length === 0 && <p className="map-empty">這張地點卡目前沒有 S／J／F 卡。</p>}
            {selectedLocationCards.map(renderPlacedCard)}
          </div>
        </div>
      </div>}
    </section>

    <CampaignCardProgressSection
      ref={progressSectionRef}
      cards={map.cardProgress}
      busy={Boolean(busy)}
      onLocate={locateProgressCard}
      onChangeStatus={changeProgressStatus}
    />

    <EventRecordsSection
      initialRoadNotes={roadEventNotes}
      initialTownNotes={townEventNotes}
      expectedVersion={map.version}
      onSaved={updatedMap => {
        setMap(updatedMap);
        setRoadEventNotes(updatedMap.roadEventNotes);
        setTownEventNotes(updatedMap.townEventNotes);
      }}
      onAdoptLatest={latestMap => {
        setMap(latestMap);
        setRoadEventNotes(latestMap.roadEventNotes);
        setTownEventNotes(latestMap.townEventNotes);
      }}
      disabled={Boolean(busy)}
      onSavingChange={saving => { if (saving) beginExternal('event-notes'); else endExternal(); }}
      onToast={showSuccess}
      onError={showError}
      variant="map"
    />
  </section>;
}

