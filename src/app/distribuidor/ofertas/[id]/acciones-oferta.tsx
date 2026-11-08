"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelarOferta, cerrarOferta, entregarOferta } from "../../acciones";

export function AccionesOferta({ oferta, estado, total, primeraEscala, unidad }: { oferta: string; estado: string; total: number; primeraEscala: number; unidad: string }) {
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (fn: () => Promise<{ ok: boolean } & ({ ok: true } | { ok: false; error: string })>, exito: string) =>
    iniciar(async () => {
      const r = await fn();
      setAviso(r.ok ? { ok: true, texto: exito } : { ok: false, texto: (r as { error: string }).error });
    });

  if (estado === "abierta")
    return (
      <div className="space-y-3 rounded-xl border p-4 text-sm">
        <h2 className="font-medium">Cerrar la oferta</h2>
        <p className="text-muted-foreground">
          {total >= primeraEscala ? "Ya se alcanzó el mínimo: al cerrar, el precio queda fijo para todos y se les avisa." : `Faltan ${primeraEscala - total} ${unidad} para el mínimo. Si cierras ahora, la oferta se cancela sin cobrar a nadie.`}
        </p>
        <Button className="h-11 w-full" disabled={pendiente} onClick={() => { if (window.confirm("¿Cerrar la oferta? Los negocios ya no podrán unirse ni retirarse.")) correr(() => cerrarOferta({ oferta }), "Oferta cerrada."); }}>Cerrar oferta</Button>
        <div className="flex gap-2">
          <Input aria-label="Motivo de la cancelación" placeholder="Motivo si quieres cancelarla" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-11" />
          <Button variant="outline" className="h-11" disabled={pendiente} onClick={() => correr(() => cancelarOferta({ oferta, motivo }), "Oferta cancelada y negocios avisados.")}>Cancelar</Button>
        </div>
        {aviso ? <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "text-primary" : "text-destructive"}>{aviso.texto}</p> : null}
      </div>
    );
  if (estado === "cerrada")
    return (
      <div className="space-y-2 rounded-xl border p-4 text-sm">
        <Button className="h-11 w-full" disabled={pendiente} onClick={() => correr(() => entregarOferta({ oferta }), "Marcada como entregada.")}>Marcar como entregada</Button>
        {aviso ? <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "text-primary" : "text-destructive"}>{aviso.texto}</p> : null}
      </div>
    );
  return null;
}
