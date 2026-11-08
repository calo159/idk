import { NextResponse } from "next/server";
import { z } from "zod";
import { entornoServidor } from "@/lib/env";
import { tokenValido, verificarFirma } from "@/lib/firma";
import { destinoWhatsApp } from "@/lib/mensajes-eventos";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { responderMensaje } from "@/server/bot/ejecutar";
import { interpretar } from "@/server/bot/ia";
import { crearRepoBot } from "@/server/bot/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const cuerpoEsquema = z.object({
  telefono: z.string().min(7).max(25),
  /** Texto del mensaje, o la transcripción si era un audio (la hace n8n). */
  texto: z.string().max(2000),
  /** ID del mensaje de WhatsApp: evita procesar dos veces un reenvío de Meta. */
  mensaje_id: z.string().min(3).max(200),
});

/**
 * POST (n8n, mensaje entrante del dueño). Token + firma HMAC.
 * Responde `{ respuesta, destino }` para que n8n lo envíe por WhatsApp, o `{ respuesta: null }` si no hay que contestar
 * (número no autorizado: no se revela que el bot existe; mensaje repetido).
 */
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

  const admin = crearClienteAdmin();
  const { data: quien } = await admin.rpc("bot_resolver", { p_telefono: c.data.telefono });
  const remitente = quien?.[0];
  if (!remitente) return NextResponse.json({ respuesta: null, motivo: "numero_no_autorizado" });

  const { data: nuevo } = await admin.rpc("bot_registrar_mensaje", { p_mensaje: c.data.mensaje_id, p_org: remitente.organizacion_id });
  if (nuevo === false) return NextResponse.json({ respuesta: null, motivo: "mensaje_repetido" });

  const intencion = await interpretar(c.data.texto);
  const respuesta = await responderMensaje(
    crearRepoBot(admin),
    { org: remitente.organizacion_id, usuario: remitente.usuario_id, nombre: remitente.nombre, negocio: remitente.organizacion },
    c.data.telefono,
    intencion,
  );
  return NextResponse.json({ respuesta, destino: destinoWhatsApp(c.data.telefono) });
}
