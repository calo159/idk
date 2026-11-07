"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ajustarInventario } from "./acciones";

export function FormAjuste({
  productoId,
  bodegas,
}: {
  productoId: string;
  bodegas: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(ajustarInventario, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const clase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Ajustar inventario</h2>
      <input type="hidden" name="producto_id" value={productoId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="modo">Tipo</Label>
          <select id="modo" name="modo" defaultValue="conteo" className={clase}>
            <option value="conteo">Conteo físico (lo que hay)</option>
            <option value="entrada">Entrada (+)</option>
            <option value="salida">Salida (−)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bodega_id">Bodega</Label>
          <select id="bodega_id" name="bodega_id" className={clase}>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cantidad">Cantidad</Label>
          <Input id="cantidad" name="cantidad" inputMode="decimal" className="h-11" />
          {e.cantidad ? <p className="text-xs text-destructive">{e.cantidad}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="costo">Costo unitario (solo entradas)</Label>
          <Input id="costo" name="costo" inputMode="decimal" className="h-11" />
          {e.costo ? <p className="text-xs text-destructive">{e.costo}</p> : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="motivo">Motivo (obligatorio)</Label>
        <Input
          id="motivo"
          name="motivo"
          placeholder="Ej. producto dañado, conteo del sábado"
          className="h-11"
        />
        {e.motivo ? <p className="text-xs text-destructive">{e.motivo}</p> : null}
      </div>
      {estado && !estado.ok && !Object.keys(e).length ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      {estado?.ok ? (
        <p role="status" className="text-sm text-primary">
          {Number(estado.datos.diferencia) === 0
            ? "Sin diferencias: no se registró movimiento."
            : `Ajuste registrado (${estado.datos.diferencia}).`}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Registrando…" : "Registrar ajuste"}
      </Button>
    </form>
  );
}
