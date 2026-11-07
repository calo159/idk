import { type Page, expect, test } from "@playwright/test";

/**
 * Flujos críticos de punta a punta: venta, compra y cierre de caja.
 *
 * Necesitan Supabase corriendo con la demo cargada (ver README → "Datos de demo"):
 *   npx supabase start && npm run db:reset && npm run demo:sql   # y cargar supabase/seed-demo.sql
 *   E2E_SUPABASE=1 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run test:e2e -- flujos
 *
 * Sin E2E_SUPABASE=1 se omiten (no pueden ejecutarse sin un backend real).
 */
test.skip(!process.env.E2E_SUPABASE, "Requiere Supabase local con la demo cargada (E2E_SUPABASE=1)");
test.describe.configure({ mode: "serial" });

const CLAVE = "Demo-Surtix-2026";

async function entrar(page: Page, correo: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test("venta: buscar, cobrar en efectivo con vuelto y ver la venta en el historial", async ({ page }) => {
  await entrar(page, "maria@surtix.co"); // la demo deja su caja abierta hoy
  await page.goto("/ventas/pos");
  await page.getByLabel(/Buscar producto/).fill("cemento gris");
  await page.getByRole("button", { name: /Cemento gris 50 kg/ }).first().click();
  await page.getByRole("button", { name: "Cobrar" }).click();
  await page.getByRole("button", { name: "$ 50.000" }).click();
  await expect(page.getByText(/Vuelto/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(page.getByRole("heading", { name: /Venta #\d+ registrada/ })).toBeVisible();
  await expect(page.getByText(/Vuelto: \$ 16\.000/)).toBeVisible();

  await page.goto("/ventas/historial");
  await expect(page.getByText("$ 34.000").first()).toBeVisible();
});

test("compra: registrar y confirmar una compra aumenta el stock", async ({ page }) => {
  await entrar(page, "demo@surtix.co");
  await page.goto("/compras/nueva");
  await page.getByLabel("Agregar producto").fill("alambre de amarre");
  await page.getByRole("button", { name: /Alambre de amarre/ }).click();
  await page.getByLabel("Costo unitario").fill("6500");
  await page.getByRole("button", { name: "Confirmar compra" }).click();
  await expect(page).toHaveURL(/\/compras\/[0-9a-f-]{36}/);
  await expect(page.getByText("Confirmada")).toHaveCount(0); // confirmada no muestra insignia
  await expect(page.getByText(/Anular compra/)).toBeVisible();
});

test("caja: abrir con base, y cerrar con conteo por denominaciones", async ({ page }) => {
  await entrar(page, "demo@surtix.co");
  await page.goto("/caja");
  await page.getByLabel("Base en efectivo ($)").fill("50000");
  await page.getByRole("button", { name: "Abrir caja" }).click();
  await expect(page.getByText(/Cerrar caja/).first()).toBeVisible();

  await page.getByLabel("$ 50.000", { exact: true }).fill("1");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cerrar caja" }).click();
  await expect(page.getByText("Caja cerrada")).toBeVisible();
  await expect(page.getByText("La caja cuadra ✔")).toBeVisible();
});
