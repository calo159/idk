import { formatoCOP } from "@/lib/dinero";
import { hoyBogota, sumarDias } from "@/lib/fechas";
import type { Resumen } from "@/lib/resumen";
import { type Intencion, TEXTO_AYUDA, esquemaIntencion } from "./interprete";

/** Todo el acceso a datos del bot pasa por aquí: el ejecutor no sabe de Supabase y se prueba con un repositorio falso. */
export interface RepoBot {
  resumen(org: string, desde: string, hasta: string): Promise<Resumen | null>;
  buscarProductos(org: string, texto: string): Promise<{ nombre: string; stock: number; unidad: string }[]>;
  buscarClientes(org: string, texto: string): Promise<{ nombre: string; saldo: number }[]>;
  topDeudores(org: string): Promise<{ nombre: string; saldo: number; total: number }[]>;
  guardarPendiente(telefono: string, org: string, usuario: string, accion: unknown): Promise<void>;
  tomarPendiente(telefono: string): Promise<{ organizacion_id: string; usuario_id: string; accion: unknown } | null>;
  registrarGasto(org: string, usuario: string, g: { categoria: string; descripcion: string; monto: number; metodo: string }): Promise<void>;
}

export interface Remitente {
  org: string;
  usuario: string;
  nombre: string;
  negocio: string;
}

const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? "";
const num = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);

function rangoVentas(periodo: "hoy" | "ayer" | "semana" | "mes", hoy: string) {
  switch (periodo) {
    case "hoy": return { desde: hoy, hasta: hoy, texto: "hoy" };
    case "ayer": { const a = sumarDias(hoy, -1); return { desde: a, hasta: a, texto: "ayer" }; }
    case "semana": return { desde: sumarDias(hoy, -6), hasta: hoy, texto: "los últimos 7 días" };
    case "mes": return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy, texto: "lo que va del mes" };
  }
}

export async function responderMensaje(
  repo: RepoBot,
  quien: Remitente,
  telefono: string,
  intencion: Intencion,
  hoy: string = hoyBogota(),
): Promise<string> {
  switch (intencion.tipo) {
    case "ayuda":
      return `Hola ${primerNombre(quien.nombre)} 👋 Soy el asistente de *${quien.negocio}*.\n${TEXTO_AYUDA}`;

    case "ventas": {
      const r = rangoVentas(intencion.periodo, hoy);
      const res = await repo.resumen(quien.org, r.desde, r.hasta);
      if (!res) return "No pude consultar las ventas ahora. Intenta de nuevo en un momento.";
      if (res.ventas === 0) return `Sin ventas registradas ${r.texto}.`;
      return `📊 Vendiste *${formatoCOP(res.total)}* en ${res.ventas} venta(s) ${r.texto}.\nUtilidad: ${formatoCOP(res.utilidad)}${res.gastos ? `\nGastos: ${formatoCOP(res.gastos)}` : ""}${res.top_productos[0] ? `\nLo más vendido: ${res.top_productos[0].nombre}` : ""}`;
    }

    case "stock": {
      const p = await repo.buscarProductos(quien.org, intencion.producto);
      if (p.length === 0) return `No encontré productos que se parezcan a «${intencion.producto}».`;
      return `📦 Inventario:\n${p.slice(0, 5).map((x) => `• ${x.nombre}: *${num(x.stock)}* ${x.unidad}`).join("\n")}${p.length > 5 ? `\n…y ${p.length - 5} más. Sé más específico.` : ""}`;
    }

    case "deuda": {
      if (intencion.cliente) {
        const c = await repo.buscarClientes(quien.org, intencion.cliente);
        if (c.length === 0) return `No encontré un cliente que se llame «${intencion.cliente}».`;
        return c.slice(0, 5).map((x) => (x.saldo > 0 ? `• ${x.nombre} debe *${formatoCOP(x.saldo)}*` : `• ${x.nombre} no debe nada ✔`)).join("\n");
      }
      const top = await repo.topDeudores(quien.org);
      if (top.length === 0) return "Nadie te debe nada en este momento. ✔";
      return `💰 Te deben *${formatoCOP(top[0]!.total)}* en total. Los mayores:\n${top.slice(0, 5).map((x) => `• ${x.nombre}: ${formatoCOP(x.saldo)}`).join("\n")}`;
    }

    case "gasto": {
      // Nada se guarda todavía: se pide confirmación (la IA propone, la persona decide).
      await repo.guardarPendiente(telefono, quien.org, quien.usuario, intencion);
      return `Voy a registrar este gasto:\n• *${formatoCOP(intencion.monto)}* en ${intencion.categoria}\n• ${intencion.descripcion}\n• Pagado con ${intencion.metodo}\n\n¿Lo confirmo? Responde *SÍ* o *NO* (vence en 10 minutos).`;
    }

    case "confirmar": {
      const p = await repo.tomarPendiente(telefono);
      if (!p || p.organizacion_id !== quien.org || p.usuario_id !== quien.usuario) return "No tengo nada pendiente por confirmar.";
      // Lo guardado es JSON de la base de datos: se vuelve a validar antes de usarlo.
      const accion = esquemaIntencion.safeParse(p.accion);
      if (!accion.success || accion.data.tipo !== "gasto") return "No pude recuperar lo que ibas a registrar. Escríbelo de nuevo.";
      try {
        await repo.registrarGasto(quien.org, quien.usuario, accion.data);
      } catch {
        return "No pude guardar el gasto. Intenta de nuevo o regístralo desde la app.";
      }
      return `✔ Gasto registrado: ${formatoCOP(accion.data.monto)} en ${accion.data.categoria}.`;
    }

    case "cancelar": {
      const p = await repo.tomarPendiente(telefono);
      return p ? "Listo, no registré nada." : "No tenía nada pendiente.";
    }

    case "no_entendido":
      return `No te entendí 🤔\n${TEXTO_AYUDA}`;
  }
}
