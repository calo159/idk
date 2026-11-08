import { NextResponse } from "next/server";
import { entornoServidor } from "@/lib/env";
import { tokenValido } from "@/lib/firma";
import { hoyBogota, sumarDias } from "@/lib/fechas";
import { destinoWhatsApp } from "@/lib/mensajes-eventos";
import { type Resumen, esquemaResumen, mensajeResumenDia, mensajeSemanal } from "@/lib/resumen";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { pdfSemanal } from "@/server/pdf-semanal";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks/resumen?tipo=dia|semana[&pdf=1]  (n8n, Bearer SURTIX_API_TOKEN)
 *  - Sin `pdf`: lista, por negocio con WhatsApp y ventas recientes, el destino y el mensaje ya armado.
 *  - Con `pdf=1&organizacion=…`: devuelve el PDF semanal de ese negocio (application/pdf).
 * El día/semana se calcula con la hora de Bogotá. La semana es la anterior completa (lunes a domingo).
 */
export async function GET(req: Request) {
  const { SURTIX_API_TOKEN } = entornoServidor();
  if (!SURTIX_API_TOKEN) return NextResponse.json({ error: "El token de n8n no está configurado" }, { status: 503 });
  if (!tokenValido(req.headers.get("authorization"), SURTIX_API_TOKEN)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") === "semana" ? "semana" : "dia";
  const hoy = hoyBogota();
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const lunesPasado = sumarDias(hoy, -(dow === 0 ? 13 : dow + 6));
  const rango = tipo === "dia"
    ? { desde: hoy, hasta: hoy, antDesde: sumarDias(hoy, -1), antHasta: sumarDias(hoy, -1) }
    : { desde: lunesPasado, hasta: sumarDias(lunesPasado, 6), antDesde: sumarDias(lunesPasado, -7), antHasta: sumarDias(lunesPasado, -1) };

  const admin = crearClienteAdmin();
  const resumenDe = async (org: string, desde: string, hasta: string): Promise<Resumen | null> => {
    const { data, error } = await admin.rpc("resumen_periodo", { p_org: org, p_desde: desde, p_hasta: hasta });
    const r = esquemaResumen.safeParse(data);
    return error || !r.success ? null : r.data;
  };

  const orgId = url.searchParams.get("organizacion");
  if (url.searchParams.get("pdf") === "1") {
    if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) return NextResponse.json({ error: "Falta la organización" }, { status: 400 });
    const [{ data: org }, actual, anterior] = await Promise.all([
      admin.from("organizaciones").select("nombre").eq("id", orgId).maybeSingle(),
      resumenDe(orgId, rango.desde, rango.hasta),
      resumenDe(orgId, rango.antDesde, rango.antHasta),
    ]);
    if (!org || !actual) return NextResponse.json({ error: "No se pudo generar el reporte" }, { status: 404 });
    const pdf = await pdfSemanal(org.nombre, actual, anterior ?? undefined);
    return new Response(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="semana-${rango.desde}.pdf"`, "Cache-Control": "no-store" },
    });
  }

  const { data: orgs, error } = await admin.rpc("organizaciones_para_resumen");
  if (error) return NextResponse.json({ error: "No se pudo leer la lista de negocios" }, { status: 500 });
  const salida = [];
  for (const o of orgs ?? []) {
    const destino = destinoWhatsApp(o.telefono_whatsapp);
    if (!destino) continue;
    const [actual, anterior] = await Promise.all([resumenDe(o.id, rango.desde, rango.hasta), resumenDe(o.id, rango.antDesde, rango.antHasta)]);
    if (!actual) continue;
    salida.push({
      organizacion_id: o.id,
      destino,
      mensaje: tipo === "dia" ? mensajeResumenDia(actual, o.nombre, anterior ?? undefined) : mensajeSemanal(actual, o.nombre, anterior ?? undefined),
      archivo_pdf: tipo === "semana" ? `/api/webhooks/resumen?tipo=semana&pdf=1&organizacion=${o.id}` : null,
    });
  }
  return NextResponse.json({ tipo, desde: rango.desde, hasta: rango.hasta, resumenes: salida });
}
