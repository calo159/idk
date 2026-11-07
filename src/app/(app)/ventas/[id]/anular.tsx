"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { anularVenta } from "../acciones";

export function FormAnularVenta({ id }: { id: string }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2 rounded-xl border border-destructive/40 p-4">
      <h2 className="font-medium">Anular venta</h2>
      <p className="text-xs text-muted-foreground">
        Devuelve la mercancía al inventario y la deuda del cliente. No se borra: queda en auditoría con tu nombre.
      </p>
      <Input
        aria-label="Motivo de la anulación"
        placeholder="Motivo (obligatorio)"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="h-11"
      />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button
        variant="destructive"
        className="h-11 w-full"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm("¿Seguro que quieres anular esta venta?")) return;
          iniciar(async () => {
            const r = await anularVenta(id, motivo);
            setError(r.ok ? null : (r.campos?.motivo ?? r.error));
          });
        }}
      >
        {pendiente ? "Anulando…" : "Anular venta"}
      </Button>
    </div>
  );
}
