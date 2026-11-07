import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Rol } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export interface Contexto {
  usuarioId: string;
  correo: string;
  nombre: string;
  rol: Rol;
  organizacionId: string;
  negocio: string;
  nicho: string;
  bodegaId: string | null;
}

/**
 * Quién es el usuario y a qué negocio pertenece. Se consulta una vez por petición.
 * Devuelve `sinNegocio` si inició sesión pero aún no tiene negocio (registro a medias o invitación pendiente).
 */
export const obtenerSesion = cache(async () => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { estado: "anonimo" as const };

  const { data: m } = await supabase
    .from("miembros")
    .select("rol, nombre, organizacion_id, organizaciones(nombre, nicho)")
    .eq("usuario_id", user.id)
    .eq("activo", true)
    .order("creado_en", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!m) return { estado: "sinNegocio" as const, usuarioId: user.id, correo: user.email ?? "" };

  const { data: bodega } = await supabase
    .from("bodegas")
    .select("id")
    .eq("organizacion_id", m.organizacion_id)
    .eq("es_principal", true)
    .maybeSingle();

  const org = Array.isArray(m.organizaciones) ? m.organizaciones[0] : m.organizaciones;
  const contexto: Contexto = {
    usuarioId: user.id,
    correo: user.email ?? "",
    nombre: m.nombre,
    rol: m.rol,
    organizacionId: m.organizacion_id,
    negocio: org?.nombre ?? "Mi negocio",
    nicho: org?.nicho ?? "general",
    bodegaId: bodega?.id ?? null,
  };
  return { estado: "listo" as const, contexto };
});

/** Para páginas y acciones protegidas: redirige si falta sesión o negocio. */
export async function requerirContexto(): Promise<Contexto> {
  const s = await obtenerSesion();
  if (s.estado === "anonimo") redirect("/login");
  if (s.estado === "sinNegocio") redirect("/bienvenida");
  return s.contexto;
}
