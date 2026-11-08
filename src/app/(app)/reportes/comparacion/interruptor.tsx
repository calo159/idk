"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cambiarCompartir } from "./acciones";

export function InterruptorCompartir({ activo, puedeCambiar }: { activo: boolean; puedeCambiar: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (!puedeCambiar) return <p className="text-xs text-muted-foreground">Solo el dueño puede activar o desactivar la comparación.</p>;
  return (
    <div className="space-y-2">
      <Button
        className="h-11 w-full"
        variant={activo ? "outline" : "default"}
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            const r = await cambiarCompartir(!activo);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pendiente ? "Guardando…" : activo ? "Dejar de compartir y salir del grupo" : "Compartir mis cifras y ver la comparación"}
      </Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
