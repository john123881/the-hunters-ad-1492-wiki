import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

function sitesArtifact() {
  return {
    name: 'sites-artifact',
    apply: 'build' as const,
    async closeBundle() {
      const metadataDirectory = resolve('dist/.openai');
      await rm(metadataDirectory, { recursive: true, force: true });
      await mkdir(metadataDirectory, { recursive: true });
      await cp('.openai/hosting.json', resolve(metadataDirectory, 'hosting.json'));
      await cp('drizzle', resolve(metadataDirectory, 'drizzle'), { recursive: true });
      await mkdir(resolve('dist/server'), { recursive: true });
      await cp(resolve('dist/the_hunters_ad_1492/index.js'), resolve('dist/server/index.js'));
    },
  };
}


export default defineConfig({
  plugins: [react(), cloudflare(), sitesArtifact()],
  server: { port: 5173, strictPort: true },
});
