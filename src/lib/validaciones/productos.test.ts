import { describe, expect, it } from "vitest";
import {
  esquemaPresentacion,
  esquemaProducto,
  mensajeErrorProducto,
  validarFoto,
} from "./productos";

const base = {
  nombre: "Cemento gris 50 kg",
  sku: "",
  codigo_barras: "",
  categoria_id: "",
  descripcion: "",
  unidad_base: "unidad",
  precio_venta: "$ 32.500",
  margen_objetivo: "",
  stock_minimo: "",
  maneja_inventario: true,
};

describe("esquemaProducto", () => {
  it("lee precios en formato colombiano y vacíos como opcionales", () => {
    const r = esquemaProducto.parse(base);
    expect(r.precio_venta).toBe(32500);
    expect(r.stock_minimo).toBe(0);
    expect(r.sku).toBeUndefined();
    expect(r.codigo_barras).toBeUndefined();
    expect(r.categoria_id).toBeUndefined();
    expect(r.margen_objetivo).toBeUndefined();
  });

  it("acepta decimales con coma y stock mínimo fraccionario", () => {
    const r = esquemaProducto.parse({ ...base, precio_venta: "1.250,50", stock_minimo: "2,5" });
    expect(r.precio_venta).toBe(1250.5);
    expect(r.stock_minimo).toBe(2.5);
  });

  it("rechaza nombre corto, precio negativo, texto y unidad inventada", () => {
    const r = esquemaProducto.safeParse({
      ...base,
      nombre: "a",
      precio_venta: "-5",
      stock_minimo: "abc",
      unidad_base: "galaxias",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const campos = r.error.issues.map((i) => i.path[0]);
      expect(campos).toEqual(
        expect.arrayContaining(["nombre", "precio_venta", "stock_minimo", "unidad_base"]),
      );
    }
  });

  it("valida el código de barras y el margen", () => {
    expect(esquemaProducto.safeParse({ ...base, codigo_barras: "7701234567890" }).success).toBe(true);
    expect(esquemaProducto.safeParse({ ...base, codigo_barras: "12 34" }).success).toBe(false);
    expect(esquemaProducto.safeParse({ ...base, margen_objetivo: "35" }).success).toBe(true);
    expect(esquemaProducto.safeParse({ ...base, margen_objetivo: "150" }).success).toBe(false);
  });

  it("rechaza más de 2 decimales en el precio", () => {
    expect(esquemaProducto.safeParse({ ...base, precio_venta: "10,999" }).success).toBe(false);
  });
});

describe("esquemaPresentacion", () => {
  const p = {
    producto_id: "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b",
    nombre: "Caja x12",
    factor: "12",
    codigo_barras: "",
    precio_venta: "360.000",
  };
  it("acepta una presentación válida", () => {
    const r = esquemaPresentacion.parse(p);
    expect(r.factor).toBe(12);
    expect(r.precio_venta).toBe(360000);
  });
  it("el factor debe ser positivo y el precio es obligatorio", () => {
    expect(esquemaPresentacion.safeParse({ ...p, factor: "0" }).success).toBe(false);
    expect(esquemaPresentacion.safeParse({ ...p, factor: "0,0001" }).success).toBe(false);
    expect(esquemaPresentacion.safeParse({ ...p, precio_venta: "" }).success).toBe(false);
  });
});

describe("foto y errores", () => {
  it("solo imágenes ≤ 3 MB", () => {
    expect(validarFoto({ type: "image/webp", size: 1000 })).toBeNull();
    expect(validarFoto({ type: "application/pdf", size: 1000 })).toMatch(/JPG/);
    expect(validarFoto({ type: "image/png", size: 4 * 1024 * 1024 })).toMatch(/3 MB/);
  });
  it("traduce duplicados", () => {
    expect(mensajeErrorProducto('violates unique constraint "productos_organizacion_id_sku_key"')).toMatch(
      /SKU/,
    );
    expect(mensajeErrorProducto("otra cosa")).toMatch(/Intenta de nuevo/);
  });
});

import { esquemaAjuste } from "./inventario";

describe("esquemaAjuste", () => {
  const a = {
    producto_id: "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b",
    bodega_id: "4f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b",
    modo: "salida",
    cantidad: "2,5",
    motivo: "Producto dañado",
    costo: "",
  };
  it("acepta salida con decimales y costo vacío", () => {
    const r = esquemaAjuste.parse(a);
    expect(r.cantidad).toBe(2.5);
    expect(r.costo).toBe(0);
  });
  it("exige motivo y cantidad positiva, pero el conteo acepta cero", () => {
    expect(esquemaAjuste.safeParse({ ...a, motivo: "  " }).success).toBe(false);
    expect(esquemaAjuste.safeParse({ ...a, cantidad: "0" }).success).toBe(false);
    expect(esquemaAjuste.safeParse({ ...a, modo: "conteo", cantidad: "0" }).success).toBe(true);
    expect(esquemaAjuste.safeParse({ ...a, cantidad: "1,2345" }).success).toBe(false);
  });
});
