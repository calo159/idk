import { createClient } from "@supabase/supabase-js";
import { entornoPublico } from "@/lib/env";
import type { Database } from "./tipos";

/**
 * Cliente de Supabase SIN sesión (rol anon) para páginas públicas como el catálogo.
 * No lee cookies, así las páginas pueden cachearse. Solo puede llamar funciones que se hayan abierto a `anon`.
 */
export function crearClientePublico() {
  const env = entornoPublico();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
