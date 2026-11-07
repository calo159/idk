import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { formatoFechaHora } from "@/lib/fechas";
import { puede, puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cupoDisponible } from "@/lib/validaciones/clientes";
import { zUuid } from "@/lib/validaciones/comunes";
import { FormAbono, FormCliente } from "../formularios";

export const metadata: Metadata = { title: "Cliente" };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requerirContexto();
  const { id } = await params;
  if (!zUuid.safeParse(id).success) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: cliente }, { data: abonos }, { data: fiados }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", id).eq("organizacion_id", ctx.organizacionId).maybeSingle(),
    supabase
      .from("abonos_cliente")
      .select("id, monto, metodo, creado_en")
      .eq("cliente_id", id)
      .order("creado_en", { ascending: false })
      .limit(30),
    supabase
      .from("ventas")
      .select("id, numero, total, creado_en, estado")
      .eq("cliente_id", id)
      .eq("estado", "confirmado")
      .order("creado_en", { ascending: false })
      .limit(30),
  ]);
  if (!cliente) notFound();

  return (
    <section className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <Link href="/clientes" className="text-sm text-muted-foreground underline">
        ← Clientes
      </Link>
      <h1 className="text-xl font-semibold">{cliente.nombre}</h1>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Debe</p>
          <p className="text-lg font-semibold tabular-nums">{formatoCOP(cliente.saldo)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Cupo disponible</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatoCOP(cupoDisponible(cliente.cupo_credito, cliente.saldo))}
          </p>
        </div>
      </div>

      {puede(ctx.rol, "abonos.registrar") ? (
        <FormAbono clienteId={cliente.id} saldo={Number(cliente.saldo)} />
      ) : null}

      <div className="space-y-2">
        <h2 className="font-medium">Abonos</h2>
        {(abonos ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin abonos.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {(abonos ?? []).map((a) => (
              <li key={a.id} className="flex justify-between px-4 py-2.5">
                <span>
                  {formatoFechaHora(a.creado_en)} · {a.metodo}
                </span>
                <span className="font-medium tabular-nums">{formatoCOP(a.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Compras recientes</h2>
        {(fiados ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin compras registradas.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {(fiados ?? []).map((v) => (
              <li key={v.id} className="flex justify-between px-4 py-2.5">
                <span>
                  #{v.numero} · {formatoFechaHora(v.creado_en)}
                </span>
                <span className="font-medium tabular-nums">{formatoCOP(v.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {puedeEscribir(ctx.rol, "clientes") ? (
        <div className="space-y-3">
          <h2 className="font-medium">Datos del cliente</h2>
          <FormCliente cliente={cliente} puedeCupo={puede(ctx.rol, "clientes.cupo")} />
        </div>
      ) : null}
    </section>
  );
}
