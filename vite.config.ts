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
      },
    },
  },
});
