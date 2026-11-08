"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarFacturacion } from "./acciones";

export interface ConfigFE {
  activa: boolean;
  ambiente: "pruebas" | "produccion";
  proveedor: string;
  nit: string;
  dv: string;
  razonSocial: string;
  prefijo: string;
  resolucionNumero: string;
  resolucionFecha: string;
  rangoDesde: string;
  rangoHasta: string;
  vigenciaHasta: string;
  consumidorFinalHasta: string;
}

export function FormularioFacturacion({ inicial, proveedores }: { inicial: ConfigFE; proveedores: string[] }) {
  const [c, setC] = useState(inicial);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const poner = <K extends keyof ConfigFE>(k: K, v: ConfigFE[K]) => setC((x) => ({ ...x, [k]: v }));
  const campo = (k: keyof ConfigFE, etiqueta: string, extra: { tipo?: string; modo?: "numeric" | "text"; ayuda?: string } = {}) => (
    <div className="space-y-1">
      <label htmlFor={`fe-${k}`} className="text-xs">{etiqueta}</label>
      <Input id={`fe-${k}`} type={extra.tipo} inputMode={extra.modo} className="h-11" value={String(c[k])} onChange={(e) => poner(k, e.target.value as never)} />
      {extra.ayuda ? <p className="text-xs text-muted-foreground">{extra.ayuda}</p> : null}
    </div>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await guardarFacturacion(c);
          setAviso(r.ok ? { ok: true, texto: "Guardado" } : { ok: false, texto: r.error });
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4" checked={c.activa} onChange={(e) => poner("activa", e.target.checked)} /> Facturación electrónica activa
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="fe-ambiente" className="text-xs">Ambiente</label>
          <select id="fe-ambiente" value={c.ambiente} onChange={(e) => poner("ambiente", e.target.value as ConfigFE["ambiente"])} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="pruebas">Pruebas</option>
            <option value="produccion">Producción</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="fe-proveedor" className="text-xs">Proveedor tecnológico</label>
          <select id="fe-proveedor" value={c.proveedor} onChange={(e) => poner("proveedor", e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            {proveedores.map((p) => <option key={p} value={p}>{p === "simulado" ? "Simulado (solo pruebas)" : p}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        {campo("nit", "NIT (sin dígito de verificación)", { modo: "numeric" })}
        {campo("dv", "DV", { modo: "numeric" })}
      </div>
      {campo("razonSocial", "Razón social")}
      <div className="grid grid-cols-2 gap-3">
        {campo("prefijo", "Prefijo de la numeración", { ayuda: "Ej.: FE" })}
        {campo("resolucionNumero", "Resolución DIAN No.")}
        {campo("resolucionFecha", "Fecha de la resolución", { tipo: "date" })}
        {campo("vigenciaHasta", "Vigente hasta", { tipo: "date" })}
        {campo("rangoDesde", "Numeración desde", { modo: "numeric" })}
        {campo("rangoHasta", "Numeración hasta", { modo: "numeric" })}
      </div>
      {campo("consumidorFinalHasta", "Tope para vender a «consumidor final» ($)", { modo: "numeric", ayuda: "Equivale a 5 UVT. Actualízalo cada año con el valor de la UVT." })}
      <Button type="submit" className="h-12 w-full" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button>
      {aviso ? <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto}</p> : null}
    </form>
  );
}
