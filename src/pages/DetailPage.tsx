import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Expand, ScrollText, ShieldCheck, X } from 'lucide-react';
import { actionLabels, attackLabels, attributeLabels, consumptionLabels, usageLabels, resolutionLabels, targetLabels, timingLabels, durationLabels, operationLabels, type ActionMode, type DetailResponse } from '../../shared/types';
import { useApi } from '../lib/useApi';
import { CardImage } from '../components/CardImage';
import { ErrorState } from '../components/States';
import { connectorGlyphCode, ItemGlyph } from '../components/ItemGlyph';

function rangeLabel(mode: ActionMode) {
  return mode.rangeType === 'action_card' ? '依行動卡 *' : mode.rangeType === 'none' ? '不適用' : mode.rangeMin === mode.rangeMax ? String(mode.rangeMin) : `${mode.rangeMin}–${mode.rangeMax}`;
}
function sourceValue(mode: ActionMode) {
  return mode.valueSource === 'character_attribute' && mode.attributeCode ? attributeLabels[mode.attributeCode]
    : mode.valueSource === 'fixed' ? String(mode.fixedValue) : mode.valueSource === 'action_card' ? '依行動卡' : '不適用';
}
const label = (labels: Record<string, string>, code: string) => code === 'unconfirmed' ? '待核對' : (labels[code] ?? code);

export function DetailPage() {
  const { slug } = useParams();
  const location = useLocation();
  const state = location.state as { catalogSearch?: string } | null;
  const catalogSearch = typeof state?.catalogSearch === 'string' && state.catalogSearch.startsWith('?') ? state.catalogSearch : '';
  const result = useApi<DetailResponse>(`/api/items/${encodeURIComponent(slug ?? '')}`);
  const item = result.data?.data;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { document.title = `${item?.name ?? '物品詳情'}｜THE HUNTERS A.D. 1492 WIKI`; }, [item?.name]);

  return <div className="detail-page">
    <Link className="back-link" to={`/items${catalogSearch}`}><ArrowLeft size={16} />返回物品圖鑑</Link>
    {result.loading ? <div className="detail-loading" role="status"><div className="skeleton-art" /><p>正在翻閱物品檔案…</p></div> :
      result.error ? result.error.status === 404 ? <div className="empty-state"><BookOpen size={38} /><p className="eyebrow">ARCHIVE NOT FOUND</p><h1>這件物品尚未收錄</h1><p>{result.error.message}</p><Link to="/items" className="button">瀏覽全部物品</Link></div> :
      <ErrorState message={result.error.message} onRetry={result.retry} /> : item && <>
      <div className="detail-breadcrumb"><span>物品圖鑑</span><span>/</span><Link to={`/items?category=${item.categoryCode}`}>{item.categoryName}</Link><span>/</span><span>{item.cardNumber ?? item.code}</span></div>
      <div className="detail-grid">
        <aside className="detail-visual">
          <div className="detail-art-frame">
            <div className="detail-art-heading"><span>THE HUNTERS</span><span>AD 1492</span></div>
            <button className="image-zoom" onClick={() => dialog.current?.showModal()} aria-label="放大物品牌面">
              <CardImage key={item.imageUrl} src={item.imageUrl} alt={item.imageAlt || item.name} eager /><span><Expand size={15} />檢視完整牌面</span>
            </button>
            <div className="detail-art-footer"><span>{item.cardNumber ? `牌號 ${item.cardNumber}` : `索引 ${item.code}`}</span><span>{item.sourceKind === 'demo' ? '示意圖' : '物品圖片'}</span></div>
          </div>
          <div className="source-note"><ShieldCheck size={17} /><div><strong>{item.sourceKind === 'reference' ? '使用者整理資料 · 待核對' : item.sourceKind === 'demo' ? '虛構測試資料' : '資料來源'}</strong><p>{item.sourceReference}</p><p className="preserve-lines">{item.sourceNote}</p></div></div>
        </aside>
        <article className="detail-content">
          <div className="detail-kicker"><span><ItemGlyph code={item.categoryCode} label={item.categoryName} size={18} />{item.categoryName}</span><span>{item.slotCount} 格</span><span>{item.cardNumber ?? item.code}</span></div>
          <h1>{item.name}</h1>{item.originalName && <p className="original-name" lang="en">{item.originalName}</p>}
          <p className="detail-summary">{item.description}</p>
          <section className="detail-section" aria-labelledby="stats-heading">
            <h2 id="stats-heading"><span>01</span>物品面板</h2>
            <dl className="item-basics">
              <div><dt>占用格數</dt><dd>{item.slotCount} 格</dd></div><div><dt>裝備區域</dt><dd>{item.slotZone ?? '未指定'}</dd></div>
              <div><dt>消耗方式</dt><dd>{item.consumptionType && <ItemGlyph code={item.consumptionType} label={consumptionLabels[item.consumptionType]} size={19} />}{item.consumptionType ? consumptionLabels[item.consumptionType] : '待核對'}</dd></div>
              <div><dt>使用限制</dt><dd>{item.usageLimitType && <ItemGlyph code={item.usageLimitType} label={usageLabels[item.usageLimitType]} size={19} />}{item.usageLimitType ? usageLabels[item.usageLimitType] : '待核對'}</dd></div>
            </dl>
            {item.defense && <div className="profile-block"><h3>固定防禦</h3><dl className="stat-grid defense-grid">
              <div><dt>近戰防禦</dt><dd>{item.defense.meleeDefense}</dd></div><div><dt>遠程防禦</dt><dd>{item.defense.rangedDefense}</dd></div><div><dt>魔法防禦</dt><dd>{item.defense.magicDefense}</dd></div>
            </dl></div>}
            {item.shieldRules.length > 0 && <div className="profile-block"><h3>盾牌牌面數值</h3><div className="table-scroll"><table><thead><tr><th>屬性</th><th>固定值</th><th>骰數</th></tr></thead><tbody>{item.shieldRules.map(rule => <tr key={rule.attributeCode}><th>{attributeLabels[rule.attributeCode]}</th><td>{rule.fixedValue}</td><td>{rule.diceCount}</td></tr>)}</tbody></table></div><p className="filter-hint">僅呈現牌面兩側數值，判定流程請以規則書為準。</p></div>}
            {item.actionModes.map((mode, index) => <div className="mode-panel" key={mode.id}>
              <h3><span>模式 {index+1}</span><ItemGlyph code={mode.attackType} label={mode.attackType ? attackLabels[mode.attackType] : actionLabels[mode.actionType]} size={24} />{mode.attackType ? attackLabels[mode.attackType] : actionLabels[mode.actionType]}</h3>
              <dl className="mode-stats"><div><dt>數值來源</dt><dd>{sourceValue(mode)}</dd></div><div><dt>骰數</dt><dd>{mode.diceCount ?? '—'}</dd></div><div><dt>判定修正</dt><dd>{mode.checkModifier > 0 ? '+' : ''}{mode.checkModifier}</dd></div><div><dt>距離</dt><dd>{rangeLabel(mode)}</dd></div></dl>
              <p className="mode-description">{resolutionLabels[mode.resolutionMethod]} · {mode.description}</p>
            </div>)}
            {item.traits.map(trait => <p className="trait" key={trait.code}><ItemGlyph code={trait.code} label={trait.code === 'reload' ? '裝填' : trait.code} size={24} /><strong>{trait.code === 'reload' ? '裝填' : trait.code}</strong>{trait.description}</p>)}
          </section>
          <section className="detail-section" aria-labelledby="effects-heading">
            <h2 id="effects-heading"><span>02</span>效果與牌面轉錄 <ScrollText size={17} /></h2>
            <div className="original-text"><h3>來源文字與圖示轉錄</h3><p className="preserve-lines">{item.originalEffectText || '尚未轉錄，請查看左側原圖。'}</p></div>
            {item.effects.length > 0 ? <div className="effects">{item.effects.map(effect => <div className="effect" key={effect.id}>
              <h3><ItemGlyph code={effect.code} label={effect.name} size={25} />{effect.name}{effect.isNegative && <span className="negative-badge">負面</span>}</h3><p>{effect.description}</p>
              <dl className="effect-meta"><div><dt>對象</dt><dd>{label(targetLabels,effect.targetType)}</dd></div>{effect.numericValue !== null && <div><dt>{label(operationLabels,effect.operation)}</dt><dd>{effect.numericValue}</dd></div>}<div><dt>時機</dt><dd>{label(timingLabels,effect.triggerTiming)}</dd></div><div><dt>期間</dt><dd>{label(durationLabels,effect.durationType)}</dd></div></dl>
              {effect.actionModeId !== null && <p className="mode-scope">僅作用於模式 {item.actionModes.findIndex(mode => mode.id === effect.actionModeId)+1}</p>}
            </div>)}</div> : <p className="filter-hint">目前沒有已整理的結構化效果，並不代表牌面沒有其他能力。</p>}
          </section>
          {(item.sockets.length > 0 || item.attachment) && <section className="detail-section" aria-labelledby="connectors-heading">
            <h2 id="connectors-heading"><span>03</span>附件接口</h2>
            {item.attachment && <div className="connector-row"><ItemGlyph code={connectorGlyphCode(item.attachment.code)} label={item.attachment.name} size={28} /><div><strong>{item.attachment.name}</strong><small>{item.attachment.shapeDescription}</small></div><Link className="text-link" to={`/items?category=weapon&connector=${item.attachment.code}`}>查詢相容武器 →</Link></div>}
            {item.sockets.map(socket => <div className="connector-row" key={`${socket.slotIndex}-${socket.socketIndex}`}><ItemGlyph code={connectorGlyphCode(socket.code)} label={socket.name} size={28} /><div><strong>第 {socket.slotIndex} 格 · {socket.name}</strong><small>{socket.shapeDescription}</small></div><Link className="text-link" to={`/items?category=weapon_attachment&connector=${socket.code}`}>查詢附件 →</Link></div>)}
          </section>}
        </article>
      </div>
      <dialog className="image-dialog" ref={dialog} aria-labelledby="zoom-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="dialog-heading"><h2 id="zoom-title">{item.name} · 物品圖片</h2><button autoFocus onClick={() => dialog.current?.close()} aria-label="關閉圖片"><X size={22} /></button></div>
        <img src={item.imageUrl} alt={item.imageAlt || item.name} /><p>{item.sourceReference}</p>
      </dialog>
    </>}
  </div>;
}
