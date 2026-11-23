import { resolve } from 'node:path';

export default {
  base: './',
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), rig: resolve(import.meta.dirname, 'rig.html') },
    },
  },
};
