import type { Metadata } from "next";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoDiaLargo, hoyBogota } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { RutaDelDia } from "./ruta";

export const metadata: Metadata = { title: "Mi ruta" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol === "bodeguero" || ctx.rol === "contador")
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Tu rol no tiene ruta de visitas.</p>;
  const supabase = await crearClienteServidor();
  const hoy = hoyBogota();
  const { data } = await supabase.rpc("ruta_del_dia", { p_org: ctx.organizacionId, p_fecha: hoy });
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">Mi ruta de hoy</h1>
        <p className="text-sm text-muted-foreground">{formatoDiaLargo(new Date())}</p>
      </header>
      <RutaDelDia
        fecha={hoy}
        paradas={(data ?? []).map((r) => ({
          clienteId: r.cliente_id,
          nombre: r.nombre,
          telefono: r.telefono,
          direccion: r.direccion,
          saldo: Number(r.saldo),
          vencido: Number(r.vencido),
          diasMora: r.dias_mora,
          visitado: r.visitado,
          resultado: r.resultado,
          ultimaVisita: r.ultima_visita,
          ultimaCompra: r.ultima_compra,
        }))}
      />
    </section>
  );
}
