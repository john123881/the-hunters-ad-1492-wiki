import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const sourceRoot='/mnt/c/Users/a1238/.codex/generated_images/01a0d7e5-8532-7213-a2cb-eb14f5473a8f';
const outputRoot='public/images/campaign/characters';
const width=900,height=1200;
const boards=[['brawler','exec-fd6f9abb-c21e-4f00-afb4-602f8af5c804.png'],['crossbowman','exec-110c183b-9590-4fda-be6c-0a754d9c3f34.png'],['cutthroat','exec-fbf1e46d-04fa-4481-b164-1fc874a67433.png'],['huntress','exec-6ed19464-fb70-44d3-b635-629a07d17e78.png'],['landsknecht','exec-824fc2f5-7dca-45b6-b8ea-98d7be45305f.png'],['man-at-arms','exec-109846df-a2cd-4c2a-a774-13bf0f82709f.png'],['medic','exec-88c842de-0980-4893-9f6b-2f8e2343d29a.png'],['sorceress','exec-cbdb4464-5b14-4b0e-8aa3-a0d262e6485c.png'],['witch','exec-7b137fa8-b7fd-4d7d-8889-ca2e896c15b3.png']];
await fs.mkdir(outputRoot,{recursive:true});
for(const [slug,source] of boards) await sharp(path.join(sourceRoot,source)).resize(width,height,{fit:'fill'}).png({compressionLevel:9}).toFile(path.join(outputRoot,slug+'-board-v1.png'));
const tw=300,th=400,gap=24,lh=44,cw=tw*3+gap*4,ch=(th+lh)*3+gap*4,composites=[];
for(let i=0;i<boards.length;i++){const [slug]=boards[i],col=i%3,row=Math.floor(i/3),left=gap+col*(tw+gap),top=gap+row*(th+lh+gap);const image=await sharp(path.join(outputRoot,slug+'-board-v1.png')).resize(tw,th).toBuffer();const label=Buffer.from('<svg width="'+tw+'" height="'+lh+'"><rect width="100%" height="100%" fill="#0a0d0d"/><text x="'+(tw/2)+'" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#e2bd67">'+slug+'</text></svg>');composites.push({input:image,left,top},{input:label,left,top:top+th});}
await sharp({create:{width:cw,height:ch,channels:3,background:'#050707'}}).composite(composites).png({compressionLevel:9}).toFile(path.join(outputRoot,'all-character-boards-v1-preview.png'));
const manifest={version:1,dimensions:{width,height},coordinateSystem:'All board interaction coordinates use this 900x1200 image space.',boards:Object.fromEntries(boards.map(([slug])=>[slug,'/images/campaign/characters/'+slug+'-board-v1.png']))};
await fs.writeFile(path.join(outputRoot,'character-board-assets-v1.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Created '+boards.length+' boards at '+width+'x'+height+'.');