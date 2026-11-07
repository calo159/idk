import { expect, test } from "@playwright/test";

const RUTAS: [string, string][] = [
  ["/dashboard", "Inicio"],
  ["/productos", "Productos"],
  ["/inventario", "Inventario"],
  ["/compras", "Compras"],
  ["/ventas/pos", "Vender"],
  ["/ventas/historial", "Historial de ventas"],
  ["/caja", "Caja"],
  ["/clientes", "Clientes"],
  ["/proveedores", "Proveedores"],
  ["/reportes", "Reportes"],
  ["/configuracion", "Configuración"],
];

test("la raíz lleva al tablero", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("la página declara español de Colombia", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-CO");
});

for (const [ruta, titulo] of RUTAS) {
  test(`abre ${ruta}`, async ({ page }) => {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1, name: titulo, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(titulo));
  });
}

test.describe("menú según el tamaño de pantalla", () => {
  test("celular: barra inferior visible, lateral oculto", async ({ page }, info) => {
    test.skip(info.project.name !== "celular", "solo aplica al proyecto celular");
    await page.goto("/dashboard");
    const barra = page.getByRole("navigation", { name: "Menú principal" });
    await expect(barra).toBeVisible();
    for (const nombre of ["Inicio", "Inventario", "Vender", "Caja", "Más"]) {
      await expect(barra.getByText(nombre, { exact: true })).toBeVisible();
    }
    await expect(page.locator("aside")).toBeHidden();
    // el botón central de vender es un destino táctil cómodo (≥ 44 px)
    const caja = await barra.getByRole("link", { name: "Vender" }).boundingBox();
    expect(caja!.height).toBeGreaterThanOrEqual(44);
  });

  test("celular: 'Más' abre las demás secciones y navega", async ({ page }, info) => {
    test.skip(info.project.name !== "celular", "solo aplica al proyecto celular");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Más" }).click();
    const hoja = page.getByRole("dialog");
    await expect(hoja.getByText("Más opciones")).toBeVisible();
    for (const nombre of [
      "Productos",
      "Compras",
      "Clientes",
      "Proveedores",
      "Reportes",
      "Configuración",
    ]) {
      await expect(hoja.getByRole("link", { name: nombre })).toBeVisible();
    }
    await hoja.getByRole("link", { name: "Clientes" }).click();
    await expect(page).toHaveURL(/\/clientes$/);
    await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible();
  });

  test("celular: marca como activo el destino actual", async ({ page }, info) => {
    test.skip(info.project.name !== "celular", "solo aplica al proyecto celular");
    await page.goto("/ventas/pos");
    await expect(
      page
        .getByRole("navigation", { name: "Menú principal" })
        .getByRole("link", { name: "Vender" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("escritorio: menú lateral completo, sin barra inferior", async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio", "solo aplica al proyecto escritorio");
    await page.goto("/dashboard");
    const lateral = page.locator("aside").getByRole("navigation", { name: "Menú principal" });
    await expect(lateral).toBeVisible();
    for (const nombre of [
      "Inicio",
      "Inventario",
      "Vender",
      "Caja",
      "Productos",
      "Compras",
      "Clientes",
      "Proveedores",
      "Reportes",
      "Configuración",
    ]) {
      await expect(lateral.getByRole("link", { name: nombre })).toBeVisible();
    }
    await expect(page.getByRole("navigation", { name: "Menú principal" })).toHaveCount(1);
  });

  test("sin desbordamiento horizontal", async ({ page }) => {
    await page.goto("/dashboard");
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(desborda).toBe(false);
  });
});
