import { expect, test } from "@playwright/test";

/**
 * Pruebas de acceso que NO necesitan Supabase corriendo: lo que ve alguien sin sesión.
 * (Los flujos con sesión —registro, venta, compra, cierre de caja— están en e2e/flujos/ y exigen
 * `npm run db:start`; ver README.)
 */

const PROTEGIDAS = [
  "/dashboard",
  "/productos",
  "/inventario",
  "/compras",
  "/ventas/pos",
  "/caja",
  "/clientes",
  "/proveedores",
  "/reportes",
  "/configuracion",
  "/configuracion/usuarios",
];

for (const ruta of PROTEGIDAS) {
  test(`sin sesión, ${ruta} lleva a /login y recuerda el destino`, async ({ page }) => {
    await page.goto(ruta);
    await expect(page).toHaveURL(new RegExp(`/login\\?siguiente=${encodeURIComponent(ruta)}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Entra a tu negocio" })).toBeVisible();
  });
}

test("la raíz lleva al login cuando no hay sesión", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("login: la página está en español de Colombia y no desborda", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-CO");
  await expect(page).toHaveTitle(/Entrar/);
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(desborda).toBe(false);
});

test("login: valida campos vacíos sin llamar al servidor", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo inválido")).toBeVisible();
  await expect(page.getByText("La contraseña es obligatoria")).toBeVisible();
});

test("registro: valida los datos del negocio", async ({ page }) => {
  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("M");
  await page.getByLabel("Correo").fill("no-es-correo");
  await page.getByLabel(/Contraseña/).fill("123");
  await page.getByRole("button", { name: "Crear mi negocio" }).click();
  await expect(page.getByText("Correo inválido")).toBeVisible();
  await expect(page.getByText(/al menos 8 caracteres/)).toBeVisible();
  await expect(
    page.getByText(/negocio es obligatorio|al menos 2 caracteres/).first(),
  ).toBeVisible();
});

test("registro: ofrece los nichos con plantilla", async ({ page }) => {
  await page.goto("/registro");
  const opciones = await page.getByLabel("¿Qué vendes?").locator("option").allTextContents();
  expect(opciones).toEqual([
    "Ferretería",
    "Ropa y calzado",
    "Víveres / mayorista",
    "Veterinaria / agro",
    "Otro negocio",
  ]);
});

test("las rutas públicas abren sin sesión", async ({ page }) => {
  for (const [ruta, titulo] of [
    ["/recuperar", "Recupera tu contraseña"],
    ["/invitacion/abc123", "Te invitaron a un negocio en Surtix"],
  ] as const) {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
  }
});

test("el destino ?siguiente= externo no se usa como redirección", async ({ page }) => {
  await page.goto("/login?siguiente=https://evil.com");
  const oculto = await page.locator('input[name="siguiente"]').inputValue();
  // el valor viaja, pero el servidor lo neutraliza con rutaSegura (cubierto en tests unitarios)
  expect(oculto).toBe("https://evil.com");
  await expect(page).toHaveURL(/login/);
});
