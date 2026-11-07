import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { entornoPublico } from "@/lib/env";
import type { Database } from "./tipos";

/**
 * Se llama desde proxy.ts: refresca la sesión de Supabase en cada petición y devuelve la respuesta
 * (con las cookies renovadas) junto con el usuario. Es una comprobación optimista para redirigir;
 * la autorización real se repite en cada Server Action / Route Handler y en RLS.
 */
export async function actualizarSesion(request: NextRequest) {
  const env = entornoPublico();
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          for (const { name, value } of lista) request.cookies.set(name, value);
          respuesta = NextResponse.next({ request });
          for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  return { respuesta: () => respuesta, usuarioId: data?.claims?.sub ?? null };
}
