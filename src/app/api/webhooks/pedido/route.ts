import { NextResponse } from "next/server";
import { z } from "zod";
import { entornoServidor } from "@/lib/env";
import { tokenValido, verificarFirma } from "@/lib/firma";
import { destinoWhatsApp } from "@/lib/mensajes-eventos";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/tipos";
import { emparejarItems, mensajeRecepcionPedido } from "@/server/pedidos/extraer";
import { extraerPedido } from "@/server/pedidos/ia";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const cuerpoEsquema = z.object({
  /** ID del número de WhatsApp Business que recibió el mensaje (identifica al negocio). */
  phone_number_id: z.string().min(3).max(40),
  telefono: z.string().min(7).max(25),
  texto: z.string().max(2000),
  mensaje_id: z.string().min(3).max(200),
});

/**
 * POST (n8n, mensaje entrante de un CLIENTE). Token + firma HMAC.
 * Convierte el mensaje en un pedido PENDIENTE (no crea ninguna venta) y devuelve la respuesta automática para el cliente.
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
  const destino = destinoWhatsApp(c.data.telefono);
  if (!destino) return NextResponse.json({ respuesta: null, motivo: "telefono_invalido" });

  const admin = crearClienteAdmin();
  const { data: orgs } = await admin.rpc("org_por_numero_whatsapp", { p_phone_number_id: c.data.phone_number_id });
  const org = orgs?.[0];
  if (!org) return NextResponse.json({ respuesta: null, motivo: "negocio_no_encontrado" });

  const items = await extraerPedido(c.data.texto);
  if (items.length === 0)
    return NextResponse.json({
      respuesta: `Hola, de *${org.organizacion}*. No logré entender tu pedido 🤔 Escríbelo así, por ejemplo: «2 cemento gris, 10 metros de cable #12».`,
      destino,
    });

  const { data: productos } = await admin
    .from("productos")
    .select("id, nombre, precio_venta")
    .eq("organizacion_id", org.organizacion_id)
    .eq("activo", true)
    .limit(5000);
  const { lineas, noEncontrados } = emparejarItems(items, (productos ?? []).map((p) => ({ id: p.id, nombre: p.nombre, precio: Number(p.precio_venta) })));

  const { data: reg, error } = await admin.rpc("registrar_pedido_whatsapp", {
    p_org: org.organizacion_id,
    p_mensaje_id: c.data.mensaje_id,
    p_telefono: c.data.telefono,
    p_texto: c.data.texto,
    p_lineas: lineas as unknown as Json,
    p_no_encontrados: noEncontrados as unknown as Json,
  });
  if (error) return NextResponse.json({ error: "No se pudo registrar el pedido" }, { status: 500 });
  // Mensaje repetido: ya se respondió la primera vez.
  if (reg?.[0] && reg[0].nuevo === false) return NextResponse.json({ respuesta: null, motivo: "mensaje_repetido" });
  return NextResponse.json({ respuesta: mensajeRecepcionPedido(org.organizacion, lineas, noEncontrados), destino });
}
