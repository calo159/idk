import { NextResponse } from "next/server";
import { z } from "zod";
import { dentroDeHorarioDeCobro, mensajeRecordatorio } from "@/lib/cobranza";
import { entornoServidor } from "@/lib/env";
import { tokenValido, verificarFirma } from "@/lib/firma";
import { destinoWhatsApp } from "@/lib/mensajes-eventos";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET (n8n, 10 a. m.): clientes con deuda vencida a quienes toca recordar hoy, con el mensaje ya armado. */
export async function GET(req: Request) {
  const { SURTIX_API_TOKEN } = entornoServidor();
  if (!SURTIX_API_TOKEN) return NextResponse.json({ error: "El token de n8n no está configurado" }, { status: 503 });
  if (!tokenValido(req.headers.get("authorization"), SURTIX_API_TOKEN)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // Fuera del horario permitido no se devuelve nada (aunque n8n se dispare a deshoras).
  if (!dentroDeHorarioDeCobro()) return NextResponse.json({ recordatorios: [], motivo: "fuera de horario" });

  const { data, error } = await crearClienteAdmin().rpc("recordatorios_pendientes");
  if (error) return NextResponse.json({ error: "No se pudo leer la cartera" }, { status: 500 });
  const recordatorios = (data ?? []).flatMap((r) => {
    const destino = destinoWhatsApp(r.telefono);
    if (!destino || !r.nivel || r.nivel < 1 || r.nivel > 3) return [];
    return [{
      organizacion_id: r.organizacion_id,
      cliente_id: r.cliente_id,
      nivel: r.nivel,
      saldo: Number(r.saldo),
      destino,
      mensaje: mensajeRecordatorio(r.nivel as 1 | 2 | 3, r.cliente, r.organizacion, Number(r.vencido), r.dias_mora),
    }];
  });
  return NextResponse.json({ recordatorios });
}

const cuerpoEsquema = z.object({ cliente_id: z.uuid(), nivel: z.number().int().min(1).max(3), saldo: z.number().min(0).max(999_999_999) });

/** POST (n8n): confirma que el recordatorio se envió, para no repetirlo. Token + firma HMAC. */
export async function POST(req: Request) {
  const { SURTIX_API_TOKEN, N8N_WEBHOOK_SECRET } = entornoServidor();
  if (!SURTIX_API_TOKEN || !N8N_WEBHOOK_SECRET) return NextResponse.json({ error: "La integración con n8n no está configurada" }, { status: 503 });
  if (!tokenValido(req.headers.get("authorization"), SURTIX_API_TOKEN)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const texto = await req.text();
  const firma = verificarFirma(texto, req.headers.get("x-surtix-firma"), req.headers.get("x-surtix-fecha"), N8N_WEBHOOK_SECRET);
  if (!firma.valida) return NextResponse.json({ error: "Firma inválida", motivo: firma.motivo }, { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const c = cuerpoEsquema.safeParse(json);
  if (!c.success) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  const { error } = await crearClienteAdmin().rpc("registrar_recordatorio", { p_cliente: c.data.cliente_id, p_nivel: c.data.nivel, p_saldo: c.data.saldo });
  if (error) return NextResponse.json({ error: "No se pudo registrar el recordatorio" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
