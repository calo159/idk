"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatoCantidad } from "@/lib/dinero";
import { cancelarConteo, cerrarConteo, contarProducto, iniciarConteo } from "./acciones";

const clase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormNuevoConteo({ bodegas, categorias }: { bodegas: { id: string; nombre: string }[]; categorias: { id: string; nombre: string }[] }) {
  const [estado, accion, pendiente] = useActionState(iniciarConteo, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Nuevo conteo físico</h2>
      <div className="space-y-1.5">
        <Label htmlFor="nombre-conteo">Nombre</Label>
        <Input id="nombre-conteo" name="nombre" placeholder="Ej. Conteo de fin de mes" className="h-11" />
        {e.nombre ? <p className="text-xs text-destructive">{e.nombre}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bodega-conteo">Bodega</Label>
          <select id="bodega-conteo" name="bodega_id" className={clase}>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-conteo">Solo categoría</Label>
          <select id="cat-conteo" name="categoria_id" className={clase} defaultValue="">
            <option value="">Todo el inventario</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>
      {estado && !estado.ok && !Object.keys(e).length ? <p role="alert" className="text-sm text-destructive">{estado.error}</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Preparando…" : "Empezar conteo"}</Button>
    </form>
  );
}

export interface LineaConteo {
  productoId: string;
  nombre: string;
  unidad: string;
  contada: number | null;
  /** Solo se envía al dueño/admin y con el conteo cerrado. */
  sistema: number | null;
  costo: number | null;
}

/** Pantalla de conteo "ciego": quien cuenta no ve lo que dice el sistema. */
export function ListaConteo({ conteoId, lineas, abierto }: { conteoId: string; lineas: LineaConteo[]; abierto: boolean }) {
  const [guardadas, setGuardadas] = useState<Record<string, string | "error">>({});
  const [filtro, setFiltro] = useState("");
  const visibles = lineas.filter((l) => l.nombre.toLowerCase().includes(filtro.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <Input aria-label="Buscar producto" placeholder="Buscar producto…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-11" />
      <ul className="divide-y rounded-xl border text-sm">
        {visibles.map((l) => (
          <li key={l.productoId} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{l.nombre}</span>
              {!abierto && l.contada !== null && l.sistema !== null ? (
                <span className={`block text-xs ${l.contada === l.sistema ? "text-muted-foreground" : "text-destructive"}`}>
                  Sistema {formatoCantidad(l.sistema)} · contado {formatoCantidad(l.contada)} · dif. {formatoCantidad(l.contada - l.sistema)}
                </span>
              ) : null}
            </span>
            {abierto ? (
              <>
                <Input
                  aria-label={`Contado de ${l.nombre}`}
                  inputMode="decimal"
                  className="h-10 w-24 text-right"
                  defaultValue={l.contada === null ? "" : String(l.contada)}
                  onBlur={async (e) => {
                    if (e.target.value.trim() === "") return;
                    const r = await contarProducto(conteoId, l.productoId, e.target.value);
                    setGuardadas((g) => ({ ...g, [l.productoId]: r.ok ? "ok" : "error" }));
                  }}
                />
                <span className="w-5 text-center" aria-live="polite">
                  {guardadas[l.productoId] === "ok" || l.contada !== null ? "✓" : ""}
                  {guardadas[l.productoId] === "error" ? "⚠" : ""}
                </span>
              </>
            ) : (
              <span className="tabular-nums">{l.contada === null ? "—" : formatoCantidad(l.contada)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccionesCierreConteo({ conteoId }: { conteoId: string }) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const cerrar = (aplicar: boolean) => {
    const texto = aplicar
      ? "Se corregirá el inventario con ajustes según lo contado. ¿Continuar?"
      : "Se cerrará el conteo SIN cambiar el inventario (solo queda el reporte). ¿Continuar?";
    if (!window.confirm(texto)) return;
    iniciar(async () => {
      const r = await cerrarConteo(conteoId, aplicar);
      setMensaje(r.ok ? `Conteo cerrado: ${r.datos.diferencias} producto(s) con diferencia.` : r.error);
    });
  };
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <h2 className="font-medium">Cerrar el conteo</h2>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-11" disabled={pendiente} onClick={() => cerrar(false)}>Solo reporte</Button>
        <Button className="h-11" disabled={pendiente} onClick={() => cerrar(true)}>Corregir inventario</Button>
      </div>
      <Button variant="ghost" size="sm" disabled={pendiente} onClick={() => { if (window.confirm("¿Cancelar este conteo?")) iniciar(async () => { await cancelarConteo(conteoId); }); }}>
        Cancelar conteo
      </Button>
      {mensaje ? <p role="status" className="text-sm">{mensaje}</p> : null}
    </div>
  );
}
