import type { CatalogResponse } from '../../shared/types';
import { attackLabels, attributeLabels, consumptionLabels, usageLabels } from '../../shared/types';

interface Props { params: URLSearchParams; catalog?: CatalogResponse['data']; update: (changes: Record<string, string>) => void; reset: () => void }
export function ItemFilters({ params, catalog, update, reset }: Props) {
  const activeCount = [...params].filter(([key, value]) => !['q','category','sort','page','pageSize'].includes(key) && value).length;
  function select(name: string, label: string, options: { code: string; name: string }[], placeholder = '不限') {
    return <label className="filter-field" key={name}><span>{label}</span><select value={params.get(name) ?? ''} onChange={e => update({ [name]: e.target.value, page: '' })}>
      <option value="">{placeholder}</option>{options.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
    </select></label>;
  }
  function number(name: string, label: string, min = 0) {
    return <label className="filter-field" key={name}><span>{label}</span><input type="number" min={min} max={1000} step={1} inputMode="numeric" placeholder="不限" value={params.get(name) ?? ''} onChange={e => update({ [name]: e.target.value, page: '' })} /></label>;
  }
  const options = (labels: Record<string, string>) => Object.entries(labels).map(([code, name]) => ({ code, name }));
  const usageOptions = options(usageLabels).filter(option => option.code !== 'single_use');
  return <details className="advanced-filters" open={activeCount > 0 || undefined}>
    <summary>進階篩選 <span>{activeCount ? `${activeCount} 項條件` : '格數、面板與效果'}</span></summary>
    <div className="filter-groups">
      <fieldset><legend>攜帶與使用</legend><div className="filter-fields">
        {select('slotCount','占用格數',[1,2,3].map(n => ({ code: String(n), name: `${n} 格` })))}
        {select('consumption','消耗方式', options(consumptionLabels))}{select('usage','使用限制', usageOptions)}
        {select('connector','附件接口',catalog?.connectors ?? [])}
      </div></fieldset>
      <fieldset><legend>攻擊與判定</legend><div className="filter-fields">
        {select('attackType','攻擊類型',options(attackLabels))}{select('attribute','判定屬性',options(attributeLabels))}
        {select('trait','武器特性',catalog?.traits ?? [])}
        {number('rangeMin','搜尋距離下限')}{number('rangeMax','搜尋距離上限')}
      </div><p className="filter-hint">符合任一重疊距離；多個條件須符合同一行動模式。</p></fieldset>
      <fieldset><legend>防禦與效果</legend><div className="filter-fields">
        {number('minMeleeDefense','最低近戰防禦')}{number('minRangedDefense','最低遠程防禦')}{number('minMagicDefense','最低魔法防禦')}
        {select('effect','效果',catalog?.effects ?? [])}{select('negative','效果性質',[{code:'0',name:'正面／中性'},{code:'1',name:'負面效果'}])}
      </div></fieldset>

    </div>
    <button className="filter-reset" type="button" onClick={reset}>清除全部搜尋與篩選</button>
  </details>;
}
