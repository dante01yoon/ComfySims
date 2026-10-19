import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['acceptance/**/*.test.ts', 'harness/self-test/**/*.test.ts', 'packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'web/src/**', 'web/*.ts', 'mcp/**', 'harness/tools/**'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: '.harness/coverage'
    }
  }
})
