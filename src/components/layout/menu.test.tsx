import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let ruta = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => ruta }));

import { BarraInferior } from "./barra-inferior";
import { BarraLateral } from "./barra-lateral";
import { ITEMS_BARRA_MOVIL, ITEMS_MAS, ITEMS_MENU, estaActivo } from "./menu";

beforeEach(() => {
  ruta = "/dashboard";
});

describe("menú: una sola fuente de verdad", () => {
  it("la barra del celular tiene 4 accesos y el resto va en 'Más'", () => {
    expect(ITEMS_BARRA_MOVIL.map((i) => i.etiqueta)).toEqual([
      "Inicio",
      "Inventario",
      "Vender",
      "Caja",
    ]);
    expect(ITEMS_BARRA_MOVIL.length + ITEMS_MAS.length).toBe(ITEMS_MENU.length);
    expect(ITEMS_BARRA_MOVIL.filter((i) => i.destacado).map((i) => i.etiqueta)).toEqual(["Vender"]);
  });

  it("estaActivo reconoce subrutas sin confundir prefijos parecidos", () => {
    const vender = ITEMS_MENU.find((i) => i.etiqueta === "Vender")!;
    const productos = ITEMS_MENU.find((i) => i.etiqueta === "Productos")!;
    expect(estaActivo(vender, "/ventas/historial")).toBe(true);
    expect(estaActivo(productos, "/productos/123")).toBe(true);
    expect(estaActivo(productos, "/productos-viejos")).toBe(false);
  });
});

describe("BarraInferior (celular)", () => {
  it("muestra los 4 accesos y 'Más'", () => {
    render(<BarraInferior />);
    const nav = screen.getByRole("navigation", { name: "Menú principal" });
    for (const nombre of ["Inicio", "Inventario", "Vender", "Caja", "Más"]) {
      expect(within(nav).getByText(nombre)).toBeInTheDocument();
    }
  });

  it("marca el destino actual con aria-current", () => {
    ruta = "/ventas/pos";
    render(<BarraInferior />);
    expect(screen.getByRole("link", { name: "Vender" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("'Más' abre la hoja con las demás secciones", () => {
    render(<BarraInferior />);
    fireEvent.click(screen.getByRole("button", { name: "Más" }));
    const hoja = screen.getByRole("dialog");
    for (const nombre of [
      "Productos",
      "Compras",
      "Clientes",
      "Proveedores",
      "Reportes",
      "Configuración",
    ]) {
      expect(within(hoja).getByRole("link", { name: nombre })).toBeInTheDocument();
    }
  });

  it("es solo para celular (oculta desde md)", () => {
    render(<BarraInferior />);
    expect(screen.getByRole("navigation", { name: "Menú principal" }).className).toContain(
      "md:hidden",
    );
  });
});

describe("BarraLateral (escritorio)", () => {
  it("lista todas las secciones y está oculta en celular", () => {
    const { container } = render(<BarraLateral />);
    expect(container.querySelector("aside")!.className).toContain("hidden");
    expect(container.querySelector("aside")!.className).toContain("md:flex");
    for (const item of ITEMS_MENU) {
      expect(screen.getByRole("link", { name: item.etiqueta })).toHaveAttribute("href", item.href);
    }
  });
});
