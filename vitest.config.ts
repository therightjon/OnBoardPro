import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'happy-dom',
      setupFiles: ['./tests/setup.ts'],
      include: ['**/*.{test,spec}.{ts,tsx}'],
      exclude: ['node_modules', 'dist', '../server'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.d.ts',
          'src/**/*.stories.tsx',
          'src/**/*.test.{ts,tsx}',
          'src/**/*.spec.{ts,tsx}',
        ],
      },
    },
  })
);
