import { useEffect, useMemo, useState } from 'react';
import { BookOpen, FlaskConical, Image, Minus, Plus, Save, Shield, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { heroDefinitionBySlug, heroDefinitions } from '../../shared/heroesData';
import { heroBoardHotspots, type BoardPoint } from '../../shared/heroBoardHotspots';
import type { ApiErrorResponse, AuthSession, CampaignCharacter, CampaignCharactersResponse } from '../../shared/types';

type Draft = Omit<CampaignCharacter, 'id' | 'playerNumber' | 'version'> & { version: number | null };
const emptyDraft = (heroSlug: string): Draft => ({
  heroSlug, customName: '', moralePosition: 0, strengthLevel: 0, knowledgeLevel: 0,
  perceptionLevel: 0, agilityLevel: 0, maxHealthLevel: 0, currentHealth: 1,
  xpTens: 0, xpOnes: 0, isPoisoned: false, notes: '', version: null,
});
const toDraft = (character: CampaignCharacter): Draft => ({ ...character, version: character.version });

function Stepper({ label, value, min, max, step = 1, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; disabled: boolean; onChange: (value: number) => void;
}) {
  return <div className="character-stepper">
    <span>{label}</span>
    <div><button type="button" disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label={label + '減少'}><Minus /></button>
      <strong>{value}</strong>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={label + '增加'}><Plus /></button></div>
  </div>;
}


function BoardMarker({ point, kind, label }: { point: BoardPoint; kind: 'square' | 'diamond'; label: string }) {
  return <span className={'character-board-marker ' + kind} style={{ left: point.x + '%', top: point.y + '%' }} aria-label={label}><span /></span>;
}

function BoardHighlights({ draft }: { draft: Draft }) {
  const layout = heroBoardHotspots[draft.heroSlug];
  if (!layout) return null;
  const markers: Array<{ point: BoardPoint | undefined; kind: 'square' | 'diamond'; label: string }> = [
    { point: layout.morale[draft.moralePosition + 2], kind: 'square', label: '士氣位置 ' + draft.moralePosition },
    { point: layout.strength[draft.strengthLevel], kind: 'diamond', label: '力量等級 ' + draft.strengthLevel },
    { point: layout.knowledge[draft.knowledgeLevel], kind: 'diamond', label: '知識等級 ' + draft.knowledgeLevel },
    { point: layout.perception[draft.perceptionLevel], kind: 'diamond', label: '洞察等級 ' + draft.perceptionLevel },
    { point: layout.agility[draft.agilityLevel], kind: 'diamond', label: '敏捷等級 ' + draft.agilityLevel },
    { point: layout.maxHealth[draft.maxHealthLevel], kind: 'diamond', label: '最大生命軌 ' + draft.maxHealthLevel },
    { point: draft.currentHealth > 0 ? layout.currentHealth[draft.currentHealth - 1] : undefined, kind: 'diamond', label: '當前生命 ' + draft.currentHealth },
  ];
  return <div className="character-board-highlights" aria-live="polite">
    {markers.map((marker, index) => marker.point && <BoardMarker key={index} {...marker} point={marker.point} />)}
  </div>;
}

export function CampaignCharactersPage({ session, loading }: { session: AuthSession | null; loading: boolean }) {
  const params = useParams();
  const requested = Number(params.playerNumber);
  const selectedNumber = Number.isInteger(requested) && requested >= 1 && requested <= 4 ? requested : session?.playerNumber ?? 1;
  const [characters, setCharacters] = useState<CampaignCharacter[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'load' | 'save' | null>('load');
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState<'story' | 'layout' | null>(null);

  useEffect(() => {
    if (!session) return;
    setBusy('load'); setMessage('');
    fetch('/api/campaign/characters', { credentials: 'same-origin' })
      .then(async response => {
        const payload = await response.json() as CampaignCharactersResponse | ApiErrorResponse;
        if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error.message : '角色資料載入失敗。');
        setCharacters(payload.data.characters);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : '角色資料載入失敗。'))
      .finally(() => setBusy(null));
  }, [session]);

  const character = characters.find(entry => entry.playerNumber === selectedNumber) ?? null;
  useEffect(() => setDraft(character ? toDraft(character) : null), [character?.id, character?.version, selectedNumber]);
  const selectedPlayer = session?.players.find(player => player.playerNumber === selectedNumber);
  const isSelf = selectedNumber === session?.playerNumber;
  const hero = draft ? heroDefinitionBySlug[draft.heroSlug] : null;
  const usedHeroes = useMemo(() => new Set(characters.filter(item => item.playerNumber !== selectedNumber).map(item => item.heroSlug)), [characters, selectedNumber]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => current ? { ...current, [key]: value } : current);

  async function save() {
    if (!draft || !session) return;
    setBusy('save'); setMessage('');
    try {
      const response = await fetch('/api/campaign/characters/' + selectedNumber, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, expectedVersion: draft.version }),
      });
      const payload = await response.json() as CampaignCharactersResponse | ApiErrorResponse;
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error.message : '角色儲存失敗。');
      const savedCharacter = payload.data.characters.find(entry => entry.playerNumber === selectedNumber);
      if (savedCharacter) setDraft(toDraft(savedCharacter));
      setCharacters(payload.data.characters);
      setMessage('角色面板已儲存。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '角色儲存失敗。'); }
    finally { setBusy(null); }
  }

  if (loading) return <section className="campaign-gate"><p className="eyebrow">VERIFYING SESSION</p><h1>正在確認戰役憑證…</h1></section>;
  if (!session) return <section className="campaign-gate"><Shield aria-hidden="true" /><p className="eyebrow">CAMPAIGN ACCESS REQUIRED</p><h1>登入後查看角色</h1><Link className="button" to="/login" state={{ from: '/campaigns/characters' }}>登入戰役</Link></section>;

  return <section className="campaign-page campaign-characters-page" aria-labelledby="campaign-characters-title">
    <header className="campaign-module-heading">
      <div><p className="eyebrow">HUNTER RECORDS</p><h1 id="campaign-characters-title">角色面板</h1><p>保存獵人的面板位置；同戰役隊友可唯讀查看。</p></div>
      <span><UserRound aria-hidden="true" />玩家 {session.playerNumber}</span>
    </header>
    <nav className="character-roster-tabs" aria-label="戰役角色">
      {[1,2,3,4].map(playerNumber => {
        const player = session.players.find(entry => entry.playerNumber === playerNumber);
        const entry = characters.find(item => item.playerNumber === playerNumber);
        return <Link className={playerNumber === selectedNumber ? 'active' : ''} to={'/campaigns/characters/' + playerNumber} key={playerNumber}>
          <span>{playerNumber}</span><strong>{player?.playerAlias ?? '從缺'}</strong><small>{entry ? heroDefinitionBySlug[entry.heroSlug]?.roleNameZhTw : playerNumber === session.playerNumber ? '你' : '未選角'}</small>
        </Link>;
      })}
    </nav>

    {message && <div className={message.includes('已儲存') ? 'character-notice success' : 'character-notice'} role="status">{message}</div>}
    {busy === 'load' ? <div className="character-loading">正在載入角色資料…</div>
      : !selectedPlayer ? <article className="character-preview-panel"><p className="eyebrow">EMPTY PLAYER SLOT</p><h2>玩家席位 {selectedNumber} 從缺</h2><p>此席位尚未加入戰役。</p></article>
      : !draft ? <article className="hero-picker">
        <div><p className="eyebrow">{isSelf ? 'CHOOSE YOUR HUNTER' : 'NO HUNTER SELECTED'}</p><h2>{isSelf ? '選擇獵人' : selectedPlayer.playerAlias + ' 尚未選角'}</h2></div>
        {isSelf && <div className="hero-picker-grid">{heroDefinitions.map(option => <button type="button" key={option.slug} disabled={usedHeroes.has(option.slug)} onClick={() => setDraft(emptyDraft(option.slug))}>
          <img src={option.boardImageUrl} alt="" /><span><strong>{option.displayNameZhTw}</strong><small>{option.roleNameZhTw}{usedHeroes.has(option.slug) ? ' · 已被選擇' : ''}</small></span>
        </button>)}</div>}
      </article>
      : hero && <div className="character-workspace">
        <div className="character-board-stage">
          <img src={hero.boardImageUrl} alt={hero.displayNameZhTw + '角色面板'} />
          <BoardHighlights draft={draft} />
          <div
            className="character-board-caption"
            style={{
              left: `${heroBoardHotspots[hero.slug]?.caption?.left ?? 20}%`,
              right: `${heroBoardHotspots[hero.slug]?.caption?.right ?? 8}%`,
              top: `${heroBoardHotspots[hero.slug]?.caption?.top ?? 3.5}%`,
            }}
          >
            <span>{hero.roleNameZhTw}</span>
            <h2>{draft.customName || hero.displayNameZhTw}</h2>
          </div>
        </div>
        <aside className="character-control-panel">
          <header><div><p className="eyebrow">{isSelf ? 'YOUR HUNTER' : 'TEAMMATE · READ ONLY'}</p><h2>{selectedPlayer.playerAlias}</h2></div><span>版本 {draft.version ?? '新建'}</span></header>
          <div className="character-reference-actions">
            <button type="button" className="button secondary" onClick={() => setModal('story')}><BookOpen />角色故事</button>
            <button type="button" className="button secondary" onClick={() => setModal('layout')}><Image />初始面板</button>
          </div>
          <label className="field"><span>角色名稱</span><input disabled={!isSelf} maxLength={40} value={draft.customName} placeholder={hero.displayNameZhTw} onChange={event => update('customName', event.target.value)} /></label>
          <section className="character-track-grid" aria-label="角色面板位置">
            <Stepper label="士氣位置" value={draft.moralePosition} min={-2} max={4} disabled={!isSelf} onChange={value => update('moralePosition', value)} />
            <Stepper label="經驗值 (XP)" value={draft.xpTens + draft.xpOnes} min={0} max={99} disabled={!isSelf} onChange={value => {
              update('xpTens', Math.floor(value / 10) * 10);
              update('xpOnes', value % 10);
            }} />
            <Stepper label="力量" value={draft.strengthLevel} min={0} max={4} disabled={!isSelf} onChange={value => update('strengthLevel', value)} />
            <Stepper label="知識" value={draft.knowledgeLevel} min={0} max={4} disabled={!isSelf} onChange={value => update('knowledgeLevel', value)} />
            <Stepper label="洞察" value={draft.perceptionLevel} min={0} max={4} disabled={!isSelf} onChange={value => update('perceptionLevel', value)} />
            <Stepper label="敏捷" value={draft.agilityLevel} min={0} max={4} disabled={!isSelf} onChange={value => update('agilityLevel', value)} />
            <Stepper label="最大生命軌" value={draft.maxHealthLevel} min={0} max={5} disabled={!isSelf} onChange={value => update('maxHealthLevel', value)} />
            <Stepper label="當前生命" value={draft.currentHealth} min={0} max={12} disabled={!isSelf} onChange={value => update('currentHealth', value)} />
          </section>
          <label className="character-poison"><input type="checkbox" disabled={!isSelf} checked={draft.isPoisoned} onChange={event => update('isPoisoned', event.target.checked)} /><FlaskConical />中毒狀態</label>
          <label className="field"><span>角色備註</span><textarea disabled={!isSelf} maxLength={2000} value={draft.notes} onChange={event => update('notes', event.target.value)} /></label>
          {isSelf && <div className="character-save-bar"><button className="button" type="button" disabled={busy === 'save'} onClick={save}><Save />{busy === 'save' ? '儲存中…' : '儲存角色面板'}</button></div>}
        </aside>
      </div>}

    {modal && hero && <div className="character-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setModal(null)}>
      <section className="character-modal" role="dialog" aria-modal="true" aria-labelledby="character-modal-title">
        <header><div><p className="eyebrow">{modal === 'story' ? 'CHARACTER STORY' : 'INITIAL LAYOUT'}</p><h2 id="character-modal-title">{hero.displayNameZhTw}</h2></div><button type="button" onClick={() => setModal(null)} aria-label="關閉">×</button></header>
        {modal === 'story' ? <p className="character-story">{hero.storyZhTw}</p> : <img src={hero.initialLayoutImageUrl} alt={hero.displayNameZhTw + '初始面板配置'} />}
      </section>
    </div>}
  </section>;
}
