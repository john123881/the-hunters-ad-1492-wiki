import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const baseUrl=process.env.IMAGE_AUDIT_BASE_URL??'http://127.0.0.1:4173';
const groups=[
['裝備面板基本載入組',['/images/campaign/characters/equipment-board-gridless-v5.webp','/images/campaign/characters/slot-cover-10xp-v3.webp','/images/campaign/characters/slot-cover-blocked-x-v3.webp']],
['角色面板',['brawler','crossbowman','cutthroat','huntress','landsknecht','man-at-arms','medic','sorceress','witch'].map(name=>'/images/campaign/characters/'+name+'-board-v2.webp')],
['馬車面板',['/images/campaign/wagon-board-concept-v3.webp']],
['首頁主視覺',['/images/hero-keyart.webp','/images/hero-keyart-640.webp']]];
const fmt=b=>b>=1048576?(b/1048576).toFixed(2)+' MB':Math.round(b/1024)+' KB';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:393,height:852}});
const page=await context.newPage(),client=await context.newCDPSession(page);
await client.send('Network.enable');
await client.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:187500,uploadThroughput:93750,connectionType:'cellular3g'});
await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
const measurements=[];
for(const[name,paths]of groups){const start=Date.now();const results=await page.evaluate(async({origin,paths})=>Promise.all(paths.map(path=>new Promise(resolve=>{const image=new Image();image.decoding='async';image.onload=async()=>{try{await image.decode();resolve({path,ok:true,width:image.naturalWidth,height:image.naturalHeight})}catch(error){resolve({path,ok:false,error:String(error)})}};image.onerror=()=>resolve({path,ok:false,error:'load error'});image.src=origin+path}))),{origin:baseUrl,paths});measurements.push({name,elapsedMs:Date.now()-start,results})}
const responses=[];
for(const[,paths]of groups)for(const path of paths){const response=await context.request.get(baseUrl+path);responses.push({path,status:response.status(),type:response.headers()['content-type']??'',cache:response.headers()['cache-control']??'',bytes:(await response.body()).byteLength})}
await browser.close();
const results=measurements.flatMap(g=>g.results),failures=results.filter(r=>!r.ok),invalid=responses.filter(r=>r.status!==200||!r.type.startsWith('image/')),total=responses.reduce((s,r)=>s+r.bytes,0);
const groupRows=measurements.map(g=>{const bytes=responses.filter(r=>g.results.some(x=>x.path===r.path)).reduce((s,r)=>s+r.bytes,0);return '| '+g.name+' | '+g.results.length+' | '+fmt(bytes)+' | '+g.elapsedMs+' ms | '+(g.results.every(r=>r.ok)?'通過':'失敗')+' |'}).join('\n');
const assetRows=responses.map(r=>{const x=results.find(v=>v.path===r.path),d=x?.ok?x.width+'×'+x.height:'解碼失敗';return '| `'+r.path+'` | '+r.status+' | '+fmt(r.bytes)+' | '+d+' | `'+(r.cache||'未設定')+'` |'}).join('\n');
const report=`# 正式站部署前圖片載入驗收

產生時間：${new Date().toISOString()}

測試環境：production build、本機預覽、393×852 viewport、100 ms latency、1.5 Mbps download。

## 結果

- 圖片：**${responses.length} 張／${fmt(total)}**
- HTTP 或圖片格式錯誤：**${invalid.length}**
- 瀏覽器載入或解碼錯誤：**${failures.length}**
- 結論：**${failures.length===0&&invalid.length===0?'通過':'未通過'}**

| 圖片組 | 張數 | 容量 | 慢速網路完成時間 | 結果 |
| --- | ---: | ---: | ---: | --- |
${groupRows}

## 資產明細

| 路徑 | HTTP | 容量 | 解碼尺寸 | Cache-Control |
| --- | ---: | ---: | --- | --- |
${assetRows}

時間是依序測試各圖片組的單次結果，只用於發現明顯退化，不作為正式站 CDN 的固定 SLA。
`;
await writeFile(new URL('../docs/image-performance-release-check.md',import.meta.url),report);
console.log('Verified '+responses.length+' release images ('+fmt(total)+').');
console.log('Decode failures: '+failures.length+'; invalid responses: '+invalid.length+'.');
if(failures.length||invalid.length)process.exitCode=1;