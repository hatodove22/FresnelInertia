import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', atlas: 'atlas.html', series: 'series.html' } } },
});
