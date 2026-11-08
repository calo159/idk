import { NextResponse } from "next/server";
import { entornoServidor } from "@/lib/env";
import { tokenValido } from "@/lib/firma";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { procesarCola } from "@/server/facturacion/procesar";
import { PROVEEDORES } from "@/server/facturacion/proveedores";

export const dynamic = "force-dynamic";

/** POST (n8n, cada pocos minutos): envía las facturas electrónicas pendientes a su proveedor. Solo token: no recibe datos. */
export async function POST(req: Request) {
  const { SURTIX_API_TOKEN } = entornoServidor();
  if (!SURTIX_API_TOKEN) return NextResponse.json({ error: "El token de n8n no está configurado" }, { status: 503 });
  if (!tokenValido(req.headers.get("authorization"), SURTIX_API_TOKEN)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await procesarCola(crearClienteAdmin(), PROVEEDORES, 20)) });
  } catch {
    return NextResponse.json({ error: "No se pudo procesar la cola de facturas" }, { status: 500 });
  }
}
