"use server";

import { redirect } from "next/navigation";
import { entornoPublico } from "@/lib/env";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import {
  esquemaLogin,
  esquemaNuevoNegocio,
  esquemaRecuperar,
  esquemaRegistro,
  mensajeAuth,
  rutaSegura,
} from "@/lib/validaciones/auth";
import { erroresPorCampo } from "@/lib/validaciones/comunes";

export interface EstadoForm {
  error?: string;
  campos?: Record<string, string>;
  mensaje?: string;
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");

/** El código de referido nunca debe frenar el registro: si no sirve, el negocio se crea igual (y se puede escribir luego). */
async function aplicarReferido(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, org: string | null, codigo: string | undefined) {
  if (!org || !codigo) return;
  try {
    await supabase.rpc("aplicar_codigo_referido", { p_org: org, p_codigo: codigo });
  } catch {
    // Sin consecuencias: la persona puede usar el código desde «Referidos».
  }
}

export async function iniciarSesion(_prev: EstadoForm, f: FormData): Promise<EstadoForm> {
  const r = esquemaLogin.safeParse({
    correo: texto(f, "correo"),
    contrasena: texto(f, "contrasena"),
  });
  if (!r.success) return { campos: erroresPorCampo(r.error) };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: r.data.correo,
    password: r.data.contrasena,
  });
  if (error) return { error: mensajeAuth(error.message) };
  redirect(rutaSegura(texto(f, "siguiente")));
}

export async function registrarse(_prev: EstadoForm, f: FormData): Promise<EstadoForm> {
  const r = esquemaRegistro.safeParse({
    nombre: texto(f, "nombre"),
    correo: texto(f, "correo"),
    contrasena: texto(f, "contrasena"),
    negocio: texto(f, "negocio"),
    nicho: texto(f, "nicho"),
    referido: texto(f, "referido"),
  });
  if (!r.success) return { campos: erroresPorCampo(r.error) };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: r.data.correo,
    password: r.data.contrasena,
    options: {
      // El código viaja con la cuenta: si hay que confirmar el correo, se usa al crear el negocio.
      data: { nombre: r.data.nombre, ...(r.data.referido ? { ref: r.data.referido } : {}) },
      emailRedirectTo: `${entornoPublico().NEXT_PUBLIC_APP_URL}/login`,
    },
  });
  if (error) return { error: mensajeAuth(error.message) };

  // Con confirmación de correo activada no hay sesión todavía: el negocio se crea en /bienvenida al entrar.
  if (!data.session) {
    return {
      mensaje:
        "Te enviamos un correo para confirmar tu cuenta. Después inicia sesión para crear tu negocio.",
    };
  }
  const { data: orgId, error: errNegocio } = await supabase.rpc("crear_organizacion", {
    p_nombre: r.data.negocio,
    p_nicho: r.data.nicho,
    p_nombre_dueno: r.data.nombre,
  });
  if (errNegocio) redirect("/bienvenida");
  await aplicarReferido(supabase, orgId, r.data.referido);
  redirect("/dashboard");
}

export async function crearNegocio(_prev: EstadoForm, f: FormData): Promise<EstadoForm> {
  const r = esquemaNuevoNegocio.safeParse({
    nombre: texto(f, "nombre"),
    negocio: texto(f, "negocio"),
    nicho: texto(f, "nicho"),
    referido: texto(f, "referido"),
  });
  if (!r.success) return { campos: erroresPorCampo(r.error) };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: orgId, error } = await supabase.rpc("crear_organizacion", {
    p_nombre: r.data.negocio,
    p_nicho: r.data.nicho,
    p_nombre_dueno: r.data.nombre,
  });
  if (error) return { error: "No pudimos crear el negocio. Intenta de nuevo." };
  const guardado = data.user.user_metadata?.ref;
  await aplicarReferido(supabase, orgId, r.data.referido ?? (typeof guardado === "string" ? guardado : undefined));
  redirect("/dashboard");
}

export async function recuperarContrasena(_prev: EstadoForm, f: FormData): Promise<EstadoForm> {
  const r = esquemaRecuperar.safeParse({ correo: texto(f, "correo") });
  if (!r.success) return { campos: erroresPorCampo(r.error) };
  const supabase = await crearClienteServidor();
  await supabase.auth.resetPasswordForEmail(r.data.correo, {
    redirectTo: `${entornoPublico().NEXT_PUBLIC_APP_URL}/login`,
  });
  // Misma respuesta exista o no el correo (no revelar qué correos están registrados).
  return {
    mensaje: "Si el correo está registrado, te enviamos un enlace para cambiar la contraseña.",
  };
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function aceptarInvitacion(token: string): Promise<EstadoForm> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("aceptar_invitacion", { p_token: token });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
