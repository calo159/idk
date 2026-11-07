import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/auth/contexto";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos";
import { normalizarTexto, similitudNombres } from "@/lib/validaciones/ia";
import { leerCuaderno } from "@/server/ia/cuaderno";
import { ErrorIA, type TipoImagen } from "@/server/ia/factura";

export const maxDuration = 60;

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 8 * 1024 * 1024;
const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

/** POST multipart `foto` → productos y deudas leídos del cuaderno, marcando cuáles ya existen. No crea nada. */
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (sesion.estado !== "listo") return error("Inicia sesión para continuar", 401);
  const ctx = sesion.contexto;
  if (!puedeEscribir(ctx.rol, "productos")) return error("No tienes permiso para cargar productos", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error("Solicitud inválida", 400);
  }
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return error("Falta la foto del cuaderno", 400);
  const extension = TIPOS[foto.type];
  if (!extension) return error("La foto debe ser JPG, PNG o WebP", 415);
  if (foto.size > MAX_BYTES) return error("La foto no puede pesar más de 8 MB", 413);

  const supabase = await crearClienteServidor();
  const desde = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supabase.from("documentos_ia").select("id", { count: "exact", head: true }).eq("organizacion_id", ctx.organizacionId).gte("creado_en", desde);
  if ((count ?? 0) >= 60) return error("Llegaste al límite de lecturas por hora. Intenta más tarde.", 429);

  const bytes = Buffer.from(await foto.arrayBuffer());
  const ruta = `${ctx.organizacionId}/cuadernos/${crypto.randomUUID()}.${extension}`;
  const { error: errSubida } = await supabase.storage.from("documentos-ia").upload(ruta, bytes, { contentType: foto.type });
  if (errSubida) return error("No pudimos guardar la foto", 500);

  let cuaderno;
  try {
    cuaderno = await leerCuaderno({ base64: bytes.toString("base64"), tipo: foto.type as TipoImagen });
  } catch (e) {
    if (e instanceof ErrorIA) return error(e.message, e.codigo === "sin_configurar" ? 503 : 502);
    return error("No pudimos leer el cuaderno", 500);
  }

  const [{ data: productos }, { data: clientes }] = await Promise.all([
    supabase.from("productos").select("nombre").eq("organizacion_id", ctx.organizacionId).limit(20000),
    supabase.from("clientes").select("id, nombre").eq("organizacion_id", ctx.organizacionId).limit(20000),
  ]);
  const existentes = new Set((productos ?? []).map((p) => normalizarTexto(p.nombre)));
  const resultado = {
    productos: cuaderno.productos.map((p) => ({ ...p, yaExiste: existentes.has(normalizarTexto(p.nombre)) })),
    deudas: cuaderno.deudas.map((d) => {
      // Se vincula a un cliente existente solo si el nombre es prácticamente el mismo.
      const mejor = (clientes ?? []).map((c) => ({ c, s: similitudNombres(c.nombre, d.cliente) })).sort((a, b) => b.s - a.s)[0];
      return { ...d, clienteId: mejor && mejor.s >= 0.8 ? mejor.c.id : null, clienteNombre: mejor && mejor.s >= 0.8 ? mejor.c.nombre : null };
    }),
    confianza: cuaderno.confianza,
    advertencias: cuaderno.advertencias,
  };

  const { data: doc, error: errDoc } = await supabase
    .from("documentos_ia")
    .insert({ organizacion_id: ctx.organizacionId, tipo: "cuaderno", archivo_url: ruta, resultado: resultado as unknown as Json, confianza: cuaderno.confianza, estado: "pendiente_revision", usuario_id: ctx.usuarioId })
    .select("id")
    .single();
  if (errDoc || !doc) return error("No pudimos guardar el resultado", 500);
  return NextResponse.json({ documentoId: doc.id, ...resultado });
}
