import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ItemSummary } from '../../shared/types';
import { CardImage } from './CardImage';
import { ItemGlyph } from './ItemGlyph';

export function ItemTile({ item, catalogSearch }: { item: ItemSummary; catalogSearch: string }) {
  const usage = item.usageLimitType === 'once_per_combat'
    ? <span><ItemGlyph code="once_per_combat" label="每個任務一次" size={15} />每個任務一次</span>
    : item.consumptionType === 'consumed_on_use'
      ? <span><ItemGlyph code="single_use" label="使用後消耗" size={15} />使用後消耗</span>
      : item.consumptionType === 'consumed_after_combat'
        ? <span><RotateCcw size={14} aria-hidden="true" />任務後消耗</span>
        : null;
  return <Link className="card-tile" to={`/items/${item.slug}`} state={{ catalogSearch }}>
    <div className="card-art">
      <CardImage src={item.imageUrl} alt={item.imageAlt || `${item.name}的物品圖片`} />
      <span className="card-category" aria-label={`分類：${item.categoryName}`} title={item.categoryName}>
        <ItemGlyph code={item.categoryCode} label={item.categoryName} size={24} />
      </span>
      <span className="art-corner" aria-hidden="true"><ArrowUpRight size={18} /></span>
    </div>
    <div className="card-copy">
      <div className="card-meta"><span>{item.cardNumber ?? item.code}</span><span>{item.slotCount} 格</span>{usage}</div>
      <h3>{item.name}</h3><p>{item.description}</p>
      <div className="card-bottom"><span>{item.sourceKind === 'demo' ? '示範物品' : '整理資料'}</span><span>查閱物品 <ArrowUpRight size={13} /></span></div>
    </div>
  </Link>;
}
