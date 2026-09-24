import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, BookOpen, ChevronLeft, ChevronRight, LayoutGrid, List, Search, X } from 'lucide-react';
import { type ItemsResponse, type CatalogResponse } from '../../shared/types';
import { useApi } from '../lib/useApi';
import { ItemTile } from '../components/ItemTile';
import { ItemFilters } from '../components/ItemFilters';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';


export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'number';
  const [draft, setDraft] = useState(q);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const catalog = useApi<CatalogResponse>('/api/catalog');
  const query = new URLSearchParams(params);
  query.set('pageSize', '12');
  const cards = useApi<ItemsResponse>(`/api/items?${query}`);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(q); }, [q]);
  useEffect(() => { document.title = 'THE HUNTERS A.D. 1492 WIKI'; }, []);

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setParams(next);
  }
  function search(event: FormEvent) { event.preventDefault(); update({ q: draft.trim(), page: '' }); }
  function reset() { setDraft(''); setParams({}); }
  function changePage(value: number) {
    update({ page: String(value) });
    resultsRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    resultsRef.current?.focus({ preventScroll: true });
  }
  const data = cards.data;
  const total = catalog.data?.data.total;

  return <>
    <section className="hero" aria-labelledby="hero-title">
      <img className="hero-keyart" src="/images/hero-keyart.png" alt="" />
      <div className="hero-copy">
        <p className="eyebrow"><span /> UNOFFICIAL ITEM COMPENDIUM</p>
        <h1 id="hero-title"><span>THE HUNTERS</span><small>A.D. 1492 WIKI</small></h1>
        <a className="hero-link" href="#catalog">BROWSE ITEMS <ArrowDown size={16} /></a>
      </div>
      <div className="hero-foot"><span>EST. 1492</span><span>WEAPONS · ARMOR · EQUIPMENT</span></div>
    </section>
    <section id="catalog" className="catalog" aria-labelledby="catalog-title">
      <div className="section-heading">
        <div><p className="eyebrow">THE HUNTER'S ARCHIVE</p><h2 id="catalog-title">物品圖鑑<span className="heading-dot">.</span></h2></div>
        <Link to="/about" className="demo-note"><span className="status-dot" />資料來源說明 <ArrowUpRightSmall /></Link>
      </div>

      <div className="catalog-controls">
        <div className="category-tabs" role="group" aria-label="物品分類">
          <button className={!category ? 'active' : ''} aria-pressed={!category} onClick={() => update({ category: '', page: '' })}>
            <BookOpen size={17} /><span>全部物品</span><span className="tab-count">{total ?? '—'}</span>
          </button>
          {catalog.data?.data.categories.map(itemCategory => <button key={itemCategory.code} className={category === itemCategory.code ? 'active' : ''} aria-pressed={category === itemCategory.code}
            onClick={() => update({ category: itemCategory.code, page: '' })}>
            <span>{itemCategory.name}</span><span className="tab-count">{itemCategory.count}</span>
          </button>)}
        </div>
        {catalog.error && <div className="inline-error" role="alert">分類數量暫時無法載入。<button onClick={catalog.retry}>重試</button></div>}
        <div className="search-row">
          <form className="search-form" onSubmit={search} role="search">
            <Search size={20} aria-hidden="true" />
            <label className="sr-only" htmlFor="card-search">依名稱或編號搜尋</label>
            <input id="card-search" type="search" autoComplete="off" maxLength={100} placeholder="搜尋名稱、編號、說明或牌面文字" value={draft} onChange={event => setDraft(event.target.value)} />
            {draft && <button className="clear-search" type="button" aria-label="清除搜尋" onClick={() => { setDraft(''); update({ q: '', page: '' }); }}><X size={16} /></button>}
            <button type="submit" className="search-submit">搜尋 <ArrowRight size={15} /></button>
          </form>
          <div className="sort-field"><label htmlFor="sort">排序</label><select id="sort" value={sort} onChange={event => update({ sort: event.target.value, page: '' })}>
            <option value="number">依物品編號</option><option value="name">依物品名稱</option>
          </select></div>
        </div>
        <ItemFilters params={params} catalog={catalog.data?.data} update={update} reset={reset} />
      </div>

      <div className="results-meta" ref={resultsRef} tabIndex={-1}>
        <p role="status" aria-live="polite">{cards.loading ? '正在整理檔案…' : data ? <>
          共 <strong>{data.pagination.total}</strong> 件物品{q && <span> · 搜尋「{q}」</span>}
          {data.data.length > 0 && <span className="result-range"> / 顯示 {(data.pagination.page - 1) * data.pagination.pageSize + 1}–{Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)}</span>}
        </> : '資料讀取失敗'}</p>
        <div className="view-controls" role="group" aria-label="顯示方式">
          <button className={view === 'grid' ? 'active' : ''} aria-label="網格顯示" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={17} /></button>
          <button className={view === 'list' ? 'active' : ''} aria-label="列表顯示" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={19} /></button>
        </div>
      </div>
      {cards.loading ? <CardSkeletons /> : cards.error ? <><ErrorState message={cards.error.message} onRetry={cards.retry} /><button className="filter-reset" onClick={reset}>清除無效的查詢條件</button></> : data?.data.length ?
        <div className={`card-grid ${view === 'list' ? 'list-view' : ''}`}>{data.data.map(item => <ItemTile key={item.id} item={item} catalogSearch={location.search} />)}</div> :
        <EmptyState onReset={reset} />}

      {data && data.pagination.totalPages > 1 && <nav className="pagination" aria-label="物品分頁">
        <button className="page-arrow" disabled={data.pagination.page <= 1} onClick={() => changePage(data.pagination.page - 1)}><ChevronLeft size={16} /><span>上一頁</span></button>
        <span>第 <strong>{data.pagination.page}</strong> 頁 <span className="muted">/ {data.pagination.totalPages}</span></span>
        <button className="page-arrow" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => changePage(data.pagination.page + 1)}><span>下一頁</span><ChevronRight size={16} /></button>
      </nav>}
      <p className="catalog-footnote">✧ 本頁資料來自 equipment_page1.json；來源與校對說明請見物品詳情。</p>
    </section>
  </>;
}

function ArrowUpRightSmall() { return <ArrowRight size={13} className="diagonal-arrow" aria-hidden="true" />; }
