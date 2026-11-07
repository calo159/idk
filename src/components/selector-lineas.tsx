"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { totalDocumento } from "@/lib/validaciones/ventas-extra";

export interface ProductoSelector {
  id: string;
  nombre: string;
  precio: number;
  presentaciones: { id: string; nombre: string; precio: number }[];
}

export interface LineaSelector {
  clave: string;
  producto: ProductoSelector;
  presentacionId: string;
  cantidad: string;
  precio: string;
}

/** Lista de productos con cantidad y precio editable. Se usa en cotizaciones y separados. */
export function SelectorLineas({ catalogo, lineas, onChange }: { catalogo: ProductoSelector[]; lineas: LineaSelector[]; onChange: (l: LineaSelector[]) => void }) {
  const [busqueda, setBusqueda] = useState("");
  const sugeridos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return t.length < 2 ? [] : catalogo.filter((p) => p.nombre.toLowerCase().includes(t)).slice(0, 6);
  }, [busqueda, catalogo]);
  const total = totalDocumento(lineas.map((l) => ({ cantidad: leerNumeroCO(l.cantidad)?.toNumber() ?? 0, precio: leerNumeroCO(l.precio)?.toNumber() ?? 0 })));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="buscar-lineas">Agregar producto</Label>
        <Input id="buscar-lineas" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Escribe el nombre…" className="h-11" />
        {sugeridos.map((p) => (
          <button key={p.id} type="button" className="flex w-full justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => { onChange([...lineas, { clave: crypto.randomUUID(), producto: p, presentacionId: "", cantidad: "1", precio: String(p.precio) }]); setBusqueda(""); }}>
            <span>{p.nombre}</span><span className="tabular-nums text-muted-foreground">{formatoCOP(p.precio)}</span>
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {lineas.map((l) => (
          <li key={l.clave} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-start justify-between">
              <p className="font-medium">{l.producto.nombre}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(lineas.filter((x) => x.clave !== l.clave))}>Quitar</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select aria-label="Presentación" value={l.presentacionId} className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
                onChange={(e) => {
                  const pr = l.producto.presentaciones.find((x) => x.id === e.target.value);
                  onChange(lineas.map((x) => (x.clave === l.clave ? { ...x, presentacionId: e.target.value, precio: String(pr ? pr.precio : l.producto.precio) } : x)));
                }}>
                <option value="">Unidad</option>
                {l.producto.presentaciones.map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
              </select>
              <Input aria-label={`Cantidad de ${l.producto.nombre}`} inputMode="decimal" className="h-10" value={l.cantidad} onChange={(e) => onChange(lineas.map((x) => (x.clave === l.clave ? { ...x, cantidad: e.target.value } : x)))} />
              <Input aria-label={`Precio de ${l.producto.nombre}`} inputMode="decimal" className="h-10" value={l.precio} onChange={(e) => onChange(lineas.map((x) => (x.clave === l.clave ? { ...x, precio: e.target.value } : x)))} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-lg font-semibold"><span>Total</span><span className="tabular-nums">{formatoCOP(total)}</span></div>
    </div>
  );
}

export function lineasParaEnviar(lineas: LineaSelector[]) {
  return lineas.map((l) => ({
    producto_id: l.producto.id,
    presentacion_id: l.presentacionId || null,
    cantidad: leerNumeroCO(l.cantidad)?.toNumber() ?? 0,
    precio: leerNumeroCO(l.precio)?.toNumber() ?? 0,
  }));
}
