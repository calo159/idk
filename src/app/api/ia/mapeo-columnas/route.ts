import { NextResponse } from "next/server";
import { z } from "zod";
import { obtenerSesion } from "@/lib/auth/contexto";
import { puedeEscribir } from "@/lib/permisos";
import { proponerMapeo } from "@/server/ia/mapeo";

const celda = z.string().max(80);
const esquemaEntrada = z.object({
  encabezados: z.array(celda).min(1).max(60),
  muestra: z.array(z.array(celda).max(60)).max(8),
});

/** POST JSON { encabezados, muestra } → { mapeo, origen }. Solo se envían encabezados y 8 filas, nunca el archivo. */
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (sesion.estado !== "listo") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (!puedeEscribir(sesion.contexto.rol, "productos"))
    return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
  const entrada = esquemaEntrada.safeParse(await req.json().catch(() => null));
  if (!entrada.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  return NextResponse.json(await proponerMapeo(entrada.data));
}
