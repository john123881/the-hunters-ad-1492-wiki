import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourceDir = path.join(root, 'campaign_characters');
const outputDir = path.join(sourceDir, 'normalized');
const portraitCanvas = { width: 900, height: 1200 };
const layoutCanvas = { width: 900, height: 900 };
const background = { r: 13, g: 18, b: 19, alpha: 1 };

const defaultLayoutCrop = { left: 55, top: 380, width: 790, height: 760 };

const heroes = [
  { slug: 'brawler', front: { input: 'brawler1.jpg', crop: { left: 57, top: 172, width: 993, height: 1301 } }, back: { input: 'brawler2.jpg', rotate: -0.8, crop: { left: 62, top: 110, width: 982, height: 1306 } } },
  { slug: 'crossbowman', front: { input: 'crossbowman1.jpg', crop: { left: 45, top: 158, width: 1002, height: 1315 } }, back: { input: 'crossbowman2.jpg', crop: { left: 34, top: 134, width: 1012, height: 1310 } } },
  { slug: 'cutthroat', front: { input: 'cutthroat1.jpg', crop: { left: 77, top: 186, width: 972, height: 1287 } }, back: { input: 'cutthroat2.jpg', crop: { left: 76, top: 124, width: 970, height: 1275 } } },
  { slug: 'huntress', front: { input: 'huntress1.jpg', crop: { left: 102, top: 239, width: 952, height: 1234 } }, back: { input: 'huntress2.jpg', crop: { left: 66, top: 148, width: 980, height: 1235 } } },
  { slug: 'landsknecht', front: { input: 'landsknecht1.jpg', crop: { left: 39, top: 174, width: 1008, height: 1299 } }, back: { input: 'landsknecht2.jpg', crop: { left: 84, top: 117, width: 956, height: 1287 } } },
  { slug: 'man-at-arms', front: { input: 'man-at-arms1.jpg', crop: { left: 37, top: 185, width: 1012, height: 1288 } }, back: { input: 'man-at-arms2.jpg', crop: { left: 44, top: 111, width: 972, height: 1292 } } },
  { slug: 'medic', front: { input: 'medic1.jpg', crop: { left: 80, top: 199, width: 970, height: 1274 } }, back: { input: 'medic2.jpg', crop: { left: 98, top: 138, width: 948, height: 1255 } } },
  { slug: 'sorceress', front: { input: 'sorceress1.jpg', crop: { left: 42, top: 201, width: 1007, height: 1272 } }, back: { input: 'sorceress2.jpg', crop: { left: 35, top: 148, width: 1011, height: 1265 } } },
  { slug: 'witch', front: { input: 'witch1.jpg', crop: { left: 74, top: 207, width: 976, height: 1266 } }, back: { input: 'witch2.jpg', crop: { left: 74, top: 136, width: 972, height: 1257 } } },
];

await fs.mkdir(outputDir, { recursive: true });

for (const hero of heroes) {
  let backPipeline = sharp(path.join(sourceDir, hero.back.input));
  if (hero.back.rotate) {
    backPipeline = backPipeline.rotate(hero.back.rotate, { background });
  }

  const normalizedBack = await backPipeline
    .extract(hero.back.crop)
    .resize(portraitCanvas.width, portraitCanvas.height, {
      fit: 'contain', position: 'centre', background, kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  let frontPipeline = sharp(path.join(sourceDir, hero.front.input));
  if (hero.front.rotate) {
    frontPipeline = frontPipeline.rotate(hero.front.rotate, { background });
  }

  await frontPipeline
    .extract(hero.front.crop)
    .resize(portraitCanvas.width, portraitCanvas.height, {
      fit: 'contain', position: 'centre', background, kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: 90, effort: 6, smartSubsample: true })
    .toFile(path.join(outputDir, `${hero.slug}-front.webp`));

  const layoutCrop = hero.layoutCrop || defaultLayoutCrop;
  await sharp(normalizedBack)
    .extract(layoutCrop)
    .resize(layoutCanvas.width, layoutCanvas.height, {
      fit: 'contain', position: 'centre', background, kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toFile(path.join(outputDir, `${hero.slug}-initial-layout.webp`));
}

const cellWidth = 600;
const cellHeight = 360;
const composites = [];
for (let index = 0; index < heroes.length; index += 1) {
  const hero = heroes[index];
  const x = (index % 3) * cellWidth;
  const y = Math.floor(index / 3) * cellHeight;
  const image = await sharp(path.join(outputDir, `${hero.slug}-initial-layout.webp`))
    .resize(330, 330, { fit: 'contain', background })
    .toBuffer();
  const label = Buffer.from(`<svg width="250" height="330" xmlns="http://www.w3.org/2000/svg">
    <text x="20" y="145" fill="#e6c873" font-family="Arial, sans-serif" font-size="22" letter-spacing="2">${hero.slug}</text>
    <text x="20" y="180" fill="#9bb0b3" font-family="Arial, sans-serif" font-size="16">INITIAL LAYOUT</text>
  </svg>`);
  composites.push(
    { input: image, left: x + 260, top: y + 15 },
    { input: label, left: x, top: y + 15 },
  );
}
await sharp({ create: { width: 1800, height: 1080, channels: 4, background: { r: 5, g: 8, b: 9, alpha: 1 } } })
  .composite(composites)
  .webp({ quality: 92, effort: 6, smartSubsample: true })
  .toFile(path.join(outputDir, 'all-initial-layouts-preview.webp'));

await fs.writeFile(path.join(outputDir, 'character-board-template.json'), JSON.stringify({
  frontCanvas: portraitCanvas,
  initialLayoutCanvas: layoutCanvas,
  initialLayoutCropOnNormalizedBack: defaultLayoutCrop,
  outputFormat: 'webp',
  quality: { front: 90, initialLayout: 92 },
  fit: 'contain',
  background: '#0d1213',
  sourcePreserved: true,
  heroes,
}, null, 2) + '\n');

const obsolete = [
  'all-character-boards-preview.webp',
  'landsknecht-template-preview.webp',
  'landsknecht-template.json',
  ...heroes.map(hero => `${hero.slug}-back.webp`),
];
await Promise.all(obsolete.map(async file => {
  try { await fs.unlink(path.join(outputDir, file)); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}));
