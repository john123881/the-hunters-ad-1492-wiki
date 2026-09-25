import { readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const imageRoots = ['public/images/items', 'public/images/resources', 'public/images/workshops'];
const normalizedIconRoots = ['public/images/resources', 'public/images/workshops'];
const webpOptions = { quality: 84, alphaQuality: 100, effort: 5 };
const iconCanvas = 96;
const iconArtwork = 72;

async function pngFiles(directory) {
  return (await readdir(directory))
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .map((name) => path.join(directory, name));
}

async function normalizeIcon(input) {
  const temporary = `${input}.normalized.png`;
  await sharp(input)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(iconArtwork, iconArtwork, {
      fit: 'contain',
      position: 'centre',
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: (iconCanvas - iconArtwork) / 2,
      bottom: (iconCanvas - iconArtwork) / 2,
      left: (iconCanvas - iconArtwork) / 2,
      right: (iconCanvas - iconArtwork) / 2,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(temporary);
  await rename(temporary, input);
}

async function convert(input, output, resize) {
  let pipeline = sharp(input);
  if (resize) pipeline = pipeline.resize(resize);
  await pipeline.webp(webpOptions).toFile(output);
}

for (const directory of normalizedIconRoots) {
  for (const input of await pngFiles(directory)) await normalizeIcon(input);
}

let converted = 0;
let sourceBytes = 0;
let outputBytes = 0;

for (const directory of imageRoots) {
  for (const input of await pngFiles(directory)) {
    const output = input.replace(/\.png$/i, '.webp');
    await convert(input, output);
    sourceBytes += (await stat(input)).size;
    outputBytes += (await stat(output)).size;
    converted += 1;
  }
}

const heroInput = 'public/images/hero-keyart.png';
const heroOutputs = [
  ['public/images/hero-keyart-640.webp', { width: 640, withoutEnlargement: true }],
  ['public/images/hero-keyart.webp', { width: 1200, withoutEnlargement: true }],
];

for (const [output, resize] of heroOutputs) await convert(heroInput, output, resize);

const savedPercent = sourceBytes === 0 ? 0 : Math.round((1 - outputBytes / sourceBytes) * 100);
console.log(`Normalized material/workshop icons to ${iconCanvas}×${iconCanvas}px with equal ${iconArtwork}×${iconArtwork}px artwork bounds.`);
console.log(`Converted ${converted} PNG files to WebP; item/resource/workshop output is ${savedPercent}% smaller.`);
console.log('Generated responsive hero WebP files at 640px and 1200px.');
