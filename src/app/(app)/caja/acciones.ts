"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { esquemaApertura, esquemaCierre, totalConteo } from "@/lib/caja";
import { paraBd } from "@/lib/dinero";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;

export async function abrirTurno(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "turnos_caja")) return fallo("Tu rol no maneja caja");
  const r = esquemaApertura.safeParse({ base_inicial: String(f.get("base_inicial") ?? "") });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  // Bodega donde se vende: la elegida (si es del negocio y está activa) o la principal.
  const pedida = String(f.get("bodega_id") ?? "");
  let bodegaId = ctx.bodegaId;
  if (pedida) {
    const { data: b } = await supabase
      .from("bodegas")
      .select("id")
      .eq("id", pedida)
      .eq("organizacion_id", ctx.organizacionId)
      .eq("activa", true)
      .maybeSingle();
    if (!b) return fallo("Esa bodega no está disponible");
    bodegaId = b.id;
  }
  if (!bodegaId) return fallo("Tu negocio no tiene una bodega principal");

  const { data: abierto } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("usuario_id", ctx.usuarioId)
    .eq("estado", "abierto")
    .maybeSingle();
  if (abierto) return fallo("Ya tienes una caja abierta");

  const { error } = await supabase.from("turnos_caja").insert({
    organizacion_id: ctx.organizacionId,
    bodega_id: bodegaId,
    usuario_id: ctx.usuarioId,
    base_inicial: numericoBd(paraBd(r.data.base_inicial)),
  });
  if (error) return fallo("No pudimos abrir la caja");
  revalidatePath("/caja");
  revalidatePath("/ventas/pos");
  return ok(undefined);
}

export interface ResultadoCierre {
  esperado: string;
  contado: string;
  diferencia: string;
}

/** Cierra el turno con el conteo por denominaciones. El efectivo esperado lo calcula SQL, no el navegador. */
export async function cerrarTurno(entrada: unknown): Promise<ResultadoAccion<ResultadoCierre>> {
  const ctx = await requerirContexto();
  const r = esquemaCierre.safeParse(entrada);
  if (!r.success) return fallo("Revisa el conteo", erroresPorCampo(r.error));
  const contado = totalConteo(r.data.conteo);
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cerrar_turno", {
    p_turno: r.data.turno_id,
    p_contado: numericoBd(paraBd(contado)),
    p_denominaciones: r.data.conteo,
  });
  if (error) {
    return fallo(
      /no est[aá] abierto/i.test(error.message)
        ? "Este turno ya estaba cerrado"
        : /sin permiso/i.test(error.message)
          ? "No puedes cerrar el turno de otra persona"
          : "No pudimos cerrar la caja",
    );
  }
  const { data: t } = await supabase
    .from("turnos_caja")
    .select("efectivo_esperado, efectivo_contado, diferencia")
    .eq("id", r.data.turno_id)
    .eq("organizacion_id", ctx.organizacionId)
    .single();
  revalidatePath("/caja");
  revalidatePath("/ventas/pos");
  return ok({
    esperado: String(t?.efectivo_esperado ?? "0"),
    contado: paraBd(contado),
    diferencia: String(t?.diferencia ?? "0"),
  });
}
