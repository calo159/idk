"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { paraBd } from "@/lib/dinero";
import { puede, puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaAbono, esquemaCliente } from "@/lib/validaciones/clientes";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;

export async function guardarCliente(
  _prev: ResultadoAccion | null,
  f: FormData,
): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "clientes")) return fallo("No tienes permiso para editar clientes");
  const r = esquemaCliente.safeParse({
    nombre: String(f.get("nombre") ?? ""),
    documento: String(f.get("documento") ?? ""),
    telefono: String(f.get("telefono") ?? ""),
    direccion: String(f.get("direccion") ?? ""),
    fecha_nacimiento: String(f.get("fecha_nacimiento") ?? ""),
    cupo_credito: String(f.get("cupo_credito") ?? ""),
    acepta_mensajes: f.get("acepta_mensajes") === "on",
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  // El cupo solo lo define quien administra el negocio.
  const puedeCupo = puede(ctx.rol, "clientes.cupo");
  const fila = {
    nombre: r.data.nombre,
    documento: r.data.documento ?? null,
    telefono: r.data.telefono ?? null,
    direccion: r.data.direccion ?? null,
    fecha_nacimiento: r.data.fecha_nacimiento ?? null,
    acepta_mensajes: r.data.acepta_mensajes,
    ...(puedeCupo ? { cupo_credito: numericoBd(paraBd(r.data.cupo_credito)) } : {}),
  };
  const supabase = await crearClienteServidor();
  const idCrudo = String(f.get("id") ?? "");
  let destino: string;
  if (idCrudo) {
    const id = zUuid.safeParse(idCrudo);
    if (!id.success) return fallo("Cliente inválido");
    const { error } = await supabase
      .from("clientes")
      .update(fila)
      .eq("id", id.data)
      .eq("organizacion_id", ctx.organizacionId);
    if (error) return fallo(mensajeCliente(error.message));
    destino = `/clientes/${id.data}`;
  } else {
    const { data, error } = await supabase
      .from("clientes")
      .insert({ ...fila, organizacion_id: ctx.organizacionId })
      .select("id")
      .single();
    if (error || !data) return fallo(mensajeCliente(error?.message ?? ""));
    destino = `/clientes/${data.id}`;
  }
  revalidatePath("/clientes");
  redirect(destino);
}

function mensajeCliente(m: string): string {
  if (m.includes("clientes_organizacion_id_telefono_key")) return "Ya tienes un cliente con ese celular";
  return "No pudimos guardar el cliente";
}

export async function registrarAbono(
  _prev: ResultadoAccion | null,
  f: FormData,
): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "abonos.registrar")) return fallo("No tienes permiso para registrar abonos");
  const r = esquemaAbono.safeParse({
    cliente_id: String(f.get("cliente_id") ?? ""),
    monto: String(f.get("monto") ?? ""),
    metodo: String(f.get("metodo") ?? ""),
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));

  const supabase = await crearClienteServidor();
  // Si el abono es en efectivo, entra a la caja del turno abierto del usuario.
  let turnoId: string | null = null;
  if (r.data.metodo === "efectivo") {
    const { data: turno } = await supabase
      .from("turnos_caja")
      .select("id")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("usuario_id", ctx.usuarioId)
      .eq("estado", "abierto")
      .maybeSingle();
    turnoId = turno?.id ?? null;
  }
  const { error } = await supabase.rpc("registrar_abono", {
    p_cliente: r.data.cliente_id,
    p_monto: numericoBd(paraBd(r.data.monto)),
    p_metodo: r.data.metodo,
    p_turno: turnoId ?? undefined,
  });
  if (error) {
    return fallo(error.message.includes("supera la deuda") ? "El abono supera lo que debe el cliente" : "No pudimos registrar el abono");
  }
  revalidatePath(`/clientes/${r.data.cliente_id}`);
  revalidatePath("/clientes");
  return ok(undefined);
}
