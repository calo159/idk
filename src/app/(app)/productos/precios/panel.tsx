"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { ajustarPrecio, simularPrecios } from "@/lib/simulador-precios";
import { aplicarPreciosElegidos, configurarAutomatico } from "./acciones";

export interface FilaPrecio {
  id: string;
  nombre: string;
  costo: number;
  precioActual: number;
  margenObjetivo: number;
  margenActual: number | null;
  sugerido: number;
  unidades30d: number;
}

export function PanelPrecios({ filas, automatico, puedeCambiar }: { filas: FilaPrecio[]; automatico: boolean; puedeCambiar: boolean }) {
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(filas.filter((f) => Math.abs(f.sugerido - f.precioActual) / (f.precioActual || 1) >= 0.02).map((f) => f.id)));
  const [ajuste, setAjuste] = useState("");
  const [elasticidad, setElasticidad] = useState("0");
  const [auto, setAuto] = useState(automatico);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const pctAjuste = leerNumeroCO(ajuste)?.toNumber();
  /** Precio nuevo de cada fila: con el % del simulador si se escribió; si no, el sugerido por margen. */
  const nuevoPrecio = (f: FilaPrecio) => (pctAjuste !== undefined ? ajustarPrecio(f.precioActual, pctAjuste) : f.sugerido);
  const seleccion = filas.filter((f) => elegidos.has(f.id));
  const sim = simularPrecios(
    seleccion.map((f) => ({ costo: f.costo, precioActual: f.precioActual, precioNuevo: nuevoPrecio(f), unidades30d: f.unidades30d })),
    Number(elasticidad),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">Simulador</h2>
        <p className="text-xs text-muted-foreground">Elige los productos de la lista. Sin escribir nada se simula el precio sugerido por margen; escribe un % para probar «¿y si subo todo X %?».</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><label htmlFor="aj" className="text-xs">Cambiar precios en (%)</label><Input id="aj" inputMode="decimal" placeholder="Ej. 5 o −3" value={ajuste} onChange={(e) => setAjuste(e.target.value)} className="h-11" /></div>
          <div className="space-y-1">
            <label htmlFor="el" className="text-xs">Si subo el precio, la venta…</label>
            <select id="el" value={elasticidad} onChange={(e) => setElasticidad(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-2 text-sm">
              <option value="0">No cambia</option>
              <option value="-0.5">Baja poco</option>
              <option value="-1">Baja igual que el precio sube</option>
              <option value="-2">Baja mucho</option>
            </select>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">Utilidad mensual hoy</dt><dd className="font-semibold tabular-nums">{formatoCOP(sim.utilidadActual)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Utilidad con el cambio</dt><dd className="font-semibold tabular-nums">{formatoCOP(sim.utilidadNueva)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Diferencia</dt><dd className={`font-semibold tabular-nums ${sim.diferenciaUtilidad < 0 ? "text-destructive" : "text-primary"}`}>{sim.diferenciaUtilidad >= 0 ? "+" : ""}{formatoCOP(sim.diferenciaUtilidad)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Margen</dt><dd className="tabular-nums">{sim.margenActual} % → {sim.margenNuevo} %</dd></div>
        </dl>
      </div>

      <ul className="space-y-2">
        {filas.map((f) => {
          const nuevo = nuevoPrecio(f);
          return (
            <li key={f.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
              {puedeCambiar ? <input type="checkbox" aria-label={`Incluir ${f.nombre}`} className="size-4" checked={elegidos.has(f.id)} onChange={(e) => setElegidos((s) => { const n = new Set(s); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })} /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.nombre}</span>
                <span className="block text-xs text-muted-foreground">Costo {formatoCOP(f.costo)} · margen {f.margenActual ?? "—"} % (meta {f.margenObjetivo} %) · {f.unidades30d} u./mes</span>
              </span>
              <span className="text-right tabular-nums">
                <span className="block text-xs text-muted-foreground line-through">{formatoCOP(f.precioActual)}</span>
                <span className={`block font-medium ${nuevo === f.precioActual ? "" : nuevo > f.precioActual ? "text-primary" : "text-destructive"}`}>{formatoCOP(nuevo)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {puedeCambiar ? (
        <div className="space-y-3 rounded-xl border p-4">
          <Button className="h-12 w-full" disabled={pendiente || seleccion.length === 0} onClick={() => {
            if (!window.confirm(`Se cambiarán los precios de ${seleccion.length} producto(s). Queda registrado en el historial. ¿Continuar?`)) return;
            iniciar(async () => {
              const r = await aplicarPreciosElegidos({ items: seleccion.map((f) => ({ producto_id: f.id, precio: nuevoPrecio(f) })) }, pctAjuste !== undefined ? `Ajuste manual de ${pctAjuste} %` : "Ajuste por margen objetivo");
              setMensaje({ ok: r.ok, texto: r.ok ? `${r.datos.cambiados} precio(s) actualizados.` : r.error });
            });
          }}>
            {pendiente ? "Aplicando…" : `Aplicar a ${seleccion.length} producto(s)`}
          </Button>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={auto} onChange={(e) => { const v = e.target.checked; setAuto(v); iniciar(async () => { const r = await configurarAutomatico(v); if (!r.ok) { setAuto(!v); setMensaje({ ok: false, texto: r.error }); } }); }} />
            <span>
              Actualizar precios automáticamente cuando compre mercancía
              <span className="block text-xs text-muted-foreground">Solo productos con margen objetivo, máximo ±15 % por vez, todo queda en el historial.</span>
            </span>
          </label>
          {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
