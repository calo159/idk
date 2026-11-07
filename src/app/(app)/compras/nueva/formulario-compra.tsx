"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { EscanerCodigo } from "@/components/escaner-codigo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { variantesCodigo } from "@/lib/codigos";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { totalCompra } from "@/lib/validaciones/compras";
import { crearCompra } from "../acciones";

export interface ProductoCompra {
  id: string;
  nombre: string;
  unidad_base: string;
  codigo_barras: string | null;
  presentaciones: { id: string; nombre: string; factor: number; codigo_barras: string | null }[];
}

interface Linea {
  clave: string;
  producto: ProductoCompra;
  presentacionId: string;
  cantidad: string;
  costo: string;
}

const clase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormularioCompra({
  productos,
  proveedores,
  bodegas,
  hoy,
}: {
  productos: ProductoCompra[];
  proveedores: { id: string; nombre: string }[];
  bodegas: { id: string; nombre: string }[];
  hoy: string;
}) {
  const router = useRouter();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();
  const [proveedor, setProveedor] = useState("");
  const [bodega, setBodega] = useState(bodegas[0]?.id ?? "");
  const [factura, setFactura] = useState("");
  const [fecha, setFecha] = useState(hoy);

  const sugeridos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (t.length < 2) return [];
    return productos.filter((p) => p.nombre.toLowerCase().includes(t)).slice(0, 6);
  }, [busqueda, productos]);

  const agregar = (p: ProductoCompra, presentacionId = "") =>
    setLineas((ls) => [
      ...ls,
      { clave: crypto.randomUUID(), producto: p, presentacionId, cantidad: "1", costo: "" },
    ]);

  const alEscanear = (codigo: string) => {
    const vs = variantesCodigo(codigo);
    for (const p of productos) {
      if (p.codigo_barras && vs.includes(p.codigo_barras)) return agregar(p);
      const pr = p.presentaciones.find((x) => x.codigo_barras && vs.includes(x.codigo_barras));
      if (pr) return agregar(p, pr.id);
    }
    setError(`No hay ningún producto con el código ${codigo}. Créalo primero en Productos.`);
  };

  const actualizar = (clave: string, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

  const leidas = lineas.map((l) => ({
    cantidad: leerNumeroCO(l.cantidad)?.toNumber() ?? 0,
    costo_unitario: leerNumeroCO(l.costo)?.toNumber() ?? 0,
  }));
  const total = totalCompra(leidas);

  const enviar = (confirmar: boolean) => {
    setError(null);
    setCampos({});
    iniciar(async () => {
      const r = await crearCompra(
        {
          proveedor_id: proveedor || null,
          bodega_id: bodega,
          numero_factura: factura,
          fecha,
          lineas: lineas.map((l, i) => ({
            producto_id: l.producto.id,
            presentacion_id: l.presentacionId || null,
            cantidad: leidas[i].cantidad,
            costo_unitario: leidas[i].costo_unitario,
          })),
        },
        confirmar,
      );
      if (r.ok) router.push(`/compras/${r.datos.id}`);
      else {
        setError(r.error);
        setCampos(r.campos ?? {});
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="proveedor">Proveedor</Label>
          <select id="proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={clase}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bodega">Recibe en</Label>
          <select id="bodega" value={bodega} onChange={(e) => setBodega(e.target.value)} className={clase}>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="factura">N.º de factura</Label>
          <Input id="factura" value={factura} onChange={(e) => setFactura(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fecha">Fecha</Label>
          <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="buscar">Agregar producto</Label>
        <div className="flex gap-2">
          <Input
            id="buscar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Escribe el nombre…"
            className="h-11"
          />
          <EscanerCodigo alLeer={alEscanear} etiqueta="Escanear" />
        </div>
        {sugeridos.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {sugeridos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    agregar(p);
                    setBusqueda("");
                  }}
                >
                  {p.nombre}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {lineas.length > 0 ? (
        <ul className="space-y-3">
          {lineas.map((l, i) => (
            <li key={l.clave} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{l.producto.nombre}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                >
                  Quitar
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  aria-label="Presentación"
                  value={l.presentacionId}
                  onChange={(e) => actualizar(l.clave, { presentacionId: e.target.value })}
                  className={clase}
                >
                  <option value="">{l.producto.unidad_base}</option>
                  {l.producto.presentaciones.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label="Cantidad"
                  inputMode="decimal"
                  value={l.cantidad}
                  onChange={(e) => actualizar(l.clave, { cantidad: e.target.value })}
                  className="h-11"
                />
                <Input
                  aria-label="Costo unitario"
                  inputMode="decimal"
                  placeholder="Costo $"
                  value={l.costo}
                  onChange={(e) => actualizar(l.clave, { costo: e.target.value })}
                  className="h-11"
                />
              </div>
              <p className="text-right text-sm text-muted-foreground tabular-nums">
                {formatoCOP(totalCompra([leidas[i]]))}
              </p>
              {campos[`lineas.${i}.costo_unitario`] || campos[`lineas.${i}.cantidad`] ? (
                <p className="text-xs text-destructive">
                  {campos[`lineas.${i}.cantidad`] ?? campos[`lineas.${i}.costo_unitario`]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Busca o escanea los productos que llegaron.
        </p>
      )}

      <div className="flex items-center justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatoCOP(total)}</span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" className="h-12" disabled={pendiente || !lineas.length} onClick={() => enviar(false)}>
          Guardar borrador
        </Button>
        <Button type="button" className="h-12" disabled={pendiente || !lineas.length} onClick={() => enviar(true)}>
          {pendiente ? "Guardando…" : "Confirmar compra"}
        </Button>
      </div>
    </div>
  );
}
