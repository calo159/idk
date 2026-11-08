import { NextResponse } from "next/server";
import { entornoServidor } from "@/lib/env";
import { tokenValido } from "@/lib/firma";
import { destinoWhatsApp } from "@/lib/mensajes-eventos";
import { mensajeReposicion } from "@/lib/reposicion";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET (n8n, semanal): por negocio con WhatsApp y productos por reponer, el mensaje con la lista sugerida. */
export async function GET(req: Request) {
  const { SURTIX_API_TOKEN } = entornoServidor();
  if (!SURTIX_API_TOKEN) return NextResponse.json({ error: "El token de n8n no está configurado" }, { status: 503 });
  if (!tokenValido(req.headers.get("authorization"), SURTIX_API_TOKEN)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data, error } = await crearClienteAdmin().rpc("reposicion_para_resumen");
  if (error) return NextResponse.json({ error: "No se pudo calcular la reposición" }, { status: 500 });
  const sugerencias = (data ?? []).flatMap((o) => {
    const destino = destinoWhatsApp(o.telefono_whatsapp);
    const top = (Array.isArray(o.top) ? o.top : []) as { producto?: string; sugerida?: number; unidad?: string; dias?: number | null }[];
    const mensaje = destino
      ? mensajeReposicion(o.organizacion, o.criticos, o.total, Number(o.valor), top.map((t) => ({ producto: String(t.producto ?? ""), sugerida: Number(t.sugerida ?? 0), unidad: String(t.unidad ?? ""), dias: t.dias ?? null })))
      : null;
    return destino && mensaje ? [{ organizacion_id: o.organizacion_id, destino, mensaje }] : [];
  });
  return NextResponse.json({ sugerencias });
}
