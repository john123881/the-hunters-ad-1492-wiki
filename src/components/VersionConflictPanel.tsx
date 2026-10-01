import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

export function VersionConflictPanel({title,changedFields,expectedVersion,currentVersion,busy,onReload,onReapply}:{
  title:string;changedFields:string[];expectedVersion:number|null;currentVersion:number;
  busy?:boolean;onReload:()=>void;onReapply:()=>void;
}){
  return <section className="version-conflict" role="alert" aria-live="assertive">
    <AlertTriangle aria-hidden="true"/>
    <div><p className="eyebrow">VERSION CONFLICT</p><h2>{title}</h2>
      <p>你開始編輯時是版本 {expectedVersion??'未知'}，目前已更新為版本 {currentVersion}。</p>
      <strong>其他玩家修改了：</strong>
      <ul>{changedFields.map(field=><li key={field}>{field}</li>)}</ul>
      <p>你的修改仍保留，可先採用最新資料，或將你的修改重新套用到最新版本。</p>
    </div>
    <div className="version-conflict-actions">
      <button className="button secondary" type="button" disabled={busy} onClick={onReload}><RefreshCw/>使用最新資料</button>
      <button className="button" type="button" disabled={busy} onClick={onReapply}><RotateCcw/>{busy?'重新套用中…':'保留我的修改並重新套用'}</button>
    </div>
  </section>;
}
