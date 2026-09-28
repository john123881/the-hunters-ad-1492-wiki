import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, MapPin, MapPinned, Save, Shield, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ApiErrorResponse, AuthSession, CampaignLocationCard, CampaignMap, CampaignMapCard, CampaignMapResponse, CampaignMapTile, CampaignWagonResponse } from '../../shared/types';

function errorMessage(payload: unknown, fallback: string) {
  return (payload as ApiErrorResponse | null)?.error?.message ?? fallback;
}

type MutationRequest = {
  path: string;
  method: 'PATCH' | 'POST' | 'DELETE';
  payload: object;
  action: string;
};
export function CampaignMapPage({ session, loading }: { session: AuthSession | null; loading: boolean }) {
  const [map, setMap] = useState<CampaignMap | null>(null);
  const [selectedCode, setSelectedCode] = useState('M01');
  const [draft, setDraft] = useState<CampaignMapTile | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedLocationCode, setSelectedLocationCode] = useState('L01');
  const [locationDraft, setLocationDraft] = useState<CampaignLocationCard | null>(null);
  const [roadEventNotes, setRoadEventNotes] = useState('');
  const [townEventNotes, setTownEventNotes] = useState('');
  const [cardCode, setCardCode] = useState('');
  const [cardNotes, setCardNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'error'>('success');
  const [progressTypeFilter, setProgressTypeFilter] = useState<'ALL' | 'STORY' | 'MISSION'>('ALL');
  const [progressStateFilter, setProgressStateFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [progressQuery, setProgressQuery] = useState('');
  const [flippingCode, setFlippingCode] = useState('');
  const [returnToProgress, setReturnToProgress] = useState(false);
  const [savedAction, setSavedAction] = useState('');
  const [failedMutation, setFailedMutation] = useState<MutationRequest | null>(null);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [tokenCardCode, setTokenCardCode] = useState('');
  const [tokenCode, setTokenCode] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [tokenDelay, setTokenDelay] = useState(1);
  const [editingCardNoteId, setEditingCardNoteId] = useState<number | null>(null);
  const [editingCardNote, setEditingCardNote] = useState('');
  const savedTimerRef = useRef<number | null>(null);

  const loadMap = useCallback(async () => {
    if (!session) return;
    const response = await fetch('/api/campaign/map', { credentials: 'same-origin' });
    const payload = await response.json() as CampaignMapResponse | ApiErrorResponse;
    if (!response.ok || !('data' in payload)) throw new Error(errorMessage(payload, '目前無法讀取地圖。'));
    setMap(payload.data);
  }, [session]);

  useEffect(() => {
    document.title = '戰役地圖｜THE HUNTERS A.D. 1492';
    loadMap().catch(error => {
      setMessageKind('error');
      setMessage(error instanceof Error ? error.message : '目前無法讀取地圖。');
    });
  }, [loadMap]);

  useEffect(() => {
    const tile = map?.tiles.find(item => item.mapCode === selectedCode);
    setDraft(tile ? { ...tile, face: tile.isRevealed ? 'FRONT' : 'BACK' } : null);
  }, [map, selectedCode]);

  useEffect(() => {
    const location = map?.locations.find(item => item.locationCode === selectedLocationCode);
    setLocationDraft(location ? { ...location } : null);
  }, [map, selectedLocationCode]);

  useEffect(() => {
    if (!map) return;
    setRoadEventNotes(map.roadEventNotes);
    setTownEventNotes(map.townEventNotes);
  }, [map]);

  useEffect(() => () => {
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
  }, []);

  useEffect(() => {
    if (!editorOpen || !window.matchMedia('(max-width: 720px), (max-height: 600px) and (pointer: coarse)').matches) return;
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
  }, [editorOpen]);

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

  function returnToCardProgress() {
    if (editorOpen && mapDraftDirty && !window.confirm('這張地圖卡有尚未儲存的修改，確定要放棄並返回卡片清單嗎？')) return;
    setEditorOpen(false);
    setReturnToProgress(false);
    document.getElementById('campaign-card-progress-title')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  const selectedCards = useMemo(
    () => map?.cards.filter(card => card.locationType === 'MAP' && card.locationCode === selectedCode) ?? [],
    [map, selectedCode],
  );
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
  const visibleCardProgress = useMemo(() => map?.cardProgress.filter(card => {
    const typeMatches = progressTypeFilter === 'ALL' || card.cardType === progressTypeFilter;
    const stateMatches = progressStateFilter === 'ALL'
      || (progressStateFilter === 'RESOLVED' ? card.isResolved : !card.isResolved);
    const queryMatches = card.cardCode.includes(progressQuery.trim().toUpperCase());
    return typeMatches && stateMatches && queryMatches;
  }) ?? [], [map, progressQuery, progressStateFilter, progressTypeFilter]);
  const resolvedCardCount = map?.cardProgress.filter(card => card.isResolved).length ?? 0;
  const usedTimeTokenCodes = useMemo(() => new Set([
    ...(map?.cardProgress.flatMap(card => card.timeToken ? [card.timeToken.tokenCode] : []) ?? []),
    ...(map?.cards.flatMap(card => card.timeToken ? [card.timeToken.tokenCode] : []) ?? []),
  ]), [map]);
  const availableTimeTokenCodes = (['A', 'B', 'C', 'D'] as const).filter(code => !usedTimeTokenCodes.has(code));


  async function placeTimeToken(storyCardCode: string) {
    if (busy || !availableTimeTokenCodes.includes(tokenCode)) return;
    setBusy('time-token-' + storyCardCode);
    setMessage('');
    setFailedMutation(null);
    setReauthRequired(false);
    try {
      const response = await fetch('/api/campaign/wagon/time-tokens', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyCardCode, tokenCode, unlockAfterDays: tokenDelay }),
      });
      const result = await response.json().catch(() => null) as CampaignWagonResponse | ApiErrorResponse | null;
      if (!response.ok || !result || !('data' in result)) {
        setMessageKind('error');
        if (response.status === 401) {
          setReauthRequired(true);
          setMessage('登入已失效，請重新登入後再操作。');
        } else if (response.status === 409) {
          setMessage('這枚 Token 或劇情卡已有有效的時間標記，已重新載入地圖。');
        } else if (response.status >= 500) {
          setMessage('伺服器暫時無法放置 Time Token，請稍後重試。');
        } else {
          setMessage(errorMessage(result, '無法放置 Time Token，請檢查輸入。'));
        }
        await loadMap().catch(() => undefined);
        return;
      }
      await loadMap();
      setTokenCardCode('');
      setMessageKind('success');
      setMessage(storyCardCode + ' 已放置 Token ' + tokenCode + '。');
    } catch {
      setMessageKind('error');
      setMessage('無法連線到伺服器，請檢查網路後重試。');
    } finally {
      setBusy('');
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
    if (!draft || flippingCode) return;
    const nextDraft = { ...draft, isRevealed: !draft.isRevealed, face: draft.isRevealed ? 'BACK' as const : 'FRONT' as const };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDraft(nextDraft);
      return;
    }
    setFlippingCode(draft.mapCode);
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

  async function mutate(path: string, method: 'PATCH' | 'POST' | 'DELETE', payload: object, action: string) {
    if (!map || busy) return false;
    const request = { path, method, payload, action } satisfies MutationRequest;
    setBusy(action);
    setSavedAction('');
    setFailedMutation(null);
    setReauthRequired(false);
    setMessage('');
    setMessageKind('success');
    try {
      const response = await fetch(path, {
        method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, expectedVersion: map.version }),
      });
      const result = await response.json().catch(() => null) as CampaignMapResponse | ApiErrorResponse | null;
      if (!response.ok || !result || !('data' in result)) {
        setMessageKind('error');
        if (response.status === 401) {
          setReauthRequired(true);
          setMessage('登入已失效，請重新登入後再操作。');
        } else if (response.status === 409) {
          await loadMap().catch(() => undefined);
          setFailedMutation(request);
          setMessage('資料已被其他玩家更新，已載入最新版本。請檢查後再重試。');
        } else if (response.status >= 500) {
          setFailedMutation(request);
          setMessage('伺服器暫時無法完成儲存，請稍後重試。');
        } else {
          setMessage(errorMessage(result, '資料格式不正確，請檢查輸入內容。'));
        }
        return false;
      }
      setMap(result.data);
      setMessageKind('success');
      setMessage(response.status === 201 ? '已新增卡片紀錄。' : '地圖紀錄已更新。');
      setSavedAction(action);
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSavedAction(''), 1800);
      return true;
    } catch {
      setMessageKind('error');
      setFailedMutation(request);
      setMessage('無法連線到伺服器，請檢查網路後重試。');
      return false;
    } finally {
      setBusy('');
    }
  }

  function renderPlacedCard(card: CampaignMapCard) {
    const typeLabel = card.cardType === 'STORY' ? '劇情卡' : card.cardType === 'MISSION' ? '任務卡' : '大劇情卡';
    const tokenLabel = card.timeToken
      ? card.timeToken.tokenCode + (card.timeToken.unlockAtDay === null ? '' : ' · 第 ' + card.timeToken.unlockAtDay + ' 天')
      : '';
    return <article key={card.id}>
      <div><strong>{card.cardCode}</strong><small>{typeLabel}</small></div>
      {card.timeToken && <span className="time-token-chip"><Clock3 aria-hidden="true" />{tokenLabel}</span>}
      <select aria-label={'移動 ' + card.cardCode} disabled={Boolean(busy) || card.status === 'RESOLVED'} value={card.locationType + ':' + card.locationCode} onChange={event => {
        const [locationType, locationCode] = event.target.value.split(':');
        mutate('/api/campaign/map/cards', 'POST', {
          cardCode: card.cardCode, locationType, locationCode,
          status: card.status, notes: card.notes, isInTownDeck: card.isInTownDeck,
        }, 'move-card');
      }}>{placementOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      {card.cardType === 'FEATURE' && <button className={'status-toggle ' + (card.isInTownDeck ? 'resolved' : 'pending')} disabled={Boolean(busy)} onClick={() => mutate('/api/campaign/map/cards', 'POST', {
        cardCode: card.cardCode, locationType: card.locationType, locationCode: card.locationCode,
        status: card.status, notes: card.notes, isInTownDeck: !card.isInTownDeck,
      }, 'town-deck')} type="button">{card.isInTownDeck ? '已加入城鎮' : '未加入城鎮'}</button>}
      <button className="status-toggle pending" disabled={Boolean(busy)} onClick={() => {
        setEditingCardNoteId(current => current === card.id ? null : card.id);
        setEditingCardNote(card.notes);
      }} type="button">{card.notes ? '修改備註' : '新增備註'}</button>
      {card.cardType === 'STORY' && card.status === 'PENDING' && !card.timeToken && <button className="status-toggle pending" disabled={Boolean(busy) || availableTimeTokenCodes.length === 0} onClick={() => {
        const nextCode = availableTimeTokenCodes[0];
        if (nextCode) setTokenCode(nextCode);
        setTokenCardCode(current => current === card.cardCode ? '' : card.cardCode);
      }} type="button">{availableTimeTokenCodes.length === 0 ? 'Token 已用完' : '放置 Token'}</button>}
      <button className={'status-toggle ' + card.status.toLowerCase()} disabled={Boolean(busy) || card.status === 'RESOLVED'} onClick={() => {
        if (!confirmResolutionWithTimeToken(card.cardCode, card.timeToken)) return;
        mutate('/api/campaign/map/cards', 'POST', {
          cardCode: card.cardCode, locationType: card.locationType, locationCode: card.locationCode,
          status: 'RESOLVED', notes: card.notes, isInTownDeck: card.isInTownDeck,
        }, 'card-status');
      }} type="button">{card.status === 'PENDING' ? '標記完成' : '已完成'}</button>
      <button className="icon-button danger" aria-label={'移除 ' + card.cardCode} disabled={Boolean(busy)} onClick={() => {
        if (window.confirm('移除 ' + card.cardCode + ' 的位置紀錄？')) {
          mutate('/api/campaign/map/cards/' + card.id, 'DELETE', {}, 'remove-card');
        }
      }} type="button"><Trash2 aria-hidden="true" /></button>
      {tokenCardCode === card.cardCode && <div className="inline-time-token-form">
        <label><span>Time Token</span><select value={tokenCode} onChange={event => setTokenCode(event.target.value as 'A' | 'B' | 'C' | 'D')}>{availableTimeTokenCodes.map(code => <option key={code} value={code}>{code}</option>)}</select></label>
        <label><span>等待天數</span><input min={1} max={59} type="number" value={tokenDelay} onChange={event => setTokenDelay(Math.max(1, Number(event.target.value) || 1))} /></label>
        <button className="button" disabled={Boolean(busy)} onClick={() => void placeTimeToken(card.cardCode)} type="button">{busy === 'time-token-' + card.cardCode ? '放置中…' : '確認放置'}</button>
      </div>}
      {card.notes && editingCardNoteId !== card.id && <p className="placed-card-note"><strong>備註</strong><span>{card.notes}</span></p>}
      {editingCardNoteId === card.id && <div className="inline-card-note-form">
        <label><span>卡片備註</span><textarea maxLength={500} rows={2} value={editingCardNote} onChange={event => setEditingCardNote(event.target.value)} /></label>
        <div>
          <button className="button" disabled={Boolean(busy)} onClick={async () => {
            const succeeded = await mutate('/api/campaign/map/cards', 'POST', {
              cardCode: card.cardCode, locationType: card.locationType, locationCode: card.locationCode,
              status: card.status, notes: editingCardNote, isInTownDeck: card.isInTownDeck,
            }, 'card-note-' + card.id);
            if (succeeded) setEditingCardNoteId(null);
          }} type="button">{busy === 'card-note-' + card.id ? '儲存中…' : '儲存備註'}</button>
          <button className="button secondary" disabled={Boolean(busy)} onClick={() => setEditingCardNoteId(null)} type="button">取消</button>
        </div>
      </div>}
    </article>;
  }

  if (loading) return <section className="campaign-gate"><p className="eyebrow">VERIFYING SESSION</p><h1>正在確認戰役憑證…</h1></section>;
  if (!session) return <section className="campaign-gate"><Shield aria-hidden="true" /><p className="eyebrow">CAMPAIGN ACCESS REQUIRED</p><h1>登入後查看地圖</h1><Link className="button" to="/login" state={{ from: '/campaigns/map' }}>登入戰役</Link></section>;
  if (!map) return <section className="campaign-gate"><MapPinned aria-hidden="true" /><p className="eyebrow">LOADING CAMPAIGN MAP</p><h1>{message || '正在載入戰役地圖…'}</h1><button className="button" onClick={() => loadMap()} type="button">重新載入</button></section>;

  return <section className="campaign-page campaign-map-page" aria-labelledby="campaign-map-title">
    <header className="campaign-module-heading">
      <div><p className="eyebrow">CAMPAIGN MAP · CORE SET</p><h1 id="campaign-map-title">戰役地圖</h1><p>{session.campaignName} · 核心地圖 M01～M20</p></div>
      <span><MapPinned aria-hidden="true" />4 × 5</span>
    </header>

    {message && <div className={'toast map-toast ' + messageKind} role={messageKind === 'error' ? 'alert' : 'status'}><span>{message}</span><div className="map-toast-actions">{failedMutation && <button onClick={() => void mutate(failedMutation.path, failedMutation.method, failedMutation.payload, failedMutation.action)} type="button">重新嘗試</button>}{reauthRequired && <button onClick={() => window.location.assign('/login')} type="button">重新登入</button>}<button aria-label="關閉通知" onClick={() => setMessage('')} type="button"><X aria-hidden="true" /></button></div></div>}

    <div className="map-workspace">
      <div className="core-map-grid" id="core-map-grid" aria-label="核心地圖 M01 到 M20">
        {map.tiles.map(tile => {
          const cards = map.cards.filter(card => card.locationType === 'MAP' && card.locationCode === tile.mapCode);
          const occupied = map.currentMapCode === tile.mapCode;
          const displayRevealed = editorOpen && draft?.mapCode === tile.mapCode ? draft.isRevealed : tile.isRevealed;
          return <button
            className={'map-card-placeholder' + (displayRevealed ? ' is-revealed' : '') + (selectedCode === tile.mapCode ? ' is-selected' : '') + (flippingCode === tile.mapCode ? ' is-flipping' : '')}
            key={tile.mapCode} onClick={() => { if (flippingCode) return; openMapEditor(tile.mapCode); }} type="button"
            aria-pressed={selectedCode === tile.mapCode}
          >
            <img
              alt={tile.mapCode + (displayRevealed ? ' 正面' : ' 背面')}
              src={'/images/campaign/maps/' + tile.mapCode + '-' + (displayRevealed ? 'front' : 'back') + '.webp?v=12'}
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

        <div className="map-editor-actions">
          <button className={'reveal-toggle ' + (draft.isRevealed ? 'is-revealed' : '')} disabled={Boolean(flippingCode)} onClick={() => void flipDraftCard()} type="button">
            {draft.isRevealed ? <><Check aria-hidden="true" />正面 · 已揭示</> : <>背面 · 未揭示</>}
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
      <div className="location-card-grid">
        {map.locations.map(location => {
          const occupied = map.currentLocationType === 'LOCATION' && map.currentLocationCode === location.locationCode;
          const count = map.cards.filter(card => card.locationType === 'LOCATION' && card.locationCode === location.locationCode).length;
          return <button className={'location-card-button' + (selectedLocationCode === location.locationCode ? ' is-selected' : '') + (location.isRevealed ? ' is-revealed' : '')} key={location.locationCode} onClick={() => setSelectedLocationCode(location.locationCode)} type="button">
            <strong>{location.locationCode}</strong><small>{location.isRevealed ? (location.face === 'FRONT' ? '正面' : '背面') : '尚未揭示'}</small>
            {occupied && <MapPin aria-hidden="true" />}
            {count > 0 && <span>{count}</span>}
          </button>;
        })}
      </div>

      {locationDraft && <div className="location-editor">
        <div className="location-editor-fields">
          <div className="map-editor-actions">
            <button className={'reveal-toggle ' + (locationDraft.isRevealed ? 'is-revealed' : '')} disabled={Boolean(busy)} onClick={() => void flipLocationCard()} type="button"><Check aria-hidden="true" />{busy === 'location-flip' ? '翻轉儲存中…' : '翻轉並儲存'}<small>{locationDraft.isRevealed ? '目前：正面' : '目前：覆蓋面'}</small></button>
          </div>
          <label className="map-field"><span>資源與其他標記</span><textarea value={locationDraft.resourceNotes} onChange={event => setLocationDraft({ ...locationDraft, resourceNotes: event.target.value })} rows={3} /></label>
          <label className="map-field"><span>地點卡備註</span><textarea value={locationDraft.notes} onChange={event => setLocationDraft({ ...locationDraft, notes: event.target.value })} rows={3} /></label>
          <div className="map-editor-primary-actions"><button className="button" disabled={Boolean(busy)} onClick={() => mutate('/api/campaign/map/locations/' + locationDraft.locationCode, 'PATCH', locationDraft, 'location')} type="button"><Save aria-hidden="true" />{busy === 'location' ? '儲存中…' : savedAction === 'location' ? '已儲存' : '儲存地點卡'}</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => mutate('/api/campaign/map/position', 'PATCH', { locationType: 'LOCATION', locationCode: locationDraft.locationCode }, 'position')} type="button"><MapPin aria-hidden="true" />設為獵人位置</button></div>
        </div>
        <div className="location-card-records">
          <div className="map-subheading"><div><p className="eyebrow">PLACED CARDS</p><h3>{locationDraft.locationCode} 上的卡片</h3></div><div className="map-subheading-actions">{returnToProgress && <button className="text-button" onClick={returnToCardProgress} type="button">返回卡片清單</button>}<span>{selectedLocationCards.length} 張</span></div></div>
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

    <section className="campaign-card-progress-section" aria-labelledby="campaign-card-progress-title">
      <header className="campaign-module-heading compact">
        <div><p className="eyebrow">STORY / MISSION CARDS</p><h2 id="campaign-card-progress-title">劇情卡與任務卡清單</h2><p>未放置卡可標記完成；點選已放置卡會前往所在的地圖卡或地點卡。</p></div>
        <span>{resolvedCardCount} / {map.cardProgress.length} 已完成</span>
      </header>
      <div className="card-progress-toolbar">
        <label className="card-progress-search"><span>搜尋卡號</span><input value={progressQuery} onChange={event => setProgressQuery(event.target.value)} placeholder="例如 S083" /></label>
        <div role="group" aria-label="卡片類型">
          {(['ALL', 'STORY', 'MISSION'] as const).map(filter => <button className={progressTypeFilter === filter ? 'active' : ''} key={filter} onClick={() => setProgressTypeFilter(filter)} type="button">{filter === 'ALL' ? '全部' : filter === 'STORY' ? '劇情卡 S' : '任務卡 J'}</button>)}
        </div>
        <div role="group" aria-label="完成狀態">
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map(filter => <button className={progressStateFilter === filter ? 'active' : ''} key={filter} onClick={() => setProgressStateFilter(filter)} type="button">{filter === 'ALL' ? '全部狀態' : filter === 'OPEN' ? '未完成' : '已完成'}</button>)}
        </div>
        <p><span className="card-progress-key unplaced" />未放置 <span className="card-progress-key placed" />已放置 <span className="card-progress-key resolved" />已完成</p>
        <strong className="card-progress-result-count">找到 {visibleCardProgress.length} 張</strong>
      </div>
      <div className="campaign-card-progress-grid">
        {visibleCardProgress.length === 0 && <p className="card-progress-empty">找不到符合條件的卡片，請調整卡號或篩選條件。</p>}
        {visibleCardProgress.map(card => {
          const state = card.isResolved ? 'resolved' : card.locationCode ? 'placed' : 'unplaced';
          const stateLabel = card.isResolved ? '已完成' : card.locationCode ? '已放置於 ' + card.locationCode : '未放置';
          const locateCard = () => {
            if (!card.locationCode) return;
            setReturnToProgress(true);
            if (card.locationType === 'MAP') {
              openMapEditor(card.locationCode);
              document.getElementById('core-map-grid')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            } else {
              setSelectedLocationCode(card.locationCode);
              document.getElementById('location-cards-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            }
          };
          const changeStatus = () => {
            if (card.isResolved && !window.confirm('將 ' + card.cardCode + ' 更正為未完成？這只應用於修正誤記。')) return;
            if (!card.isResolved && !confirmResolutionWithTimeToken(card.cardCode, card.timeToken)) return;
            mutate('/api/campaign/map/card-progress/' + card.cardCode, 'PATCH', { isResolved: !card.isResolved }, 'card-progress');
          };
          return <article className={'campaign-card-progress ' + state} key={card.cardCode}>
            <button className="card-progress-code" disabled={Boolean(busy) || !card.locationCode} onClick={locateCard} title={card.locationCode ? '前往 ' + card.locationCode : '尚未放置'} type="button">
              <strong>{card.cardCode}</strong>
              {card.timeToken && <span className="card-progress-token" aria-label={'Token ' + card.timeToken.tokenCode}>{card.timeToken.tokenCode}</span>}
            </button>
            <button className="card-progress-action" disabled={Boolean(busy)} onClick={changeStatus} type="button">{card.isResolved ? '更正' : '完成'}</button>
            <span className="sr-only">{stateLabel}</span>
          </article>;
        })}
      </div>
    </section>

    <section className="event-notes-section" aria-labelledby="event-notes-title">
      <header className="campaign-module-heading compact"><div><p className="eyebrow">EVENT RECORDS</p><h2 id="event-notes-title">事件人工紀錄</h2><p>直接記錄已觸發的卡片名稱或桌遊結果。</p></div></header>
      <div className="event-note-fields"><label className="map-field"><span>道路事件卡 Road Card</span><textarea value={roadEventNotes} onChange={event => setRoadEventNotes(event.target.value)} rows={6} placeholder="每行記錄一張已觸發的道路事件卡" /></label><label className="map-field"><span>城鎮事件卡 Town Card</span><textarea value={townEventNotes} onChange={event => setTownEventNotes(event.target.value)} rows={6} placeholder="每行記錄一張已觸發的城鎮事件卡" /></label></div>
      <div className="map-editor-primary-actions"><button className="button" disabled={Boolean(busy)} onClick={() => mutate('/api/campaign/map/event-notes', 'PATCH', { roadEventNotes, townEventNotes }, 'event-notes')} type="button"><Save aria-hidden="true" />{busy === 'event-notes' ? '儲存中…' : savedAction === 'event-notes' ? '已儲存' : '儲存事件紀錄'}</button></div>
    </section>
  </section>;
}


