import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contarPendientes,
  descartarDeCola,
  encolarVenta,
  listarCola,
  recuperarEnvioInterrumpido,
  reintentarRechazada,
  reiniciarBdOffline,
  sincronizarCola,
} from "./cola";

const venta = (id: string) => ({ offline_id: id, lineas: [], pagos: [] });
let n = 0;

beforeEach(async () => {
  await reiniciarBdOffline(`test-${++n}`);
});

describe("cola offline", () => {
  it("encolar dos veces el mismo offline_id deja una sola venta", async () => {
    await encolarVenta(venta("a"), 1000);
    await encolarVenta(venta("a"), 1000);
    expect(await listarCola()).toHaveLength(1);
  });

  it("sincroniza en orden de antigüedad y vacía la cola", async () => {
    await encolarVenta(venta("b"), 20, 2000);
    await encolarVenta(venta("a"), 10, 1000);
    const orden: string[] = [];
    const r = await sincronizarCola(async (p) => {
      orden.push(String(p.offline_id));
      return { tipo: "ok" };
    });
    expect(orden).toEqual(["a", "b"]);
    expect(r).toEqual({ enviadas: 2, rechazadas: 0, pendientes: 0 });
    expect(await listarCola()).toHaveLength(0);
  });

  it("si se cae la conexión se detiene y conserva el resto", async () => {
    await encolarVenta(venta("a"), 1, 1);
    await encolarVenta(venta("b"), 1, 2);
    await encolarVenta(venta("c"), 1, 3);
    let llamadas = 0;
    const r = await sincronizarCola(async () => {
      llamadas++;
      return llamadas === 1 ? { tipo: "ok" } : { tipo: "sin_conexion" };
    });
    expect(llamadas).toBe(2);
    expect(r).toMatchObject({ enviadas: 1, pendientes: 2 });
    expect((await listarCola()).map((v) => v.offlineId)).toEqual(["b", "c"]);
    expect((await listarCola())[0]!.estado).toBe("pendiente");
  });

  it("una excepción de red cuenta como sin conexión", async () => {
    await encolarVenta(venta("a"), 1);
    const r = await sincronizarCola(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r.pendientes).toBe(1);
  });

  it("una venta rechazada no bloquea las demás y queda visible con su motivo", async () => {
    await encolarVenta(venta("mala"), 1, 1);
    await encolarVenta(venta("buena"), 1, 2);
    const r = await sincronizarCola(async (p) =>
      p.offline_id === "mala" ? { tipo: "rechazada", mensaje: "Sin stock" } : { tipo: "ok" },
    );
    expect(r).toMatchObject({ enviadas: 1, rechazadas: 1, pendientes: 0 });
    const cola = await listarCola();
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({ offlineId: "mala", estado: "rechazada", ultimoError: "Sin stock" });
    // no se reenvía sola
    let llamadas = 0;
    await sincronizarCola(async () => (llamadas++, { tipo: "ok" }));
    expect(llamadas).toBe(0);
    // el dueño la puede reintentar o descartar
    await reintentarRechazada("mala");
    expect(await contarPendientes()).toBe(1);
    await descartarDeCola("mala");
    expect(await listarCola()).toHaveLength(0);
  });

  it("no corre dos sincronizaciones a la vez (no duplica envíos)", async () => {
    await encolarVenta(venta("a"), 1);
    let llamadas = 0;
    const lento = async () => {
      llamadas++;
      await new Promise((r) => setTimeout(r, 30));
      return { tipo: "ok" as const };
    };
    await Promise.all([sincronizarCola(lento), sincronizarCola(lento)]);
    expect(llamadas).toBe(1);
  });

  it("recupera ventas que quedaron 'enviando' si se cerró la pestaña", async () => {
    await encolarVenta(venta("a"), 1);
    const { bdOffline } = await import("./cola");
    await bdOffline().ventas.update("a", { estado: "enviando" });
    await recuperarEnvioInterrumpido();
    expect((await listarCola())[0]!.estado).toBe("pendiente");
  });
});
