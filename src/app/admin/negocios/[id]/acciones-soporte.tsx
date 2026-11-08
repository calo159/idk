"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cambiarPlanAdmin, extenderAdmin, pagoManualAdmin, suspenderAdmin } from "../../acciones";

/** Todas las acciones piden un motivo: queda en la bitácora junto con quién la hizo. */
export function AccionesSoporte({ org, planes, suspendida }: { org: string; planes: { codigo: string; nombre: string }[]; suspendida: boolean }) {
  const [motivo, setMotivo] = useState("");
  const [plan, setPlan] = useState(planes[0]?.codigo ?? "");
  const [dias, setDias] = useState("30");
  const [meses, setMeses] = useState("1");
  const [monto, setMonto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const correr = (descripcion: string, fn: () => Promise<{ ok: boolean } & ({ ok: true } | { ok: false; error: string })>) =>
    iniciar(async () => {
      const r = await fn();
      setAviso(r.ok ? { ok: true, texto: `${descripcion}: hecho` } : { ok: false, texto: (r as { error: string }).error });
      if (r.ok) setMotivo("");
    });

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Acciones de soporte</h2>
      <div className="space-y-1">
        <label htmlFor="motivo" className="text-xs">Motivo (obligatorio, queda registrado)</label>
        <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className="h-11" placeholder="Ej.: cliente pagó por transferencia el 12/11" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1"><label htmlFor="plan" className="text-xs">Plan</label>
            <select id="plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{planes.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}</select></div>
          <Button variant="outline" className="h-11" disabled={pendiente} onClick={() => correr("Cambio de plan", () => cambiarPlanAdmin({ org, plan, motivo }))}>Cambiar</Button>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1"><label htmlFor="dias" className="text-xs">Regalar días</label><Input id="dias" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className="h-11" /></div>
          <Button variant="outline" className="h-11" disabled={pendiente} onClick={() => correr("Extensión", () => extenderAdmin({ org, dias: Number(dias), motivo }))}>Extender</Button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <div className="space-y-1"><label htmlFor="mm" className="text-xs">Pago manual: meses</label>
          <select id="mm" value={meses} onChange={(e) => setMeses(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
        <div className="space-y-1"><label htmlFor="mo" className="text-xs">Monto recibido ($)</label><Input id="mo" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} className="h-11" /></div>
        <Button variant="outline" className="h-11" disabled={pendiente} onClick={() => correr("Pago manual", () => pagoManualAdmin({ org, plan, meses: Number(meses), monto: Number(monto.replace(/\D/g, "")), motivo }))}>Registrar</Button>
      </div>
      <Button variant={suspendida ? "default" : "destructive"} className="h-11 w-full" disabled={pendiente} onClick={() => correr(suspendida ? "Reactivación" : "Suspensión", () => suspenderAdmin({ org, suspender: !suspendida, motivo }))}>
        {suspendida ? "Reactivar cuenta" : "Suspender cuenta"}
      </Button>
      {aviso ? <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto}</p> : null}
    </div>
  );
}
