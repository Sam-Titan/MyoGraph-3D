import { defineConfig } from '@playwright/test'

// Expects `make dev` to be running (web 5180, API 8010), like `make screenshots`.
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5180'
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    // The first-visit story offer is a toast; every test starts as a returning visitor (stories.spec covers the offer).
    storageState: {
      cookies: [],
      origins: [{ origin: BASE_URL, localStorage: [{ name: 'myograph.story-seen', value: '1' }] }],
    },
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: SOFTWARE_GL },
  },
  projects: [
    { name: 'default', testIgnore: /fps\.spec/ },
    // No GPU at all: the WebGL context must still work (SwiftShader) and stay >= 20 fps.
    {
      name: 'no-gpu',
      testMatch: /fps\.spec/,
      use: { launchOptions: { args: ['--disable-gpu', '--enable-unsafe-swiftshader'] } },
    },
  ],
})
