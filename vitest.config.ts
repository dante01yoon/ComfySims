import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['acceptance/**/*.test.ts', 'harness/self-test/**/*.test.ts', 'packages/**/*.test.ts']
  }
})
