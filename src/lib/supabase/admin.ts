import "server-only";
import { createClient } from "@supabase/supabase-js";
import { entornoPublico, requerirServidor } from "@/lib/env";
import type { Database } from "./tipos";

/**
 * Cliente con SERVICE ROLE: se salta RLS. Solo para tareas de servidor que no tienen un usuario
 * (webhooks firmados de n8n, jobs, seed). `server-only` impide que se importe desde el navegador.
 *
 * Regla: cualquier consulta hecha con este cliente DEBE filtrar por organizacion_id a mano.
 */
export function crearClienteAdmin() {
  const env = entornoPublico();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    requerirServidor("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
