import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { reiniciarBdOffline } from "./cola";
import { contarVisitasPendientes, encolarVisita, listarVisitasEnCola, reintentarVisita, sincronizarVisitas } from "./visitas";

const visita = (id: string) => ({ offline_id: id, cliente_id: "c", resultado: "pedido" });
let n = 0;
beforeEach(async () => {
  await reiniciarBdOffline(`visitas-${++n}`);
});

describe("cola de visitas", () => {
  it("encolar dos veces el mismo offline_id deja una sola visita", async () => {
    await encolarVisita(visita("a"), 1);
    await encolarVisita(visita("a"), 1);
    expect(await listarVisitasEnCola()).toHaveLength(1);
  });
  it("envía de la más antigua a la más nueva y vacía la cola", async () => {
    await encolarVisita(visita("b"), 2000);
    await encolarVisita(visita("a"), 1000);
    const orden: string[] = [];
    const r = await sincronizarVisitas(async (p) => (orden.push(String(p.offline_id)), { tipo: "ok" }));
    expect(orden).toEqual(["a", "b"]);
    expect(r).toEqual({ enviadas: 2, rechazadas: 0, pendientes: 0 });
  });
  it("sin conexión se detiene y deja el resto pendiente", async () => {
    await encolarVisita(visita("a"), 1);
    await encolarVisita(visita("b"), 2);
    let llamadas = 0;
    const r = await sincronizarVisitas(async () => (llamadas++, { tipo: "sin_conexion" }));
    expect(llamadas).toBe(1);
    expect(r.pendientes).toBe(2);
  });
  it("una visita rechazada no bloquea las demás y se puede reintentar", async () => {
    await encolarVisita(visita("a"), 1);
    await encolarVisita(visita("b"), 2);
    const r = await sincronizarVisitas(async (p) => (p.offline_id === "a" ? { tipo: "rechazada", mensaje: "Ese cliente ya no existe" } : { tipo: "ok" }));
    expect(r).toMatchObject({ enviadas: 1, rechazadas: 1, pendientes: 0 });
    expect((await listarVisitasEnCola())[0]).toMatchObject({ offlineId: "a", estado: "rechazada", ultimoError: "Ese cliente ya no existe" });
    await reintentarVisita("a");
    expect(await contarVisitasPendientes()).toBe(1);
  });
  it("una excepción de red cuenta como sin conexión", async () => {
    await encolarVisita(visita("a"), 1);
    const r = await sincronizarVisitas(async () => { throw new Error("fetch failed"); });
    expect(r.pendientes).toBe(1);
  });
  it("recupera las que quedaron «enviando» al cerrarse la página", async () => {
    await encolarVisita(visita("a"), 1);
    const { bdOffline } = await import("./cola");
    await bdOffline().visitas.update("a", { estado: "enviando" });
    const r = await sincronizarVisitas(async () => ({ tipo: "ok" }));
    expect(r.enviadas).toBe(1);
  });
});
