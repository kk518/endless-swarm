import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Portable across root domains and subdirectory previews.
  build: { target: 'es2022', sourcemap: true },
});
