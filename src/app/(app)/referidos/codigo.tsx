"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usarCodigoReferido } from "./acciones";

/** Para quien se registró sin código y se acordó después (hasta 30 días). */
export function FormCodigoReferido() {
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="space-y-2 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await usarCodigoReferido({ codigo });
          setAviso(r.ok ? { ok: true, texto: "¡Listo! Cuando pagues tu primera suscripción recibes 30 días gratis." } : { ok: false, texto: r.error });
        });
      }}
    >
      <label htmlFor="cod" className="text-sm font-medium">¿Te recomendó alguien? Escribe su código</label>
      <div className="flex gap-2">
        <Input id="cod" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="SURT-XXXXXX" autoCapitalize="characters" className="h-11" />
        <Button type="submit" className="h-11" disabled={pendiente || codigo.trim().length < 5}>{pendiente ? "…" : "Usar"}</Button>
      </div>
      {aviso ? <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto}</p> : null}
    </form>
  );
}
