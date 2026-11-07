import { createBrowserClient } from "@supabase/ssr";
import { entornoPublico } from "@/lib/env";
import type { Database } from "./tipos";

/** Cliente de Supabase para el NAVEGADOR (usa la llave anónima; la seguridad la da RLS). */
export function crearClienteNavegador() {
  const env = entornoPublico();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
