import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { entornoPublico } from "@/lib/env";
import type { Database } from "./tipos";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Actúa COMO EL USUARIO que inició sesión (cookies), por lo que RLS siempre aplica.
 */
export async function crearClienteServidor() {
  const env = entornoPublico();
  const almacen = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            for (const { name, value, options } of lista) almacen.set(name, value, options);
          } catch {
            // Desde un Server Component no se pueden escribir cookies; el proxy ya refresca la sesión.
          }
        },
      },
    },
  );
}

export type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>;
