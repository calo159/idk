import { NextResponse } from "next/server";
import { entornoServidor } from "@/lib/env";
import { aCentavos, leerTransaccion, verificarEvento } from "@/lib/wompi";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Webhook de Wompi. La autenticidad la da el checksum del evento (secreto de eventos), no un token.
 * Responde 200 a todo lo que no le concierne para que Wompi no reintente eventos que nunca vamos a usar.
 */
export async function POST(req: Request) {
  const { WOMPI_EVENTS_SECRET } = entornoServidor();
  if (!WOMPI_EVENTS_SECRET) return NextResponse.json({ error: "El cobro en línea no está configurado" }, { status: 503 });
  const cuerpo = await req.json().catch(() => null);
  const v = verificarEvento(cuerpo, WOMPI_EVENTS_SECRET);
  if (!v.valido) return NextResponse.json({ error: "Evento no válido" }, { status: 401 });
  const t = leerTransaccion(v.evento);
  if (!t) return NextResponse.json({ ok: true, ignorado: true });
  // Una transacción pendiente no cambia nada todavía: Wompi enviará otro evento cuando se resuelva.
  if (t.estado === "pendiente") return NextResponse.json({ ok: true, pendiente: true });

  // La BD compara el monto aprobado con el esperado (en pesos): si no coincide, no activa nada.
  const pesos = t.centavos / 100;
  const { data, error } = await crearClienteAdmin().rpc("aplicar_pago_suscripcion", {
    p_referencia: t.referencia,
    p_transaccion_id: t.id,
    p_estado: t.estado,
    p_monto: pesos as unknown as number,
    p_respuesta: { evento: v.evento.event, transaccion: t.id, estado: t.estado, centavos: t.centavos, esperado_en_centavos: aCentavos(pesos) },
  });
  // Un fallo de base de datos sí se reintenta (500); un pago desconocido o ya aplicado no.
  if (error) return NextResponse.json({ error: "No se pudo registrar el pago" }, { status: 500 });
  return NextResponse.json({ ok: true, resultado: data });
}
