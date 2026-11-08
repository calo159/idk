import Dexie, { type EntityTable } from "dexie";

/**
 * Cola de ventas hechas sin internet. La clave primaria es el `offline_id` (UUID generado en el
 * cliente), así que encolar dos veces la misma venta es imposible, y el servidor también es
 * idempotente por ese id: nada se duplica al sincronizar (regla #6 de CLAUDE.md).
 */

export type EstadoCola = "pendiente" | "enviando" | "rechazada";

export interface VentaEnCola {
  offlineId: string;
  /** Datos de la venta tal como los recibe `registrarVenta`. */
  payload: Record<string, unknown>;
  /** Total, solo para mostrarlo al vendedor. */
  total: number;
  estado: EstadoCola;
  intentos: number;
  creadoEn: number;
  ultimoError: string | null;
}

/** Visita de un vendedor de ruta hecha sin internet (se envía con `registrar_visita`, idempotente por offline_id). */
export interface VisitaEnCola {
  offlineId: string;
  payload: Record<string, unknown>;
  estado: EstadoCola;
  intentos: number;
  creadoEn: number;
  ultimoError: string | null;
}

class BdSurtix extends Dexie {
  ventas!: EntityTable<VentaEnCola, "offlineId">;
  visitas!: EntityTable<VisitaEnCola, "offlineId">;
  constructor(nombre = "surtix-offline") {
    super(nombre);
    this.version(1).stores({ ventas: "offlineId, estado, creadoEn" });
    this.version(2).stores({ ventas: "offlineId, estado, creadoEn", visitas: "offlineId, estado, creadoEn" });
  }
}

let bd: BdSurtix | null = null;
export function bdOffline(): BdSurtix {
  if (!bd) bd = new BdSurtix();
  return bd;
}

/** Solo para pruebas: reinicia la conexión. */
export async function reiniciarBdOffline(nombre?: string) {
  await bd?.delete();
  bd = new BdSurtix(nombre);
  return bd;
}

export async function encolarVenta(
  payload: { offline_id: string } & Record<string, unknown>,
  total: number,
  ahora = Date.now(),
): Promise<VentaEnCola> {
  const fila: VentaEnCola = {
    offlineId: payload.offline_id,
    payload,
    total,
    estado: "pendiente",
    intentos: 0,
    creadoEn: ahora,
    ultimoError: null,
  };
  // `put` conserva una sola fila por offline_id: reintentar el cobro no crea una segunda venta.
  const existente = await bdOffline().ventas.get(fila.offlineId);
  if (existente) return existente;
  await bdOffline().ventas.put(fila);
  return fila;
}

export const listarCola = () => bdOffline().ventas.orderBy("creadoEn").toArray();

export const contarPendientes = () =>
  bdOffline()
    .ventas.where("estado")
    .anyOf("pendiente", "enviando")
    .count();

export const descartarDeCola = (offlineId: string) => bdOffline().ventas.delete(offlineId);

export const reintentarRechazada = (offlineId: string) =>
  bdOffline().ventas.update(offlineId, { estado: "pendiente", ultimoError: null });

/** Resultado de intentar enviar una venta al servidor. */
export type RespuestaEnvio =
  | { tipo: "ok" } // registrada (o ya lo estaba)
  | { tipo: "rechazada"; mensaje: string } // el servidor la entendió y la rechazó (no reintentar solo)
  | { tipo: "sin_conexion" }; // no se pudo llegar al servidor (reintentar luego)

export interface ResumenSync {
  enviadas: number;
  rechazadas: number;
  pendientes: number;
}

let sincronizando = false;

/**
 * Envía las ventas pendientes de la más antigua a la más nueva. Si se pierde la conexión, se detiene
 * y deja el resto para después. Evita ejecuciones simultáneas (varias pestañas/eventos `online`).
 */
export async function sincronizarCola(
  enviar: (payload: Record<string, unknown>) => Promise<RespuestaEnvio>,
): Promise<ResumenSync> {
  const resumen: ResumenSync = { enviadas: 0, rechazadas: 0, pendientes: 0 };
  if (sincronizando) return { ...resumen, pendientes: await contarPendientes() };
  sincronizando = true;
  try {
    const cola = await bdOffline().ventas.where("estado").equals("pendiente").sortBy("creadoEn");
    for (const venta of cola) {
      await bdOffline().ventas.update(venta.offlineId, { estado: "enviando", intentos: venta.intentos + 1 });
      let r: RespuestaEnvio;
      try {
        r = await enviar(venta.payload);
      } catch {
        r = { tipo: "sin_conexion" };
      }
      if (r.tipo === "ok") {
        await bdOffline().ventas.delete(venta.offlineId);
        resumen.enviadas++;
      } else if (r.tipo === "rechazada") {
        await bdOffline().ventas.update(venta.offlineId, { estado: "rechazada", ultimoError: r.mensaje });
        resumen.rechazadas++;
      } else {
        await bdOffline().ventas.update(venta.offlineId, { estado: "pendiente" });
        break; // sin conexión: no tiene sentido seguir intentando con las demás
      }
    }
  } finally {
    sincronizando = false;
  }
  resumen.pendientes = await contarPendientes();
  return resumen;
}

/** Si la página se cerró en pleno envío, esas ventas quedaron "enviando": se devuelven a pendientes. */
export async function recuperarEnvioInterrumpido() {
  await bdOffline().ventas.where("estado").equals("enviando").modify({ estado: "pendiente" });
}
