// Pruebas automáticas de Trainly (Playwright) contra una versión con Supabase simulado (sin internet ni datos reales).
// Local:  npm test      ·  En GitHub corren solas en cada cambio (.github/workflows/pruebas.yml)
import { defineConfig, devices } from "@playwright/test";

const PORT = 4317;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 6_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", locale: "es-CL", timezoneId: "America/Santiago" },
  projects: [
    { name: "celular", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "celular-chico", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 640 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "tablet-horizontal", use: { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: "dark" } }
  ],
  webServer: {
    command: `npx vite build --outDir dist-test --emptyOutDir && npx vite preview --outDir dist-test --port ${PORT} --strictPort --host 127.0.0.1`,
    env: { VITE_MOCK: "1" },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
