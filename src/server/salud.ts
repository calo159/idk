import type { SupabaseClient } from "@supabase/supabase-js";
import { type Salud, calcularSalud, esquemaRespuestaSalud, tendencia } from "@/lib/salud";
import type { Database } from "@/lib/supabase/tipos";

export interface ResultadoSalud {
  salud: Salud;
  /** Puntos ganados o perdidos frente a hace ~30 días (null si aún no hay foto de entonces). */
  cambio: number | null;
  desde: string;
  hasta: string;
}

/** Consulta las medidas (con la sesión del usuario: solo dueño, admin y contador) y calcula el puntaje. */
export async function cargarSalud(supabase: SupabaseClient<Database>, org: string): Promise<ResultadoSalud | null> {
  const { data, error } = await supabase.rpc("metricas_salud", { p_org: org });
  const r = esquemaRespuestaSalud.safeParse(data);
  if (error || !r.success) return null;
  const salud = calcularSalud(r.data.actual);
  const antes = r.data.anterior ? calcularSalud(r.data.anterior.metricas) : null;
  return { salud, cambio: tendencia(salud, antes), desde: r.data.actual.desde, hasta: r.data.actual.hasta };
}
