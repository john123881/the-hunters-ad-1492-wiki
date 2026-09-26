import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, LogOut, PackageOpen, Pencil, Shield, Sparkles, UserRound, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ApiErrorResponse, AuthSession, CampaignWagon, CampaignWagonResponse, ItemsResponse, WagonEquipmentInstance, WagonResource, WagonTimeToken } from '../../shared/types';

const DAY_ROWS = [Array.from({ length: 10 }, (_, index) => index + 1), Array.from({ length: 10 }, (_, index) => index + 11), Array.from({ length: 10 }, (_, index) => index + 21)];
const WORKSHOP_GEOMETRY: Record<string, { centers: [number, number][]; halfX: number; halfY: number }> = {
  armorers_tools: { centers: [[160, 650], [160, 594], [160, 538]], halfX: 40, halfY: 39 },
  alchemists_lab: { centers: [[400, 474], [400, 421], [400, 368]], halfX: 38, halfY: 37 },
  bowyers_table: { centers: [[602, 408], [602, 355], [602, 302]], halfX: 38, halfY: 37 },
  workshop: { centers: [[810, 408], [810, 355], [810, 302]], halfX: 38, halfY: 37 },
  blacksmiths_tools: { centers: [[1130, 560], [1130, 507], [1130, 454]], halfX: 39, halfY: 38 },
};
function diamondPoints(cx: number, cy: number, halfX: number, halfY: number) {
  return cx + ',' + (cy - halfY) + ' ' + (cx + halfX) + ',' + cy + ' ' + cx + ',' + (cy + halfY) + ' ' + (cx - halfX) + ',' + cy;
}

async function readError(response: Response) {
  try { return ((await response.json()) as ApiErrorResponse).error.message; }
  catch { return '操作失敗，請稍後再試。'; }
}

export function CampaignPage({ session, loading, onLogout }: {
  session: AuthSession | null; loading: boolean; onLogout: () => Promise<void>;
}) {
  const [wagon, setWagon] = useState<CampaignWagon | null>(null);
  const [wagonLoading, setWagonLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [shownCycle, setShownCycle] = useState(0);
  const [pendingDay, setPendingDay] = useState<number | null>(null);
  const [savingDay, setSavingDay] = useState(false);
  const [toast, setToast] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [storyCardCode, setStoryCardCode] = useState('');
  const [tokenCode, setTokenCode] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [unlockAtDay, setUnlockAtDay] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  useEffect(() => { document.title = '馬車面板｜THE HUNTERS A.D. 1492 WIKI'; }, []);

  async function loadWagon() {
    if (!session) return;
    setWagonLoading(true);
    setFailure('');
    try {
      const response = await fetch('/api/campaign/wagon', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as CampaignWagonResponse;
      setWagon(result.data);
      setCampaignName(result.data.campaignName);
      setShownCycle(Math.floor((result.data.elapsedDays - 1) / 30));
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : '無法讀取馬車資料。');
    } finally {
      setWagonLoading(false);
    }
  }

  useEffect(() => { void loadWagon(); }, [session?.campaignId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentCycle = wagon ? Math.floor((wagon.elapsedDays - 1) / 30) : 0;
  const cycleStart = shownCycle * 30;
  const tokensByDay = useMemo(() => {
    const groups = new Map<number, WagonTimeToken[]>();
    for (const token of wagon?.timeTokens ?? []) {
      if (token.unlockAtDay > cycleStart && token.unlockAtDay <= cycleStart + 30) {
        const dayInCycle = token.unlockAtDay - cycleStart;
        groups.set(dayInCycle, [...(groups.get(dayInCycle) ?? []), token]);
      }
    }
    return groups;
  }, [wagon?.timeTokens, cycleStart]);

  if (loading) return <section className="campaign-gate"><p className="eyebrow">VERIFYING SESSION</p><h1>正在確認戰役憑證…</h1></section>;
  if (!session) return <section className="campaign-gate">
    <Shield aria-hidden="true" />
    <p className="eyebrow">CAMPAIGN ACCESS REQUIRED</p>
    <h1>登入後進入戰役</h1>
    <p>使用戰役 ID、共用密碼與玩家席位登入。</p>
    <Link className="button" to="/login" state={{ from: '/campaigns' }}>登入戰役</Link>
  </section>;

  async function logout() {
    setLoggingOut(true);
    await onLogout();
    setLoggingOut(false);
  }

  async function updateDay() {
    if (!wagon || pendingDay === null) return;
    setSavingDay(true);
    try {
      const response = await fetch('/api/campaign/wagon/day', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elapsedDays: pendingDay, expectedVersion: wagon.version }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as CampaignWagonResponse;
      setWagon(result.data);
      setShownCycle(Math.floor((result.data.elapsedDays - 1) / 30));
      setToast(`時間已更新為第 ${result.data.elapsedDays} 天`);
      setPendingDay(null);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : '無法更新時間。');
      setPendingDay(null);
    } finally { setSavingDay(false); }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/campaign/name', {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignName }),
    });
    if (!response.ok) { setFailure(await readError(response)); return; }
    setWagon(current => current ? { ...current, campaignName } : current);
    setEditingName(false);
    setToast('戰役名稱已更新');
  }

  async function setUpgrade(stationCode: string, level: number) {
    const response = await fetch(`/api/campaign/wagon/upgrades/${stationCode}`, {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    });
    if (!response.ok) { setFailure(await readError(response)); return; }
    const result = await response.json() as CampaignWagonResponse;
    setWagon(result.data);
    setToast('工坊等級已更新');
  }

  async function addTimeToken(event: FormEvent) {
    event.preventDefault();
    setSavingToken(true);
    const response = await fetch('/api/campaign/wagon/time-tokens', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyCardCode, tokenCode, unlockAtDay: Number(unlockAtDay) }),
    });
    if (!response.ok) {
      setFailure(await readError(response));
      setSavingToken(false);
      return;
    }
    const result = await response.json() as CampaignWagonResponse;
    setWagon(result.data);
    setStoryCardCode('');
    setUnlockAtDay('');
    setTokenFormOpen(false);
    setSavingToken(false);
    setToast('Time Token 已放上時間軌');
  }

  async function removeToken(tokenId: number) {
    const response = await fetch(`/api/campaign/wagon/time-tokens/${tokenId}`, {
      method: 'DELETE', credentials: 'same-origin',
    });
    if (!response.ok) { setFailure(await readError(response)); return; }
    const result = await response.json() as CampaignWagonResponse;
    setWagon(result.data);
    setToast('Time Token 已移除，劇情卡可以觸發');
  }

  if (wagonLoading && !wagon) return <section className="campaign-gate"><Clock3 aria-hidden="true" /><p className="eyebrow">OPENING THE WAGON</p><h1>正在整理馬車面板…</h1></section>;
  if (!wagon) return <section className="campaign-gate"><p className="eyebrow">WAGON UNAVAILABLE</p><h1>目前無法開啟馬車</h1><p>{failure}</p><button className="button" onClick={() => void loadWagon()}>重新讀取</button></section>;

  const dueTokens = wagon.timeTokens.filter(token => token.unlockAtDay <= wagon.elapsedDays);
  return <section className="campaign-page wagon-page" aria-labelledby="campaign-title">
    <header className="campaign-heading">
      <div>
        <p className="eyebrow">ACTIVE CAMPAIGN · PLAYER {session.playerNumber}</p>
        {editingName
          ? <form className="campaign-name-form" onSubmit={saveName}>
              <label className="sr-only" htmlFor="campaign-name">戰役名稱</label>
              <input id="campaign-name" value={campaignName} maxLength={60} onChange={event => setCampaignName(event.target.value)} autoFocus />
              <button className="button" type="submit">儲存</button>
              <button className="text-button" type="button" onClick={() => { setCampaignName(wagon.campaignName); setEditingName(false); }}>取消</button>
            </form>
          : <div className="campaign-title-row"><h1 id="campaign-title">{wagon.campaignName}</h1><button className="icon-button" onClick={() => setEditingName(true)} aria-label="修改戰役名稱"><Pencil size={15} /></button></div>}
        <p className="campaign-id">戰役 ID · {session.campaignId}</p>
      </div>
      <span className={session.isActive ? 'campaign-state active' : 'campaign-state'}>{session.isActive ? '進行中' : '已凍結'}</span>
    </header>

    {failure && <div className="campaign-error" role="alert">{failure}<button onClick={() => setFailure('')}>關閉</button></div>}

    <div className="campaign-session-card">
      <UserRound aria-hidden="true" />
      <div><small>目前玩家</small><strong>{session.playerAlias}</strong><span>玩家席位 {session.playerNumber}</span></div>
      <button className="button" onClick={logout} disabled={loggingOut}><LogOut size={15} />{loggingOut ? '登出中…' : '登出'}</button>
    </div>

    <article className="wagon-board">
      <header className="wagon-board-head">
        <div><p className="eyebrow">WAGON RECORD</p><h2>馬車面板</h2></div>
        <div className="wagon-board-status">
          <SharedGold value={wagon.sharedGold} onChange={setWagon} onError={setFailure} onToast={setToast} />
          <div className="elapsed-day"><small>累計時間</small><strong>{wagon.elapsedDays}</strong><span>天</span></div>
        </div>
      </header>
      <div className="board-cycle-switcher">
        <button className="icon-button" disabled={shownCycle === 0} onClick={() => setShownCycle(value => Math.max(0, value - 1))} aria-label="查看前 30 天"><ChevronLeft /></button>
        <span>畫布顯示第 {cycleStart + 1}–{cycleStart + 30} 天</span>
        <button className="icon-button" onClick={() => setShownCycle(value => value + 1)} aria-label="查看後 30 天"><ChevronRight /></button>
        {shownCycle !== currentCycle && <button className="text-button" onClick={() => setShownCycle(currentCycle)}>回到目前</button>}
      </div>
      <div className="wagon-canvas">
        <svg className="wagon-board-svg" viewBox="0 0 1536 1024" role="group" aria-label="馬車面板：五種工坊升級軌與三列交錯時間軌">
          <image href="/images/campaign/wagon-board-concept-v2.png" x="0" y="0" width="1536" height="1024" />
          <g className="svg-workshop-slots" aria-label="五種工坊等級">
            {wagon.upgrades.flatMap(upgrade => {
              const geometry = WORKSHOP_GEOMETRY[upgrade.code];
              if (!geometry) return [];
              return geometry.centers.map(([cx, cy], index) => {
                const level = index + 1;
                const selectedLevel = level === upgrade.level;
                return <g
                  className="svg-hit-target"
                  role="button"
                  tabIndex={0}
                  aria-label={upgrade.name + '第 ' + level + ' 級' + (level <= upgrade.level ? '，已點亮' : '')}
                  aria-pressed={selectedLevel}
                  onClick={() => void setUpgrade(upgrade.code, selectedLevel ? level - 1 : level)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void setUpgrade(upgrade.code, selectedLevel ? level - 1 : level);
                    }
                  }}
                  key={upgrade.code + level}
                >
                  <polygon
                    className={'svg-workshop-slot station-fill-' + upgrade.code + (level <= upgrade.level ? ' lit' : '')}
                    points={diamondPoints(cx, cy, geometry.halfX, geometry.halfY)}
                  />
                </g>;
              });
            })}
          </g>
          <g className="svg-time-slots" aria-label="時間軌">
            {DAY_ROWS.flatMap((days, rowIndex) => days.map((day, index) => {
              const cx = (rowIndex === 1 ? 421 : 371) + index * 102;
              const cy = 781 + rowIndex * 57;
              const absoluteDay = cycleStart + day;
              const tokens = tokensByDay.get(day) ?? [];
              const isCurrent = absoluteDay === wagon.elapsedDays;
              return <g
                className="svg-hit-target"
                role="button"
                tabIndex={0}
                aria-label={'將累計時間設為第 ' + absoluteDay + ' 天' + (tokens.length ? '，有 ' + tokens.length + ' 枚 Time Token' : '')}
                onClick={() => setPendingDay(absoluteDay)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setPendingDay(absoluteDay);
                  }
                }}
                key={absoluteDay}
              >
                <polygon
                  className={'svg-time-slot' + (isCurrent ? ' current' : '') + (absoluteDay < wagon.elapsedDays ? ' past' : '')}
                  points={diamondPoints(cx, cy, 37, 34)}
                />
                {isCurrent && <circle className="svg-current-day" cx={cx} cy={cy} r="9" />}
                {tokens.length > 0 && <>
                  <circle className="svg-token-badge" cx={cx + 29} cy={cy - 27} r="15" />
                  <text className="svg-token-text" x={cx + 29} y={cy - 23}>{tokens.length > 1 ? tokens.length : tokens[0].tokenCode}</text>
                </>}
              </g>;
            }))}
          </g>
          <g
            className="svg-hit-target svg-plus-thirty"
            role="button"
            tabIndex={0}
            aria-label={'累計時間增加 30 天，目前第 ' + wagon.elapsedDays + ' 天'}
            onClick={() => setPendingDay(wagon.elapsedDays + 30)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPendingDay(wagon.elapsedDays + 30);
              }
            }}
          >
            <polygon points={diamondPoints(203, 858, 39, 39)} />
          </g>
        </svg>
      </div>
    </article>

    {dueTokens.length > 0 && <section className="due-panel" aria-labelledby="due-title">
      <div><Sparkles aria-hidden="true" /><p className="eyebrow">STORY CARDS READY</p><h2 id="due-title">可移除的 Time Token</h2></div>
      <div className="due-token-list">
        {dueTokens.map(token => <article key={token.id}>
          <span className="token-seal">{token.tokenCode}</span>
          <div><strong>{token.storyCardCode}</strong><small>第 {token.unlockAtDay} 天到期</small></div>
          <button className="button" onClick={() => void removeToken(token.id)}>移除並解鎖</button>
        </article>)}
      </div>
    </section>}

    <section className="wagon-grid">
      <article className="wagon-panel workshop-panel">
        <header><div><p className="eyebrow">FIVE WORKSHOPS</p><h2><Wrench size={20} />五種工坊</h2></div><small>直接記錄桌遊面板上的等級</small></header>
        <div className="workshop-list">
          {wagon.upgrades.map(upgrade => <div className="workshop-row" key={upgrade.code}>
            <div>{upgrade.imageUrl && <img src={upgrade.imageUrl} alt="" />}<span><strong>{upgrade.name}</strong><small>{upgrade.originalName}</small></span></div>
            <div className="level-selector" aria-label={`${upgrade.name}等級`}>
              {[0, 1, 2, 3].map(level => <button key={level} className={level === upgrade.level ? 'selected' : ''} onClick={() => void setUpgrade(upgrade.code, level)} aria-pressed={level === upgrade.level}>{level}</button>)}
            </div>
          </div>)}
        </div>
      </article>

      <article className="wagon-panel token-panel">
        <header><div><p className="eyebrow">TIME TOKENS</p><h2><Clock3 size={20} />劇情卡時間標記</h2></div><button className="button" onClick={() => setTokenFormOpen(value => !value)}>{tokenFormOpen ? '收起' : '放置 Token'}</button></header>
        {tokenFormOpen && <form className="token-form" onSubmit={addTimeToken}>
          <label>劇情卡編號<input value={storyCardCode} onChange={event => setStoryCardCode(event.target.value)} placeholder="S001" pattern="S[0-9]{3,4}" required /></label>
          <label>Token
            <select value={tokenCode} onChange={event => setTokenCode(event.target.value as typeof tokenCode)}>{['A', 'B', 'C', 'D'].map(code => <option key={code}>{code}</option>)}</select>
          </label>
          <label>到期天數<input type="number" min={wagon.elapsedDays} max={9999} value={unlockAtDay} onChange={event => setUnlockAtDay(event.target.value)} required /></label>
          <button className="button" disabled={savingToken}>{savingToken ? '放置中…' : '確認放置'}</button>
        </form>}
        <div className="active-token-list">
          {wagon.timeTokens.length === 0 && <p className="muted">目前沒有有效的 Time Token。</p>}
          {wagon.timeTokens.map(token => <div key={token.id}><span className="token-seal">{token.tokenCode}</span><strong>{token.storyCardCode}</strong><span>第 {token.unlockAtDay} 天</span><em>{token.unlockAtDay <= wagon.elapsedDays ? '可移除' : '等待中'}</em></div>)}
        </div>
      </article>

      <ResourceInventory resources={wagon.resources} onChange={setWagon} onError={setFailure} onToast={setToast} />
      <EquipmentInventory equipment={wagon.equipment} onChange={setWagon} onError={setFailure} onToast={setToast} />
    </section>

    {pendingDay !== null && <div className="confirm-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPendingDay(null); }}>
      <section className="confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="confirm-day-title">
        <p className="eyebrow">CONFIRM TIME CHANGE</p>
        <h2 id="confirm-day-title">將時間改為第 {pendingDay} 天？</h2>
        <p>目前是第 {wagon.elapsedDays} 天。這只更新網頁紀錄，不會自動處理或重新鎖定劇情卡。</p>
        <div><button className="text-button" onClick={() => setPendingDay(null)}>取消</button><button className="button" disabled={savingDay} onClick={() => void updateDay()}>{savingDay ? '更新中…' : '確認更新'}</button></div>
      </section>
    </div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </section>;
}


function SharedGold({ value, onChange, onError, onToast }: {
  value: number;
  onChange: (wagon: CampaignWagon) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function update(next: number) {
    setBusy(true);
    const sharedGold = Math.max(0, Math.min(99999, next));
    const response = await fetch('/api/campaign/wagon/gold', {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharedGold }),
    });
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast('團隊共用金錢已更新為 ' + sharedGold);
    }
    setBusy(false);
  }
  return <div className="shared-gold">
    <small>團隊共用金錢</small>
    <div><button disabled={busy || value === 0} onClick={() => void update(value - 1)} aria-label="共用金錢減少 1">−</button><strong>{value}</strong><button disabled={busy} onClick={() => void update(value + 1)} aria-label="共用金錢增加 1">＋</button></div>
  </div>;
}


function ResourceInventory({ resources, onChange, onError, onToast }: {
  resources: WagonResource[];
  onChange: (wagon: CampaignWagon) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const [busyCode, setBusyCode] = useState('');
  async function setQuantity(resource: WagonResource, quantity: number) {
    setBusyCode(resource.code);
    const response = await fetch('/api/campaign/wagon/resources/' + resource.code, {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: Math.max(0, quantity) }),
    });
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast(resource.name + '已更新為 ' + Math.max(0, quantity));
    }
    setBusyCode('');
  }
  return <article className="wagon-panel resource-inventory">
    <header><div><p className="eyebrow">CRAFTING RESOURCES</p><h2><PackageOpen size={20} />素材庫存</h2></div><small>素材以數量保存</small></header>
    <div className="resource-grid">
      {resources.map(resource => <div className={resource.quantity > 0 ? 'resource-counter owned' : 'resource-counter'} key={resource.code}>
        {resource.imageUrl ? <img src={resource.imageUrl} alt="" /> : <span className="resource-fallback" />}
        <span><strong>{resource.name}</strong><small>{resource.code.replace(/^(material|plant|trophy)_/, '')}</small></span>
        <div>
          <button aria-label={'減少' + resource.name} disabled={busyCode === resource.code || resource.quantity === 0} onClick={() => void setQuantity(resource, resource.quantity - 1)}>−</button>
          <output aria-label={resource.name + '數量'}>{resource.quantity}</output>
          <button aria-label={'增加' + resource.name} disabled={busyCode === resource.code} onClick={() => void setQuantity(resource, resource.quantity + 1)}>＋</button>
        </div>
      </div>)}
    </div>
  </article>;
}

function EquipmentInventory({ equipment, onChange, onError, onToast }: {
  equipment: WagonEquipmentInstance[];
  onChange: (wagon: CampaignWagon) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemsResponse['data']>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function searchItems(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    const response = await fetch('/api/items?q=' + encodeURIComponent(query.trim()) + '&pageSize=12');
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as ItemsResponse;
      setResults(result.data);
      setSelectedItemId(result.data[0] ? String(result.data[0].id) : '');
    }
    setSearching(false);
  }

  async function addEquipment() {
    if (!selectedItemId) return;
    const response = await fetch('/api/campaign/wagon/equipment', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: Number(selectedItemId) }),
    });
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast('裝備已加入馬車；同名裝備會保留為獨立一件');
    }
  }

  async function updateDamage(item: WagonEquipmentInstance, damageMarkers: number) {
    setBusyId(item.id);
    const response = await fetch('/api/campaign/wagon/equipment/' + item.id, {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ damageMarkers: Math.max(0, damageMarkers), notes: item.notes }),
    });
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast(item.name + '的損壞標記已更新');
    }
    setBusyId(null);
  }

  async function removeEquipment(item: WagonEquipmentInstance) {
    if (!window.confirm('從馬車移除這一件「' + item.name + '」？')) return;
    setBusyId(item.id);
    const response = await fetch('/api/campaign/wagon/equipment/' + item.id, {
      method: 'DELETE', credentials: 'same-origin',
    });
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast('已從馬車移除一件' + item.name);
    }
    setBusyId(null);
  }

  return <article className="wagon-panel equipment-inventory">
    <header><div><p className="eyebrow">EQUIPMENT INSTANCES</p><h2><PackageOpen size={20} />裝備庫存</h2></div><small>{equipment.length} 件實體裝備</small></header>
    <form className="equipment-search" onSubmit={searchItems}>
      <label><span>搜尋物品圖鑑</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="輸入名稱或編號" /></label>
      <button className="button" disabled={searching}>{searching ? '搜尋中…' : '搜尋'}</button>
      <label><span>搜尋結果</span><select value={selectedItemId} onChange={event => setSelectedItemId(event.target.value)} disabled={!results.length}>
        {!results.length && <option value="">尚未搜尋</option>}
        {results.map(item => <option value={item.id} key={item.id}>{item.cardNumber ? item.cardNumber + ' · ' : ''}{item.name}</option>)}
      </select></label>
      <button className="button" type="button" disabled={!selectedItemId} onClick={() => void addEquipment()}>加入一件</button>
    </form>
    <div className="equipment-list">
      {equipment.length === 0 && <p className="muted">馬車目前沒有裝備。搜尋圖鑑後可逐件加入。</p>}
      {equipment.map(item => <article key={item.id}>
        <div className="equipment-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <PackageOpen />}</div>
        <div className="equipment-name"><small>{item.cardNumber ?? item.code} · 實體 #{item.id}</small><strong>{item.name}</strong><span>{item.categoryName}</span></div>
        {item.damageable
          ? <button className={'damage-toggle ' + (item.damageMarkers === 1 ? 'damaged' : '')} disabled={busyId === item.id} aria-pressed={item.damageMarkers === 1} onClick={() => void updateDamage(item, item.damageMarkers === 1 ? 0 : 1)}>
              <small>鎧甲狀態</small><strong>{item.damageMarkers === 1 ? '損壞' : '完好'}</strong>
            </button>
          : <span className="no-damage"><small>損壞</small><strong>不適用</strong></span>}
        <button className="remove-equipment" disabled={busyId === item.id} onClick={() => void removeEquipment(item)}>移除</button>
      </article>)}
    </div>
  </article>;
}
