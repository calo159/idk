"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leerNumeroCO } from "@/lib/dinero";
import { pagarProveedor } from "../ordenes/acciones";

export function FormPagoProveedor({ cxpId, saldo }: { cxpId: string; saldo: number }) {
  const [monto, setMonto] = useState(String(saldo));
  const [metodo, setMetodo] = useState("transferencia");
  const [ref, setRef] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Input aria-label="Monto a pagar" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className="h-10" />
        <select aria-label="Método de pago" value={metodo} onChange={(e) => setMetodo(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
          <option value="otro">Otro</option>
        </select>
        <Input aria-label="Referencia" placeholder="Referencia" value={ref} onChange={(e) => setRef(e.target.value)} className="h-10" />
      </div>
      <Button size="sm" disabled={pendiente} onClick={() =>
        iniciar(async () => {
          const r = await pagarProveedor({ cxp_id: cxpId, monto: leerNumeroCO(monto)?.toNumber() ?? 0, metodo, referencia: ref });
          setMensaje({ ok: r.ok, texto: r.ok ? "Pago registrado" : r.error });
        })}>
        {pendiente ? "Registrando…" : "Registrar pago"}
      </Button>
      {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-xs ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
    </div>
  );
}
