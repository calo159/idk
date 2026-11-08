import { NextResponse } from "next/server";
import { z } from "zod";
import { entornoServidor } from "@/lib/env";
import { tokenValido, verificarFirma } from "@/lib/firma";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const cuerpoEsquema = z.object({ ok: z.boolean(), error: z.string().max(500).optional() });

/**
 * POST (n8n): confirma un evento como enviado (`{ok:true}`) o informa el fallo (`{ok:false, error}`).
 * Exige token Bearer Y firma HMAC del cuerpo (`x-surtix-firma` + `x-surtix-fecha`), porque cambia estado.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { SURTIX_API_TOKEN, N8N_WEBHOOK_SECRET } = entornoServidor();
  if (!SURTIX_API_TOKEN || !N8N_WEBHOOK_SECRET)
    return NextResponse.json({ error: "La integración con n8n no está configurada" }, { status: 503 });
  if (!tokenValido(req.headers.get("authorization"), SURTIX_API_TOKEN))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const texto = await req.text();
  const firma = verificarFirma(texto, req.headers.get("x-surtix-firma"), req.headers.get("x-surtix-fecha"), N8N_WEBHOOK_SECRET);
  if (!firma.valida) return NextResponse.json({ error: "Firma inválida", motivo: firma.motivo }, { status: 401 });

  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const cuerpo = cuerpoEsquema.safeParse(json);
  if (!cuerpo.success) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });

  const admin = crearClienteAdmin();
  const { error } = await admin.rpc("finalizar_evento", { p_id: Number(id), p_ok: cuerpo.data.ok, p_error: cuerpo.data.error });
  if (error) return NextResponse.json({ error: "No se pudo actualizar el evento" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
