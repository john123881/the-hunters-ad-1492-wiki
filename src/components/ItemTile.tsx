import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ItemSummary } from '../../shared/types';
import { CardImage } from './CardImage';

export function ItemTile({ item, catalogSearch }: { item: ItemSummary; catalogSearch: string }) {
  return <Link className="card-tile" to={`/items/${item.slug}`} state={{ catalogSearch }}>
    <div className="card-art">
      <CardImage src={item.imageUrl} alt={item.imageAlt || `${item.name}的物品圖片`} />
      <span className="card-category">{item.categoryName}</span>
      <span className="art-corner" aria-hidden="true"><ArrowUpRight size={18} /></span>
    </div>
    <div className="card-copy">
      <div className="card-meta"><span>{item.cardNumber ?? item.code}</span><span>{item.slotCount} 格</span></div>
      <h3>{item.name}</h3><p>{item.description}</p>
      <div className="card-bottom"><span>{item.sourceKind === 'demo' ? '示範物品' : '整理資料'}</span><span>查閱物品 <ArrowUpRight size={13} /></span></div>
    </div>
  </Link>;
}
