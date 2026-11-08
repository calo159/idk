"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { type DatosPromocion, TAMANO_AFICHE, dibujarAfiche, textoPromocionWhatsApp } from "@/lib/promocion-imagen";
import { crearPromocion, terminarPromocion } from "./acciones";

export interface Sugerida {
  id: string;
  nombre: string;
  cantidad: number;
  costo: number;
  precioNormal: number;
  dias: number | null;
  descuento: number;
  precioSugerido: number;
  inmovilizado: number;
}

export function PanelNuevaPromocion({ sugeridas, negocio, hoy, fin }: { sugeridas: Sugerida[]; negocio: string; hoy: string; fin: string }) {
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(sugeridas.slice(0, 8).map((s) => s.id)));
  const [precios, setPrecios] = useState<Record<string, string>>(() => Object.fromEntries(sugeridas.map((s) => [s.id, String(s.precioSugerido)])));
  const [nombre, setNombre] = useState("Liquidación");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(fin);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [datos, setDatos] = useState<DatosPromocion | null>(null);
  const [pendiente, iniciar] = useTransition();
  const lienzo = useRef<HTMLCanvasElement>(null);

  const items = sugeridas.filter((s) => elegidas.has(s.id)).map((s) => ({ s, precio: leerNumeroCO(precios[s.id] ?? "")?.toNumber() ?? 0 }));
  const inmovilizado = items.reduce((t, i) => t + i.s.inmovilizado, 0);

  const crear = () =>
    iniciar(async () => {
      const r = await crearPromocion({ nombre, desde, hasta, items: items.map((i) => ({ producto_id: i.s.id, precio: i.precio })) });
      if (!r.ok) return setMensaje({ ok: false, texto: r.error });
      setMensaje({ ok: true, texto: "Promoción creada: el POS ya cobra estos precios." });
      setDatos({ negocio, nombre, hasta, items: items.map((i) => ({ nombre: i.s.nombre, precioNormal: i.s.precioNormal, precioPromo: i.precio })) });
    });

  const dibujar = (d: DatosPromocion) => {
    const c = lienzo.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = TAMANO_AFICHE;
    c.height = TAMANO_AFICHE;
    dibujarAfiche(ctx, d);
  };
  const descargar = (d: DatosPromocion) => {
    dibujar(d);
    lienzo.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "promocion.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 space-y-1"><label htmlFor="pn" className="text-xs">Nombre de la promoción</label><Input id="pn" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-11" /></div>
        <div className="col-span-3 grid grid-cols-2 gap-3">
          <div className="space-y-1"><label htmlFor="pd" className="text-xs">Desde</label><Input id="pd" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-11" /></div>
          <div className="space-y-1"><label htmlFor="ph" className="text-xs">Hasta</label><Input id="ph" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-11" /></div>
        </div>
      </div>
      <ul className="space-y-2">
        {sugeridas.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
            <input type="checkbox" aria-label={`Incluir ${s.nombre}`} className="size-4" checked={elegidas.has(s.id)} onChange={(e) => setElegidas((x) => { const n = new Set(x); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.nombre}</span>
              <span className="block text-xs text-muted-foreground">{s.cantidad} u. · {s.dias === null ? "nunca se ha vendido" : `${s.dias} días sin venderse`} · ahí tienes {formatoCOP(s.inmovilizado)} · costo {formatoCOP(s.costo)}</span>
            </span>
            <span className="text-right">
              <span className="block text-xs text-muted-foreground line-through">{formatoCOP(s.precioNormal)}</span>
              <Input aria-label={`Precio promocional de ${s.nombre}`} inputMode="decimal" className="h-9 w-28 text-right" value={precios[s.id] ?? ""} onChange={(e) => setPrecios((p) => ({ ...p, [s.id]: e.target.value }))} />
            </span>
          </li>
        ))}
      </ul>
      <div className="space-y-2 rounded-xl border p-4">
        <p className="text-sm">{items.length} producto(s) · plata parada en ellos: <strong>{formatoCOP(inmovilizado)}</strong></p>
        <Button className="h-12 w-full" disabled={pendiente || items.length === 0} onClick={crear}>{pendiente ? "Creando…" : "Crear promoción"}</Button>
        {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
      </div>
      {datos ? (
        <div className="space-y-2 rounded-xl border p-4">
          <h2 className="font-medium">Compártela</h2>
          <canvas ref={lienzo} className="aspect-square w-full rounded-lg border" aria-label="Afiche de la promoción" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => dibujar(datos)}>Ver afiche</Button>
            <Button variant="outline" onClick={() => descargar(datos)}>Descargar imagen</Button>
          </div>
          <a className="block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(textoPromocionWhatsApp(datos))}`}>Enviar por WhatsApp</a>
        </div>
      ) : null}
    </div>
  );
}

export function BotonTerminar({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  return <Button variant="ghost" size="sm" disabled={pendiente} onClick={() => { if (window.confirm("¿Terminar esta promoción? El POS vuelve a cobrar el precio normal.")) iniciar(async () => void (await terminarPromocion(id))); }}>Terminar</Button>;
}
