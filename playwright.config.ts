import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'acceptance/e2e',
  outputDir: '.harness/e2e-output',
  reporter: [['json', { outputFile: '.harness/e2e.json' }], ['line']],
  use: {
    baseURL: 'http://127.0.0.1:5179',
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  webServer: {
    command: 'pnpm web:dev',
    url: 'http://127.0.0.1:5179',
    reuseExistingServer: false,
    timeout: 60_000
  }
})
