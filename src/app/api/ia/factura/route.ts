import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos";
import { emparejarLineas } from "@/lib/validaciones/ia";
import { ErrorIA, type TipoImagen, leerFactura } from "@/server/ia/factura";

export const maxDuration = 60;

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_POR_HORA = 60;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

/**
 * POST multipart con `foto`. Lee la factura con IA, empareja con el catálogo y guarda el resultado
 * en `documentos_ia` como PENDIENTE DE REVISIÓN. No crea ninguna compra: la persona confirma.
 */
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (sesion.estado !== "listo") return error("Inicia sesión para continuar", 401);
  const ctx = sesion.contexto;
  if (!puede(ctx.rol, "compras.confirmar")) return error("No tienes permiso para registrar compras", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error("Solicitud inválida", 400);
  }
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return error("Falta la foto de la factura", 400);
  const extension = TIPOS[foto.type];
  if (!extension) return error("La foto debe ser JPG, PNG o WebP", 415);
  if (foto.size > MAX_BYTES) return error("La foto no puede pesar más de 8 MB", 413);

  const supabase = await crearClienteServidor();

  // Límite por negocio: la IA cuesta plata.
  const desde = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supabase
    .from("documentos_ia")
    .select("id", { count: "exact", head: true })
    .eq("organizacion_id", ctx.organizacionId)
    .gte("creado_en", desde);
  if ((count ?? 0) >= MAX_POR_HORA)
    return error("Llegaste al límite de facturas por hora. Intenta más tarde.", 429);

  const bytes = Buffer.from(await foto.arrayBuffer());
  const ruta = `${ctx.organizacionId}/${crypto.randomUUID()}.${extension}`;
  const { error: errSubida } = await supabase.storage
    .from("documentos-ia")
    .upload(ruta, bytes, { contentType: foto.type });
  if (errSubida) return error("No pudimos guardar la foto", 500);

  let factura;
  try {
    factura = await leerFactura({ base64: bytes.toString("base64"), tipo: foto.type as TipoImagen });
  } catch (e) {
    if (e instanceof ErrorIA) return error(e.message, e.codigo === "sin_configurar" ? 503 : 502);
    return error("No pudimos leer la factura", 500);
  }

  const [{ data: catalogo }, { data: proveedores }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, codigo_barras, sku")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("activo", true)
      .limit(5000),
    supabase.from("proveedores").select("id, nombre, nit").eq("organizacion_id", ctx.organizacionId),
  ]);

  const lineas = emparejarLineas(factura.lineas, catalogo ?? []);
  const nitLimpio = factura.nit?.replace(/\D/g, "");
  const proveedor =
    (nitLimpio && (proveedores ?? []).find((p) => p.nit?.replace(/\D/g, "") === nitLimpio)) ||
    (factura.proveedor &&
      (proveedores ?? []).find((p) => p.nombre.toLowerCase() === factura.proveedor!.toLowerCase())) ||
    null;

  const resultado = { ...factura, lineas, proveedor_id: proveedor?.id ?? null };
  const { data: doc, error: errDoc } = await supabase
    .from("documentos_ia")
    .insert({
      organizacion_id: ctx.organizacionId,
      tipo: "factura",
      archivo_url: ruta,
      resultado: resultado as unknown as Json,
      confianza: factura.confianza,
      estado: "pendiente_revision",
      usuario_id: ctx.usuarioId,
    })
    .select("id")
    .single();
  if (errDoc || !doc) return error("No pudimos guardar el resultado", 500);

  return NextResponse.json({ documentoId: doc.id, ...resultado });
}
