"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { anularCompra, confirmarCompra } from "../acciones";

export function BotonConfirmarCompra({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        className="h-12 w-full"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await confirmarCompra(id);
            setError(r.ok ? null : r.error);
          })
        }
      >
        {pendiente ? "Confirmando…" : "Confirmar compra"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormAnularCompra({ id }: { id: string }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2 rounded-xl border border-destructive/40 p-4">
      <h2 className="font-medium">Anular compra</h2>
      <p className="text-xs text-muted-foreground">
        Saca la mercancía del inventario con un movimiento contrario y queda en auditoría.
      </p>
      <Input
        aria-label="Motivo de la anulación"
        placeholder="Motivo (obligatorio)"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="h-11"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        variant="destructive"
        className="h-11 w-full"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm("¿Seguro que quieres anular esta compra?")) return;
          iniciar(async () => {
            const r = await anularCompra(id, motivo);
            setError(r.ok ? null : (r.campos?.motivo ?? r.error));
          });
        }}
      >
        {pendiente ? "Anulando…" : "Anular compra"}
      </Button>
    </div>
  );
}
