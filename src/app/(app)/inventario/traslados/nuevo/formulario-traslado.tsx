"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leerNumeroCO } from "@/lib/dinero";
import { crearTraslado } from "../acciones";

export interface ProductoTraslado {
  id: string;
  nombre: string;
  unidad: string;
  /** bodega_id → cantidad disponible */
  stock: Record<string, number>;
}

const clase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormularioTraslado({ bodegas, productos }: { bodegas: { id: string; nombre: string }[]; productos: ProductoTraslado[] }) {
  const router = useRouter();
  const [origen, setOrigen] = useState(bodegas[0]?.id ?? "");
  const [destino, setDestino] = useState(bodegas[1]?.id ?? "");
  const [nota, setNota] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [lineas, setLineas] = useState<{ producto: ProductoTraslado; cantidad: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const sugeridos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (t.length < 2) return [];
    return productos.filter((p) => p.nombre.toLowerCase().includes(t) && !lineas.some((l) => l.producto.id === p.id)).slice(0, 6);
  }, [busqueda, productos, lineas]);

  const enviar = () => {
    setError(null);
    iniciar(async () => {
      const r = await crearTraslado({
        bodega_origen_id: origen,
        bodega_destino_id: destino,
        nota,
        lineas: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: leerNumeroCO(l.cantidad)?.toNumber() ?? 0 })),
      });
      if (r.ok) router.push(`/inventario/traslados`);
      else setError(r.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="origen">Sale de</Label>
          <select id="origen" value={origen} onChange={(e) => setOrigen(e.target.value)} className={clase}>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="destino">Llega a</Label>
          <select id="destino" value={destino} onChange={(e) => setDestino(e.target.value)} className={clase}>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="buscar-traslado">Agregar producto</Label>
        <Input id="buscar-traslado" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Escribe el nombre…" className="h-11" />
        {sugeridos.map((p) => (
          <button key={p.id} type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => { setLineas((ls) => [...ls, { producto: p, cantidad: "1" }]); setBusqueda(""); }}>
            {p.nombre} <span className="text-xs text-muted-foreground">({p.stock[origen] ?? 0} {p.unidad} aquí)</span>
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {lineas.map((l, i) => {
          const disp = l.producto.stock[origen] ?? 0;
          const cant = leerNumeroCO(l.cantidad)?.toNumber() ?? 0;
          return (
            <li key={l.producto.id} className="flex items-center gap-2 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.producto.nombre}</p>
                <p className={`text-xs ${cant > disp ? "text-destructive" : "text-muted-foreground"}`}>
                  Disponible en origen: {disp} {l.producto.unidad}
                </p>
              </div>
              <Input aria-label={`Cantidad de ${l.producto.nombre}`} inputMode="decimal" className="h-10 w-24 text-right" value={l.cantidad}
                onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>Quitar</Button>
            </li>
          );
        })}
      </ul>
      <div className="space-y-1.5">
        <Label htmlFor="nota">Nota (opcional)</Label>
        <Input id="nota" value={nota} onChange={(e) => setNota(e.target.value)} className="h-11" />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="h-12 w-full" disabled={pendiente || lineas.length === 0 || origen === destino} onClick={enviar}>
        {pendiente ? "Trasladando…" : "Hacer traslado"}
      </Button>
    </div>
  );
}
