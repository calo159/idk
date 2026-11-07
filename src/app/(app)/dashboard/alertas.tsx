"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { marcarAlertaLeida } from "./acciones";

export interface AlertaVista {
  id: string;
  mensaje: string;
  severidad: string;
  cuando: string;
}

export function ListaAlertas({ alertas, puedeMarcar }: { alertas: AlertaVista[]; puedeMarcar: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <ul className="divide-y rounded-xl border">
      {alertas.map((a) => (
        <li key={a.id} className="flex items-start gap-3 px-4 py-3 text-sm">
          <span
            aria-hidden
            className={`mt-1 size-2.5 shrink-0 rounded-full ${
              a.severidad === "alta" ? "bg-destructive" : a.severidad === "media" ? "bg-amber-500" : "bg-muted-foreground"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p>{a.mensaje}</p>
            <p className="text-xs text-muted-foreground">{a.cuando}</p>
          </div>
          {puedeMarcar ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pendiente}
              onClick={() => iniciar(async () => void (await marcarAlertaLeida(a.id)))}
            >
              Listo
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
