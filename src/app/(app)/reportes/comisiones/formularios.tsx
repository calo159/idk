"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarComision, guardarMeta } from "./acciones";

const clase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormMeta({ mes, personas }: { mes: string; personas: { id: string; nombre: string }[] }) {
  const [estado, accion, pendiente] = useActionState(guardarMeta, null);
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Meta del mes</h2>
      <input type="hidden" name="mes" value={mes.slice(0, 7)} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="meta-u">Vendedor</Label>
          <select id="meta-u" name="usuario_id" className={clase}>{personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="meta-v">Meta de ventas ($)</Label><Input id="meta-v" name="meta" inputMode="decimal" className="h-11" /></div>
      </div>
      {estado && !estado.ok ? <p role="alert" className="text-sm text-destructive">{estado.campos?.meta ?? estado.error}</p> : null}
      {estado?.ok ? <p role="status" className="text-sm text-primary">Meta guardada.</p> : null}
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar meta"}</Button>
    </form>
  );
}

export function FormComision({ personas }: { personas: { id: string; nombre: string }[] }) {
  const [estado, accion, pendiente] = useActionState(guardarComision, null);
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Regla de comisión</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="com-u">Para</Label>
          <select id="com-u" name="usuario_id" className={clase} defaultValue=""><option value="">Todos (regla general)</option>{personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="com-b">Se calcula sobre</Label>
          <select id="com-b" name="base" className={clase} defaultValue="ventas"><option value="ventas">Ventas</option><option value="utilidad">Utilidad</option></select></div>
        <div className="space-y-1.5"><Label htmlFor="com-p">Porcentaje (%)</Label><Input id="com-p" name="porcentaje" inputMode="decimal" className="h-11" /></div>
        <div className="space-y-1.5"><Label htmlFor="com-bono">Bono si cumple la meta (+%)</Label><Input id="com-bono" name="bono" inputMode="decimal" className="h-11" /></div>
      </div>
      {estado && !estado.ok ? <p role="alert" className="text-sm text-destructive">{estado.campos?.porcentaje ?? estado.campos?.bono ?? estado.error}</p> : null}
      {estado?.ok ? <p role="status" className="text-sm text-primary">Regla guardada.</p> : null}
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar regla"}</Button>
    </form>
  );
}
