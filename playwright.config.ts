import { defineConfig, devices } from "@playwright/test";

/**
 * e2e de Surtix. Localmente usa el Edge del sistema (sin descargar navegadores);
 * en CI usa Chromium de Playwright (`npx playwright install chromium`).
 * Se puede forzar con PW_CHANNEL=chrome|msedge|chromium.
 */
const canal = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "msedge");
const puerto = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${puerto}`,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "on-first-retry",
    ...(canal ? { channel: canal } : {}),
  },
  projects: [
    { name: "celular", use: { ...devices["Pixel 7"], ...(canal ? { channel: canal } : {}) } },
    {
      name: "escritorio",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        ...(canal ? { channel: canal } : {}),
      },
    },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${puerto}`,
    url: `http://localhost:${puerto}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-key-de-prueba",
    },
  },
});
