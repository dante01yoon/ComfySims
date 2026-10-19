import { defineConfig, devices } from '@playwright/test'

export const FAKE_COMFY_KEY = 'test-key-123'

export default defineConfig({
  testDir: 'acceptance/e2e',
  outputDir: '.harness/e2e-output',
  reporter: [['json', { outputFile: '.harness/e2e.json' }], ['line']],
  workers: 1,
  timeout: process.env.CI ? 90_000 : 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5179',
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  webServer: [
    {
      command: 'node harness/tools/fake-comfy.mjs',
      url: 'http://127.0.0.1:8199/__requests',
      env: { FAKE_COMFY_REQUIRE_KEY: FAKE_COMFY_KEY },
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: 'node harness/tools/fake-comfy.mjs',
      url: 'http://127.0.0.1:8196/__requests',
      env: { FAKE_COMFY_PORT: '8196', FAKE_COMFY_STORAGE_PORT: '8195', FAKE_COMFY_CATALOG: 'local' },
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: 'pnpm web:dev',
      url: 'http://127.0.0.1:5179',
      env: { ROOMFIT_COMFY_URL: 'http://127.0.0.1:8199', ROOMFIT_CLOUD_URL: 'http://127.0.0.1:8199', ROOMFIT_LOCAL_URL: 'http://127.0.0.1:8196', COMFY_CLOUD_API_KEY: FAKE_COMFY_KEY },
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
})
