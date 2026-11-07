"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { abonarSeparado, cancelarSeparado, entregarSeparado } from "./acciones";

const METODOS = ["efectivo", "nequi", "daviplata", "transferencia", "tarjeta"] as const;

export function PanelSeparado({ id, falta, puedeCancelar }: { id: string; falta: number; puedeCancelar: boolean }) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]>("efectivo");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const informar = (ok: boolean, texto: string) => setMensaje({ ok, texto });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Input aria-label="Monto" inputMode="decimal" placeholder="Monto $" value={monto} onChange={(e) => setMonto(e.target.value)} className="h-10" />
        <select aria-label="Método" value={metodo} onChange={(e) => setMetodo(e.target.value as (typeof METODOS)[number])} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
          {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <Button size="sm" className="h-10" disabled={pendiente} onClick={() =>
          iniciar(async () => {
            const r = await abonarSeparado({ separado_id: id, monto: leerNumeroCO(monto)?.toNumber() ?? 0, metodo });
            informar(r.ok, r.ok ? "Abono registrado" : r.error);
            if (r.ok) setMonto("");
          })}>
          Abonar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pendiente} onClick={() => {
          if (!window.confirm(`Entregar el pedido y cobrar ${formatoCOP(falta)} ahora (${metodo})?`)) return;
          iniciar(async () => {
            const r = await entregarSeparado({ separado_id: id, pagos: falta > 0 ? [{ metodo, monto: falta }] : [] });
            informar(r.ok, r.ok ? "Pedido entregado: se registró la venta." : r.error);
          });
        }}>
          Entregar y cobrar lo que falta
        </Button>
        {puedeCancelar ? (
          <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => {
            const motivo = window.prompt("¿Por qué se cancela? Se devolverán los abonos.");
            if (!motivo) return;
            iniciar(async () => {
              const r = await cancelarSeparado({ separado_id: id, motivo });
              informar(r.ok, r.ok ? "Separado cancelado" : r.error);
            });
          }}>
            Cancelar
          </Button>
        ) : null}
      </div>
      {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-xs ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
    </div>
  );
}
