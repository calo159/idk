"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leerNumeroCO } from "@/lib/dinero";
import { publicarOferta } from "./acciones";

interface Escala {
  desde: string;
  precio: string;
}

export function NuevaOferta({ manana, maxima }: { manana: string; maxima: string }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ titulo: "", descripcion: "", unidad: "bulto", precioReferencia: "", cierraEn: "", entrega: "", minimo: "1", maximo: "" });
  const [escalas, setEscalas] = useState<Escala[]>([{ desde: "", precio: "" }]);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const n = (t: string) => leerNumeroCO(t)?.toNumber() ?? 0;
  const campo = (k: keyof typeof f, etiqueta: string, extra: { tipo?: string; modo?: "numeric" | "decimal"; ayuda?: string } = {}) => (
    <div className="space-y-1">
      <label htmlFor={`o-${k}`} className="text-xs">{etiqueta}</label>
      <Input id={`o-${k}`} type={extra.tipo} inputMode={extra.modo} min={extra.tipo === "date" ? manana : undefined} max={extra.tipo === "date" ? maxima : undefined} className="h-11" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
      {extra.ayuda ? <p className="text-xs text-muted-foreground">{extra.ayuda}</p> : null}
    </div>
  );

  if (!abierto) return <Button className="h-12 w-full" onClick={() => setAbierto(true)}>Publicar una compra en grupo</Button>;
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await publicarOferta({
            titulo: f.titulo, descripcion: f.descripcion, unidad: f.unidad, precioReferencia: n(f.precioReferencia), cierraEn: f.cierraEn, entrega: f.entrega,
            minimoNegocio: n(f.minimo), maximoNegocio: f.maximo.trim() ? n(f.maximo) : null, escalas: escalas.map((x) => ({ desde: n(x.desde), precio: n(x.precio) })),
          });
          if (r.ok) { setAviso({ ok: true, texto: "Oferta publicada: ya la ven los negocios." }); setAbierto(false); }
          else setAviso({ ok: false, texto: r.error });
        });
      }}
    >
      {campo("titulo", "Producto y presentación", { ayuda: "Ej.: Cemento gris 50 kg" })}
      {campo("descripcion", "Detalle (opcional)")}
      <div className="grid grid-cols-2 gap-3">
        {campo("unidad", "Unidad")}
        {campo("precioReferencia", "Precio normal por unidad ($)", { modo: "decimal" })}
        {campo("cierraEn", "La oferta cierra el", { tipo: "date" })}
        {campo("entrega", "Entrega estimada (opcional)", { tipo: "date" })}
        {campo("minimo", "Mínimo por negocio", { modo: "decimal" })}
        {campo("maximo", "Máximo por negocio (opcional)", { modo: "decimal" })}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Escalas de precio por volumen TOTAL</legend>
        <p className="text-xs text-muted-foreground">Mientras más unidades junte el grupo entre todos los negocios, menor el precio para todos. La primera escala es el mínimo para que haya compra.</p>
        {escalas.map((e, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div className="space-y-1"><label htmlFor={`d-${i}`} className="text-xs">Desde (unidades)</label><Input id={`d-${i}`} inputMode="decimal" className="h-11" value={e.desde} onChange={(ev) => setEscalas((x) => x.map((y, j) => (j === i ? { ...y, desde: ev.target.value } : y)))} /></div>
            <div className="space-y-1"><label htmlFor={`p-${i}`} className="text-xs">Precio c/u ($)</label><Input id={`p-${i}`} inputMode="decimal" className="h-11" value={e.precio} onChange={(ev) => setEscalas((x) => x.map((y, j) => (j === i ? { ...y, precio: ev.target.value } : y)))} /></div>
            <button type="button" aria-label="Quitar escala" disabled={escalas.length === 1} onClick={() => setEscalas((x) => x.filter((_, j) => j !== i))} className="size-11 rounded-lg border disabled:opacity-30">✕</button>
          </div>
        ))}
        {escalas.length < 6 ? <Button type="button" variant="outline" size="sm" onClick={() => setEscalas((x) => [...x, { desde: "", precio: "" }])}>+ Agregar escala</Button> : null}
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" className="h-12 flex-1" disabled={pendiente}>{pendiente ? "Publicando…" : "Publicar oferta"}</Button>
        <Button type="button" variant="ghost" className="h-12" onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
      {aviso && !aviso.ok ? <p role="alert" className="text-sm text-destructive">{aviso.texto}</p> : null}
    </form>
  );
}
