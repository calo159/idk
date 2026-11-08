"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { crearOrdenesDesdeSugerencia } from "./acciones";

export interface FilaSugerida {
  productoId: string;
  producto: string;
  unidad: string;
  stock: number;
  diasRestantes: number | null;
  sugerida: number;
  urgencia: string;
  proveedorId: string | null;
  proveedor: string | null;
  costo: number;
}

export function PanelSugerencias({ filas, proveedores, bodegaId, puedeOrdenar }: { filas: FilaSugerida[]; proveedores: { id: string; nombre: string }[]; bodegaId: string; puedeOrdenar: boolean }) {
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(filas.filter((f) => f.proveedorId).map((f) => f.productoId)));
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(filas.map((f) => [f.productoId, String(f.sugerida)])));
  const [proveedorPor, setProveedorPor] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string; ids?: string[] } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const proveedorDe = (f: FilaSugerida) => proveedorPor[f.productoId] || f.proveedorId || "";
  const listas = useMemo(() => filas.filter((f) => elegidas.has(f.productoId) && proveedorDe(f)), [filas, elegidas, proveedorPor]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = listas.reduce((s, f) => s + (leerNumeroCO(cantidades[f.productoId] ?? "")?.toNumber() ?? 0) * f.costo, 0);

  const crear = () =>
    iniciar(async () => {
      const grupos = new Map<string, { producto_id: string; cantidad: number; costo: number }[]>();
      for (const f of listas) {
        const cant = leerNumeroCO(cantidades[f.productoId] ?? "")?.toNumber() ?? 0;
        if (cant <= 0) continue;
        const p = proveedorDe(f);
        grupos.set(p, [...(grupos.get(p) ?? []), { producto_id: f.productoId, cantidad: cant, costo: f.costo }]);
      }
      const r = await crearOrdenesDesdeSugerencia({ bodega_id: bodegaId, grupos: [...grupos].map(([proveedor_id, lineas]) => ({ proveedor_id, lineas })) });
      setMensaje(r.ok ? { ok: true, texto: `${r.datos.ids.length} orden(es) de compra creadas en borrador.`, ids: r.datos.ids } : { ok: false, texto: r.error });
    });

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {filas.map((f) => (
          <li key={f.productoId} className="space-y-2 rounded-xl border p-3 text-sm">
            <div className="flex items-center gap-2">
              {puedeOrdenar ? (
                <input type="checkbox" aria-label={`Incluir ${f.producto}`} className="size-4" checked={elegidas.has(f.productoId)}
                  onChange={(e) => setElegidas((s) => { const n = new Set(s); if (e.target.checked) n.add(f.productoId); else n.delete(f.productoId); return n; })} />
              ) : null}
              <span className="min-w-0 flex-1 truncate font-medium">{f.producto}</span>
              <Badge variant={f.urgencia === "critica" ? "destructive" : "secondary"}>{f.urgencia === "critica" ? "Se acaba antes de que llegue" : "Pronto"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Hay {f.stock} {f.unidad}
              {f.diasRestantes !== null ? ` · alcanza ~${Math.round(f.diasRestantes)} día(s)` : ""}
            </p>
            {puedeOrdenar ? (
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label={`Cantidad a comprar de ${f.producto}`} inputMode="decimal" className="h-10" value={cantidades[f.productoId] ?? ""} onChange={(e) => setCantidades((c) => ({ ...c, [f.productoId]: e.target.value }))} />
                <select aria-label={`Proveedor de ${f.producto}`} value={proveedorDe(f)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
                  onChange={(e) => setProveedorPor((p) => ({ ...p, [f.productoId]: e.target.value }))}>
                  <option value="">Elige proveedor…</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.id === f.proveedorId ? " · más barato" : ""}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-xs">Comprar ~{f.sugerida} {f.unidad}{f.proveedor ? ` a ${f.proveedor}` : ""}</p>
            )}
          </li>
        ))}
      </ul>
      {puedeOrdenar && filas.length > 0 ? (
        <div className="sticky bottom-20 space-y-2 rounded-xl border bg-background p-3 md:bottom-2">
          <p className="flex justify-between text-sm"><span>{listas.length} producto(s) seleccionados</span><strong className="tabular-nums">{formatoCOP(total)}</strong></p>
          <Button className="h-12 w-full" disabled={pendiente || listas.length === 0} onClick={crear}>{pendiente ? "Creando…" : "Crear órdenes de compra"}</Button>
          {mensaje ? (
            <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>
              {mensaje.texto} {mensaje.ok ? <Link href="/compras/ordenes" className="underline">Ver órdenes</Link> : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
