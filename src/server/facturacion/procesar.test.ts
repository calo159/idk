import { describe, expect, it, vi } from "vitest";
import { procesarCola } from "./procesar";
import { type DocumentoFactura, type ProveedorFE, proveedorSimulado } from "./proveedores";

const doc = (o: { documento?: string; ambiente?: "pruebas" | "produccion" } = {}): DocumentoFactura => ({
  tipo: "factura_venta", ambiente: o.ambiente ?? "pruebas", venta_id: "v1",
  emisor: { nit: "900123456", dv: "7", razon_social: "Alfa SAS", prefijo: "FE", resolucion: "1876", rango_desde: 1, rango_hasta: 100 },
  numero: 7, numero_completo: "FE7", fecha: "2026-11-07T10:00:00-05:00",
  receptor: { tipo_documento: "CC", documento: o.documento ?? "1065000111", nombre: "Ana" },
  lineas: [{ codigo: "A", descripcion: "Taladro", unidad: "unidad", cantidad: 1, precio_unitario: 119000, descuento_linea: 0, descuento_general: 0, base: 100000, iva_pct: 19, iva: 19000, total: 119000 }],
  totales: { base: 100000, iva: 19000, descuento_general: 0, total: 119000, por_tarifa: { "19": { base: 100000, iva: 19000 } } },
  forma_pago: "contado", pagos: [{ metodo: "efectivo", monto: 119000 }],
});

function adminFalso(filas: { id: string; proveedor: string; documento: unknown }[]) {
  const resultados: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (nombre: string, args: Record<string, unknown>) => {
    if (nombre === "facturas_pendientes_envio") return { data: filas.map((f) => ({ ...f, organizacion_id: "o", ambiente: "pruebas", intentos: 1 })), error: null };
    resultados.push(args);
    return { error: null };
  });
  return { admin: { rpc } as never, resultados, rpc };
}

describe("proveedor simulado", () => {
  it("acepta con un CUFE falso identificable y nunca en producción", async () => {
    const ok = await proveedorSimulado.enviar(doc());
    expect(ok).toMatchObject({ estado: "aceptada" });
    expect(ok.cufe).toMatch(/^SIMULADO-/);
    expect(await proveedorSimulado.enviar(doc({ ambiente: "produccion" }))).toMatchObject({ estado: "rechazada" });
  });
  it("rechaza un adquirente que empieza por 0000 (para probar el camino de rechazo)", async () => {
    expect(await proveedorSimulado.enviar(doc({ documento: "0000123" }))).toMatchObject({ estado: "rechazada", error: expect.stringContaining("inválido") });
  });
  it("el CUFE es estable para el mismo documento", async () => {
    expect((await proveedorSimulado.enviar(doc())).cufe).toBe((await proveedorSimulado.enviar(doc())).cufe);
  });
});

describe("procesarCola", () => {
  it("envía cada factura y registra el resultado", async () => {
    const { admin, resultados } = adminFalso([{ id: "f1", proveedor: "simulado", documento: doc() }, { id: "f2", proveedor: "simulado", documento: doc({ documento: "0000999" }) }]);
    const r = await procesarCola(admin, { simulado: proveedorSimulado });
    expect(r).toEqual({ tomadas: 2, aceptadas: 1, rechazadas: 1, errores: 0 });
    expect(resultados[0]).toMatchObject({ p_id: "f1", p_estado: "aceptada", p_cufe: expect.stringMatching(/^SIMULADO-/) });
    expect(resultados[1]).toMatchObject({ p_id: "f2", p_estado: "rechazada", p_error: "Documento del adquirente inválido (simulado)" });
  });
  it("un proveedor que no existe deja la factura en error (se reintenta), no la rechaza", async () => {
    const { admin, resultados } = adminFalso([{ id: "f1", proveedor: "factus", documento: doc() }]);
    const r = await procesarCola(admin, { simulado: proveedorSimulado });
    expect(r.errores).toBe(1);
    expect(resultados[0]).toMatchObject({ p_estado: "error", p_error: expect.stringContaining("«factus» no está disponible") });
  });
  it("si el proveedor lanza una excepción de red es un error transitorio y el resto de la cola sigue", async () => {
    const roto: ProveedorFE = { nombre: "roto", enviar: async () => { throw new Error("ETIMEDOUT"); } };
    const { admin, resultados } = adminFalso([{ id: "f1", proveedor: "roto", documento: doc() }, { id: "f2", proveedor: "simulado", documento: doc() }]);
    const r = await procesarCola(admin, { roto, simulado: proveedorSimulado });
    expect(r).toMatchObject({ tomadas: 2, errores: 1, aceptadas: 1 });
    expect(resultados[0]).toMatchObject({ p_estado: "error", p_error: "ETIMEDOUT" });
  });
  it("un documento mal formado se rechaza sin molestar al proveedor", async () => {
    const enviar = vi.fn();
    const { admin, resultados } = adminFalso([{ id: "f1", proveedor: "x", documento: { hola: 1 } }]);
    const r = await procesarCola(admin, { x: { nombre: "x", enviar } });
    expect(r.rechazadas).toBe(1);
    expect(enviar).not.toHaveBeenCalled();
    expect(resultados[0]).toMatchObject({ p_estado: "rechazada" });
  });
  it("una «aceptada» sin CUFE no cuenta como aceptada", async () => {
    const sinCufe: ProveedorFE = { nombre: "x", enviar: async () => ({ estado: "aceptada", respuesta: {} }) };
    const { admin, resultados } = adminFalso([{ id: "f1", proveedor: "x", documento: doc() }]);
    const r = await procesarCola(admin, { x: sinCufe });
    expect(r).toMatchObject({ aceptadas: 0, errores: 1 });
    expect(resultados[0]).toMatchObject({ p_estado: "error", p_error: expect.stringContaining("CUFE") });
  });
  it("si la base de datos falla al leer la cola, lanza el error", async () => {
    const admin = { rpc: async () => ({ data: null, error: { message: "boom" } }) } as never;
    await expect(procesarCola(admin, {})).rejects.toThrow(/cola de facturas/);
  });
});
