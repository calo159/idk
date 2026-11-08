import { type RespuestaEnvio, type VisitaEnCola, bdOffline } from "./cola";

/** Cola de visitas de ruta. Misma idea que la de ventas: clave = offline_id, el servidor es idempotente. */

export async function encolarVisita(payload: { offline_id: string } & Record<string, unknown>, ahora = Date.now()): Promise<VisitaEnCola> {
  const existente = await bdOffline().visitas.get(payload.offline_id);
  if (existente) return existente;
  const fila: VisitaEnCola = { offlineId: payload.offline_id, payload, estado: "pendiente", intentos: 0, creadoEn: ahora, ultimoError: null };
  await bdOffline().visitas.put(fila);
  return fila;
}

export const listarVisitasEnCola = () => bdOffline().visitas.orderBy("creadoEn").toArray();

export const contarVisitasPendientes = () => bdOffline().visitas.where("estado").anyOf("pendiente", "enviando").count();

export const descartarVisita = (offlineId: string) => bdOffline().visitas.delete(offlineId);

export const reintentarVisita = (offlineId: string) => bdOffline().visitas.update(offlineId, { estado: "pendiente", ultimoError: null });

let sincronizando = false;

/** Envía las visitas pendientes de la más antigua a la más nueva; se detiene si se pierde la conexión. */
export async function sincronizarVisitas(
  enviar: (payload: Record<string, unknown>) => Promise<RespuestaEnvio>,
): Promise<{ enviadas: number; rechazadas: number; pendientes: number }> {
  const resumen = { enviadas: 0, rechazadas: 0, pendientes: 0 };
  if (sincronizando) return { ...resumen, pendientes: await contarVisitasPendientes() };
  sincronizando = true;
  try {
    // Visitas que quedaron «enviando» porque la página se cerró en pleno envío.
    await bdOffline().visitas.where("estado").equals("enviando").modify({ estado: "pendiente" });
    const cola = await bdOffline().visitas.where("estado").equals("pendiente").sortBy("creadoEn");
    for (const v of cola) {
      await bdOffline().visitas.update(v.offlineId, { estado: "enviando", intentos: v.intentos + 1 });
      let r: RespuestaEnvio;
      try {
        r = await enviar(v.payload);
      } catch {
        r = { tipo: "sin_conexion" };
      }
      if (r.tipo === "ok") {
        await bdOffline().visitas.delete(v.offlineId);
        resumen.enviadas++;
      } else if (r.tipo === "rechazada") {
        await bdOffline().visitas.update(v.offlineId, { estado: "rechazada", ultimoError: r.mensaje });
        resumen.rechazadas++;
      } else {
        await bdOffline().visitas.update(v.offlineId, { estado: "pendiente" });
        break;
      }
    }
  } finally {
    sincronizando = false;
  }
  resumen.pendientes = await contarVisitasPendientes();
  return resumen;
}
