import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      // Each game is its own page: Gaffer at the root, the others under games/.
      input: {
        main: 'index.html',
        merge: 'games/merge/index.html',
        sudoku: 'games/sudoku/index.html',
        // 내 도시 더 크게: the Unity build is the main page (public/games/city); the web version stays as web.html.
        cityweb: 'games/city/web.html',
        keep: 'games/keep/index.html',
        roadlab: 'games/roadlab/index.html',
        nanjang: 'games/nanjang/index.html',
      },
    },
  },
});
