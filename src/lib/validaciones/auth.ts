import { z } from "zod";
import { zCorreo, zNicho, zTexto } from "./comunes";

export const zContrasena = z
  .string({ message: "La contraseña es obligatoria" })
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña es demasiado larga");

export const esquemaLogin = z.object({
  correo: zCorreo,
  contrasena: z.string().min(1, "La contraseña es obligatoria"),
});

export const esquemaRegistro = z.object({
  nombre: zTexto(2, 80, "Tu nombre"),
  correo: zCorreo,
  contrasena: zContrasena,
  negocio: zTexto(2, 80, "El nombre del negocio"),
  nicho: zNicho,
});

export const esquemaNuevoNegocio = z.object({
  nombre: zTexto(2, 80, "Tu nombre"),
  negocio: zTexto(2, 80, "El nombre del negocio"),
  nicho: zNicho,
});

export const esquemaRecuperar = z.object({ correo: zCorreo });

export const esquemaInvitacion = z.object({
  correo: zCorreo,
  nombre: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || undefined),
  rol: z.enum(["admin", "vendedor", "bodeguero", "contador", "ruta"], { message: "Elige un rol" }),
});

export const NICHOS = [
  { valor: "ferreteria", etiqueta: "Ferretería" },
  { valor: "ropa", etiqueta: "Ropa y calzado" },
  { valor: "viveres", etiqueta: "Víveres / mayorista" },
  { valor: "veterinaria", etiqueta: "Veterinaria / agro" },
  { valor: "general", etiqueta: "Otro negocio" },
] as const;

/** Traduce los errores de Supabase Auth a mensajes claros. */
export function mensajeAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ese correo ya está registrado. Inicia sesión.";
  if (m.includes("email not confirmed"))
    return "Confirma tu correo antes de entrar (revisa tu bandeja).";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos. Espera unos minutos.";
  if (m.includes("password"))
    return "La contraseña no cumple los requisitos (mínimo 8 caracteres).";
  return "No pudimos completar la operación. Intenta de nuevo.";
}

/** Solo rutas internas: evita redirecciones abiertas (//evil.com, https://…, \\evil). */
export function rutaSegura(destino: string | null | undefined, porDefecto = "/dashboard"): string {
  if (!destino || !destino.startsWith("/") || destino.startsWith("//") || destino.includes("\\"))
    return porDefecto;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(destino)) return porDefecto;
  return destino;
}
