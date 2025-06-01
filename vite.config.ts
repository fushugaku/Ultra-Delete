import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    build: {
      target: 'node18',
      lib: {
        entry: resolve(__dirname, 'src/extension.ts'),
        name: 'extension',
        fileName: 'extension',
        formats: ['cjs']
      },
      rollupOptions: {
        external: ['vscode'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      },
      outDir: 'dist',
      sourcemap: isDev ? 'inline' : false,
      minify: !isDev,
      watch: isDev ? {
        include: 'src/**',
        exclude: 'node_modules/**'
      } : null,
      emptyOutDir: true
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode)
    },
  };
});