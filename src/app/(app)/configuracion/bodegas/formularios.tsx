"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activarBodega, crearBodega } from "../../inventario/traslados/acciones";

export function FormBodega() {
  const [estado, accion, pendiente] = useActionState(crearBodega, null);
  return (
    <form action={accion} className="space-y-2 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Nueva bodega</h2>
      <Input name="nombre" aria-label="Nombre de la bodega" placeholder="Ej. Depósito, Sede Maicao" className="h-11" />
      {estado && !estado.ok ? <p role="alert" className="text-sm text-destructive">{estado.campos?.nombre ?? estado.error}</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Creando…" : "Crear bodega"}</Button>
    </form>
  );
}

export function BotonActivarBodega({ id, activa }: { id: string; activa: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <Button variant="outline" size="sm" disabled={pendiente} onClick={() => iniciar(async () => { const r = await activarBodega(id, !activa); setError(r.ok ? null : r.error); })}>
        {activa ? "Desactivar" : "Activar"}
      </Button>
      {error ? <span className="block text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
