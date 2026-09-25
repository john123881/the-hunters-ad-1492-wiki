import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const imageRoots = ['public/images/items', 'public/images/resources'];
const webpOptions = { quality: 84, alphaQuality: 100, effort: 5 };

async function pngFiles(directory) {
  return (await readdir(directory))
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .map((name) => path.join(directory, name));
}

async function convert(input, output, resize) {
  let pipeline = sharp(input);
  if (resize) pipeline = pipeline.resize(resize);
  await pipeline.webp(webpOptions).toFile(output);
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

for (const [output, resize] of heroOutputs) {
  await convert(heroInput, output, resize);
}

const savedPercent = sourceBytes === 0 ? 0 : Math.round((1 - outputBytes / sourceBytes) * 100);
console.log(`Converted ${converted} PNG files to WebP; item/resource output is ${savedPercent}% smaller.`);
console.log('Generated responsive hero WebP files at 640px and 1200px.');
