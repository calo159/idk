"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { totalOrden } from "@/lib/validaciones/ordenes";
import { crearOrden } from "../acciones";

export interface ProductoOrden {
  id: string;
  nombre: string;
  unidad: string;
  /** Último costo conocido, para sugerir. */
  costo: number;
}

const clase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormularioOrden({ proveedores, bodegas, productos }: {
  proveedores: { id: string; nombre: string }[];
  bodegas: { id: string; nombre: string }[];
  productos: ProductoOrden[];
}) {
  const router = useRouter();
  const [proveedor, setProveedor] = useState(proveedores[0]?.id ?? "");
  const [bodega, setBodega] = useState(bodegas[0]?.id ?? "");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [lineas, setLineas] = useState<{ p: ProductoOrden; cantidad: string; costo: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const sugeridos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return t.length < 2 ? [] : productos.filter((p) => p.nombre.toLowerCase().includes(t) && !lineas.some((l) => l.p.id === p.id)).slice(0, 6);
  }, [busqueda, productos, lineas]);

  const leidas = lineas.map((l) => ({ cantidad: leerNumeroCO(l.cantidad)?.toNumber() ?? 0, costo: leerNumeroCO(l.costo)?.toNumber() ?? 0 }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="prov-oc">Proveedor</Label>
          <select id="prov-oc" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={clase}>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bod-oc">Llega a</Label>
          <select id="bod-oc" value={bodega} onChange={(e) => setBodega(e.target.value)} className={clase}>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fecha-oc">Fecha esperada</Label>
          <Input id="fecha-oc" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nota-oc">Nota</Label>
          <Input id="nota-oc" value={nota} onChange={(e) => setNota(e.target.value)} className="h-11" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="buscar-oc">Agregar producto</Label>
        <Input id="buscar-oc" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Escribe el nombre…" className="h-11" />
        {sugeridos.map((p) => (
          <button key={p.id} type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => { setLineas((ls) => [...ls, { p, cantidad: "1", costo: p.costo ? String(p.costo) : "" }]); setBusqueda(""); }}>
            {p.nombre}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {lineas.map((l, i) => (
          <li key={l.p.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-start justify-between">
              <p className="font-medium">{l.p.nombre}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>Quitar</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label={`Cantidad de ${l.p.nombre}`} inputMode="decimal" value={l.cantidad} className="h-10"
                onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} />
              <Input aria-label={`Costo de ${l.p.nombre}`} inputMode="decimal" placeholder="Costo $" value={l.costo} className="h-10"
                onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)))} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-lg font-semibold"><span>Total estimado</span><span className="tabular-nums">{formatoCOP(totalOrden(leidas))}</span></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="h-12 w-full" disabled={pendiente || lineas.length === 0} onClick={() =>
        iniciar(async () => {
          setError(null);
          const r = await crearOrden({
            proveedor_id: proveedor, bodega_id: bodega, fecha_esperada: fecha, nota,
            lineas: lineas.map((l, i) => ({ producto_id: l.p.id, presentacion_id: null, cantidad: leidas[i]!.cantidad, costo: leidas[i]!.costo })),
          });
          if (r.ok) router.push(`/compras/ordenes/${r.datos.id}`);
          else setError(r.error);
        })}>
        {pendiente ? "Creando…" : "Crear orden de compra"}
      </Button>
    </div>
  );
}
