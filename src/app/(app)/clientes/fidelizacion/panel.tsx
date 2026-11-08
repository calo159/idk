"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leerNumeroCO } from "@/lib/dinero";
import { guardarFidelizacion, marcarContactado } from "./acciones";

export function FormularioFidelizacion({ inicial }: { inicial: { activa: boolean; pesosPorPunto: number; valorPunto: number; puntosCumpleanos: number } }) {
  const [activa, setActiva] = useState(inicial.activa);
  const [pesos, setPesos] = useState(String(inicial.pesosPorPunto));
  const [valor, setValor] = useState(String(inicial.valorPunto));
  const [cumple, setCumple] = useState(String(inicial.puntosCumpleanos));
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const pesosNum = leerNumeroCO(pesos)?.toNumber() ?? 0;
  const valorNum = leerNumeroCO(valor)?.toNumber() ?? 0;
  const devolucion = pesosNum > 0 ? (valorNum / pesosNum) * 100 : 0;
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await guardarFidelizacion({ activa, pesosPorPunto: pesosNum, valorPunto: valorNum, puntosCumpleanos: Number(cumple) || 0 });
          setMensaje(r.ok ? { ok: true, texto: "Guardado" } : { ok: false, texto: r.error });
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Programa de puntos activo
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><label htmlFor="fp" className="text-xs">1 punto por cada ($)</label><Input id="fp" inputMode="decimal" className="h-11" value={pesos} onChange={(e) => setPesos(e.target.value)} /></div>
        <div className="space-y-1"><label htmlFor="fv" className="text-xs">Cada punto vale ($)</label><Input id="fv" inputMode="decimal" className="h-11" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
        <div className="col-span-2 space-y-1"><label htmlFor="fc" className="text-xs">Puntos de regalo en el cumpleaños</label><Input id="fc" inputMode="numeric" className="h-11" value={cumple} onChange={(e) => setCumple(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">El cliente recupera aproximadamente el <strong>{devolucion.toFixed(1).replace(".", ",")} %</strong> de lo que compra en descuentos.</p>
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button>
      {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
    </form>
  );
}

export function FilaContacto({ clienteId, tipo, nombre, detalle, enlace }: { clienteId: string; tipo: "cumpleanos" | "inactivo"; nombre: string; detalle: string; enlace: string | null }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{nombre}</span><span className="block truncate text-xs text-muted-foreground">{detalle}</span></span>
      {enlace ? <a href={enlace} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1.5 text-xs">WhatsApp</a> : null}
      <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => iniciar(async () => void (await marcarContactado({ clienteId, tipo })))}>Ya escribí</Button>
    </li>
  );
}
