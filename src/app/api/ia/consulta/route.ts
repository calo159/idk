import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { obtenerSesion } from "@/lib/auth/contexto";
import { entornoServidor, requerirServidor } from "@/lib/env";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type LlamarModelo, responderConIA, responderPorReglas } from "@/server/asistente/asistente";
import { crearRepoAsistente } from "@/server/asistente/repo";

export const dynamic = "force-dynamic";

const esquemaEntrada = z.object({
  pregunta: z.string().trim().min(2, "Escribe tu pregunta").max(500, "La pregunta es muy larga"),
  historial: z.array(z.object({ rol: z.enum(["usuario", "asistente"]), texto: z.string().max(1000) })).max(6).default([]),
});

// Tope por usuario para cuidar el costo de la IA (por instancia del servidor; es una barrera simple, no un contador exacto).
const VENTANA_MS = 10 * 60_000;
const MAX_PREGUNTAS = 20;
const usos = new Map<string, number[]>();
function excedeLimite(usuario: string, ahora = Date.now()): boolean {
  const recientes = (usos.get(usuario) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= MAX_PREGUNTAS) {
    usos.set(usuario, recientes);
    return true;
  }
  usos.set(usuario, [...recientes, ahora]);
  return false;
}

const modeloReal: LlamarModelo = async ({ system, messages, tools }) => {
  const cliente = new Anthropic({ apiKey: requerirServidor("ANTHROPIC_API_KEY") });
  return cliente.messages.create({ model: requerirServidor("ANTHROPIC_MODEL"), max_tokens: 900, system, messages, tools });
};

/** POST { pregunta, historial? } → { respuesta, origen }. Solo lectura, con la sesión del usuario (RLS y roles). */
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (sesion.estado !== "listo") return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  const ctx = sesion.contexto;
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador")
    return NextResponse.json({ error: "Tu rol no tiene acceso a los reportes del negocio" }, { status: 403 });
  const entrada = esquemaEntrada.safeParse(await req.json().catch(() => null));
  if (!entrada.success) return NextResponse.json({ error: entrada.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  if (excedeLimite(ctx.usuarioId)) return NextResponse.json({ error: "Hiciste muchas preguntas seguidas. Espera unos minutos." }, { status: 429 });

  const repo = crearRepoAsistente(await crearClienteServidor(), ctx.organizacionId);
  if (!entornoServidor().ANTHROPIC_API_KEY) return NextResponse.json({ respuesta: await responderPorReglas(repo, entrada.data.pregunta), origen: "reglas" });
  try {
    const respuesta = await responderConIA(modeloReal, repo, ctx.negocio, entrada.data.pregunta, entrada.data.historial);
    return NextResponse.json({ respuesta, origen: "ia" });
  } catch {
    // Si la IA falla, las reglas siguen respondiendo lo básico.
    return NextResponse.json({ respuesta: await responderPorReglas(repo, entrada.data.pregunta), origen: "reglas" });
  }
}
