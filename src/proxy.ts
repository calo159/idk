import { type NextRequest, NextResponse } from "next/server";
import { actualizarSesion } from "@/lib/supabase/sesion-proxy";

const PUBLICAS = ["/login", "/registro", "/recuperar", "/invitacion"];
const esPublica = (ruta: string) => PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`));

/**
 * Comprobación OPTIMISTA de sesión (redirige rápido). No es la barrera de seguridad:
 * cada Server Action / Route Handler vuelve a verificar y, al final, RLS decide qué datos se ven.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  let sesion: Awaited<ReturnType<typeof actualizarSesion>>;
  try {
    sesion = await actualizarSesion(request);
  } catch {
    // Supabase inalcanzable: tratar como sin sesión (las páginas protegidas piden login).
    sesion = { respuesta: () => NextResponse.next({ request }), usuarioId: null };
  }

  if (!sesion.usuarioId && !esPublica(pathname) && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?siguiente=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (sesion.usuarioId && (pathname === "/login" || pathname === "/registro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return sesion.respuesta();
}

export const config = {
  // Todo menos archivos estáticos, el service worker y los webhooks (que se autentican con HMAC).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|icons/|api/webhooks).*)",
  ],
};
