/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    electron({
      main: {
        // scanWorker is a separate worker_threads entry loaded by main at runtime
        entry: { main: 'electron/main.ts', scanWorker: 'electron/scanWorker.ts' },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            rollupOptions: {
              output: {
                // CJS so the default sandboxed renderer can load it
                format: 'cjs',
                entryFileNames: '[name].cjs',
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
    }),
  ],
  base: command === 'build' ? './' : '/',
  build: { outDir: 'dist' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
