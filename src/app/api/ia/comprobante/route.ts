import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/auth/contexto";
import { esHashPerceptual } from "@/lib/hash-imagen";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ErrorIA, type TipoImagen } from "@/server/ia/factura";
import { leerComprobante } from "@/server/ia/comprobante";

export const maxDuration = 60;

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_POR_HORA = 200;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

/** "f0f0…" (16 hex) → "1111 0000…" (64 bits) para la columna bit(64). */
const hexABits = (hex: string) =>
  hex
    .split("")
    .map((c) => parseInt(c, 16).toString(2).padStart(4, "0"))
    .join("");

/**
 * POST multipart: `foto` y, opcional, `hash_perceptual` (dHash calculado en el navegador).
 * Lee el comprobante con IA y lo guarda. La verificación (repetido, monto, fecha) se hace al cobrar,
 * en SQL, con `verificar_comprobante`.
 */
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (sesion.estado !== "listo") return error("Inicia sesión para continuar", 401);
  const ctx = sesion.contexto;
  if (!puede(ctx.rol, "ventas.confirmar")) return error("No tienes permiso", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error("Solicitud inválida", 400);
  }
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return error("Falta la foto del comprobante", 400);
  const extension = TIPOS[foto.type];
  if (!extension) return error("La foto debe ser JPG, PNG o WebP", 415);
  if (foto.size > MAX_BYTES) return error("La foto no puede pesar más de 8 MB", 413);
  const hashCliente = String(form.get("hash_perceptual") ?? "");
  const hashPerceptual = esHashPerceptual(hashCliente) ? hashCliente : null;

  const supabase = await crearClienteServidor();
  const desde = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supabase
    .from("comprobantes")
    .select("id", { count: "exact", head: true })
    .eq("organizacion_id", ctx.organizacionId)
    .gte("creado_en", desde);
  if ((count ?? 0) >= MAX_POR_HORA) return error("Demasiados comprobantes en la última hora", 429);

  const bytes = Buffer.from(await foto.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const ruta = `${ctx.organizacionId}/comprobantes/${crypto.randomUUID()}.${extension}`;
  const { error: errSubida } = await supabase.storage
    .from("documentos-ia")
    .upload(ruta, bytes, { contentType: foto.type });
  if (errSubida) return error("No pudimos guardar la foto", 500);

  let leido;
  try {
    leido = await leerComprobante({ base64: bytes.toString("base64"), tipo: foto.type as TipoImagen });
  } catch (e) {
    if (e instanceof ErrorIA) return error(e.message, e.codigo === "sin_configurar" ? 503 : 502);
    return error("No pudimos leer el comprobante", 500);
  }
  if (!leido.es_comprobante) return error("La imagen no parece un comprobante de pago", 422);

  const { data: fila, error: errFila } = await supabase
    .from("comprobantes")
    .insert({
      organizacion_id: ctx.organizacionId,
      imagen_url: ruta,
      hash_imagen: sha,
      hash_perceptual: hashPerceptual ? hexABits(hashPerceptual) : null,
      referencia: leido.referencia,
      entidad: leido.entidad,
      monto_leido: leido.monto === null ? null : (String(leido.monto) as unknown as number),
      fecha_leida: leido.fecha,
      nombre_leido: leido.nombre,
      confianza: leido.confianza,
    })
    .select("id")
    .single();
  if (errFila || !fila) return error("No pudimos guardar el comprobante", 500);

  // Aviso inmediato (solo lectura): ¿esta misma imagen o referencia ya existe?
  const filtros = [`hash_imagen.eq.${sha}`, ...(leido.referencia ? [`referencia.eq.${leido.referencia.replace(/[,()]/g, "")}`] : [])];
  const { count: repetidos } = await supabase
    .from("comprobantes")
    .select("id", { count: "exact", head: true })
    .eq("organizacion_id", ctx.organizacionId)
    .neq("id", fila.id)
    .or(filtros.join(","));

  return NextResponse.json({
    comprobanteId: fila.id,
    entidad: leido.entidad,
    monto: leido.monto,
    fecha: leido.fecha,
    referencia: leido.referencia,
    nombre: leido.nombre,
    confianza: leido.confianza,
    posibleDuplicado: (repetidos ?? 0) > 0,
  });
}
