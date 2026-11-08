"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatoCOP } from "@/lib/dinero";
import { MESES_PERMITIDOS } from "@/lib/suscripcion";
import { iniciarPagoSuscripcion } from "./acciones";

export interface PlanVista {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  usuarios: number | null;
  bodegas: number | null;
}

export function ElegirPlan({ planes, actual }: { planes: PlanVista[]; actual: string }) {
  const [plan, setPlan] = useState(actual);
  const [meses, setMeses] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const elegido = planes.find((p) => p.codigo === plan);

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="sr-only">Plan</legend>
        {planes.map((p) => (
          <label key={p.codigo} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${plan === p.codigo ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" name="plan" className="mt-1 size-4" checked={plan === p.codigo} onChange={() => setPlan(p.codigo)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{p.nombre}{p.codigo === actual ? " · tu plan" : ""}</span>
                <span className="tabular-nums">{formatoCOP(p.precio)}<span className="text-xs text-muted-foreground"> /mes</span></span>
              </span>
              {p.descripcion ? <span className="block text-sm text-muted-foreground">{p.descripcion}</span> : null}
              <span className="block text-xs text-muted-foreground">{p.usuarios ? `Hasta ${p.usuarios} usuarios` : "Usuarios sin límite"} · {p.bodegas ? `${p.bodegas} bodega(s)` : "bodegas sin límite"}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="meses" className="text-sm font-medium">¿Por cuántos meses?</label>
        <select id="meses" value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
          {MESES_PERMITIDOS.map((m) => <option key={m} value={m}>{m} {m === 1 ? "mes" : "meses"}</option>)}
        </select>
      </div>

      {elegido ? (
        <Button
          className="h-12 w-full"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              setError(null);
              const r = await iniciarPagoSuscripcion({ plan, meses });
              if (!r.ok) return setError(r.error);
              window.location.href = r.datos.url;
            })
          }
        >
          {pendiente ? "Abriendo el pago…" : `Pagar ${formatoCOP(elegido.precio * meses)}`}
        </Button>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">El pago es seguro y lo procesa Wompi (tarjeta, PSE, Nequi). Tu suscripción se activa en segundos.</p>
    </div>
  );
}

/** Cuando la persona vuelve de Wompi, el aviso del pago puede tardar unos segundos: se consulta de nuevo sola. */
export function ConfirmandoPago() {
  const router = useRouter();
  const [intentos, setIntentos] = useState(0);
  useEffect(() => {
    if (intentos >= 10) return;
    const id = setTimeout(() => {
      router.refresh();
      setIntentos((n) => n + 1);
    }, 4000);
    return () => clearTimeout(id);
  }, [intentos, router]);
  return (
    <p role="status" className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
      {intentos < 10 ? "Estamos confirmando tu pago… esta página se actualiza sola." : "Tu pago aún no aparece. Si ya te cobraron, escríbenos con tu comprobante y lo activamos."}
    </p>
  );
}
