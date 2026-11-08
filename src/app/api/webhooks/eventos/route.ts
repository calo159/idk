import { NextResponse } from "next/server";
import { entornoServidor } from "@/lib/env";
import { tokenValido } from "@/lib/firma";
import { destinoWhatsApp, mensajeDeEvento } from "@/lib/mensajes-eventos";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET (n8n, cada minuto): reclama los eventos pendientes del outbox y devuelve el mensaje de WhatsApp ya armado.
 * Autenticación: `Authorization: Bearer SURTIX_API_TOKEN`. Los eventos quedan "arrendados" 2 minutos: si n8n no
 * confirma con POST /api/webhooks/eventos/{id}, se reentregan (hasta 5 intentos).
 */
export async function GET(req: Request) {
  const { SURTIX_API_TOKEN } = entornoServidor();
  if (!SURTIX_API_TOKEN) return NextResponse.json({ error: "El token de n8n no está configurado" }, { status: 503 });
  if (!tokenValido(req.headers.get("authorization"), SURTIX_API_TOKEN))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const limite = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limite") ?? 50) || 50, 1), 200);
  const admin = crearClienteAdmin();
  const { data, error } = await admin.rpc("reclamar_eventos", { p_limite: limite });
  if (error) return NextResponse.json({ error: "No se pudieron leer los eventos" }, { status: 500 });

  const eventos = (data ?? []).map((e) => {
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    // Los avisos de pedido confirmado/rechazado van al cliente que hizo el pedido, no al dueño.
    const paraCliente = (e.tipo === "pedido.confirmado" || e.tipo === "pedido.rechazado") && typeof payload.telefono_cliente === "string";
    const destino = destinoWhatsApp(paraCliente ? (payload.telefono_cliente as string) : e.telefono_whatsapp);
    const mensaje = destino ? mensajeDeEvento(e.tipo, payload, e.organizacion) : null;
    return {
      id: e.id,
      organizacion_id: e.organizacion_id,
      tipo: e.tipo,
      intentos: e.intentos,
      destino,
      mensaje,
      /** Si no hay mensaje o destino, n8n solo debe confirmar el evento (no enviar nada). */
      omitir: !destino || !mensaje,
    };
  });
  return NextResponse.json({ eventos });
}
