import { NextResponse } from "next/server";
import { z } from "zod";
import { entornoServidor } from "@/lib/env";
import { tokenValido, verificarFirma } from "@/lib/firma";
import { dentroDeHorarioDeCobro } from "@/lib/cobranza";
import { mensajeCumpleanos, mensajeInactivo } from "@/lib/fidelizacion";
import { destinoWhatsApp } from "@/lib/mensajes-eventos";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET (n8n, 9 a. m.): clientes a quienes saludar hoy (cumpleaños) o recordar (inactivos), con el mensaje armado. */
export async function GET(req: Request) {
  const { SURTIX_API_TOKEN } = entornoServidor();
  if (!SURTIX_API_TOKEN) return NextResponse.json({ error: "El token de n8n no está configurado" }, { status: 503 });
  if (!tokenValido(req.headers.get("authorization"), SURTIX_API_TOKEN)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // Mismo horario respetuoso que la cobranza: nada de mensajes de noche ni domingos.
  if (!dentroDeHorarioDeCobro()) return NextResponse.json({ contactos: [], motivo: "fuera de horario" });

  const { data, error } = await crearClienteAdmin().rpc("fidelizacion_para_n8n");
  if (error) return NextResponse.json({ error: "No se pudo leer la fidelización" }, { status: 500 });
  const contactos = (data ?? []).flatMap((r) => {
    const destino = destinoWhatsApp(r.telefono);
    if (!destino || (r.tipo !== "cumpleanos" && r.tipo !== "inactivo")) return [];
    const valorPunto = Number(r.valor_punto);
    return [{
      organizacion_id: r.organizacion_id,
      cliente_id: r.cliente_id,
      tipo: r.tipo,
      destino,
      mensaje: r.tipo === "cumpleanos" ? mensajeCumpleanos(r.cliente, r.organizacion, r.puntos_bono, valorPunto) : mensajeInactivo(r.cliente, r.organizacion, r.dato, r.puntos, valorPunto),
    }];
  });
  return NextResponse.json({ contactos });
}

const cuerpoEsquema = z.object({ cliente_id: z.uuid(), tipo: z.enum(["cumpleanos", "inactivo"]) });

/** POST (n8n): confirma que se envió el mensaje (y entrega el bono de cumpleaños). Token + firma HMAC. */
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
  const { error } = await crearClienteAdmin().rpc("registrar_contacto_fidelizacion", { p_cliente: c.data.cliente_id, p_tipo: c.data.tipo });
  if (error) return NextResponse.json({ error: "No se pudo registrar el contacto" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
