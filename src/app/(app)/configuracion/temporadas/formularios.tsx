"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { alternarTemporada, cargarBase, guardarTemporada } from "./acciones";

export function FormTemporada({ categorias }: { categorias: { id: string; nombre: string }[] }) {
  const [estado, accion, pendiente] = useActionState(guardarTemporada, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const err = (k: string) => (e[k] ? <p className="text-xs text-destructive">{e[k]}</p> : null);
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Nueva temporada</h2>
      <div className="space-y-1.5"><Label htmlFor="t-nombre">Nombre</Label><Input id="t-nombre" name="nombre" className="h-11" />{err("nombre")}</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="t-desde">Desde (cada año)</Label><Input id="t-desde" name="desde" type="text" placeholder="12-01" pattern="\d{2}-\d{2}" className="h-11" />{err("desde")}<p className="text-[11px] text-muted-foreground">mes-día, ej. 12-01</p></div>
        <div className="space-y-1.5"><Label htmlFor="t-hasta">Hasta</Label><Input id="t-hasta" name="hasta" type="text" placeholder="01-06" pattern="\d{2}-\d{2}" className="h-11" />{err("hasta")}</div>
        <div className="space-y-1.5"><Label htmlFor="t-factor">Se vende (×)</Label><Input id="t-factor" name="factor" inputMode="decimal" placeholder="1,5" className="h-11" />{err("factor")}</div>
        <div className="space-y-1.5">
          <Label htmlFor="t-cat">Aplica a</Label>
          <select id="t-cat" name="categoria_id" defaultValue="" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Todo el negocio</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>
      {estado && !estado.ok && !Object.keys(e).length ? <p role="alert" className="text-sm text-destructive">{estado.error}</p> : null}
      {estado?.ok ? <p role="status" className="text-sm text-primary">Guardada.</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar temporada"}</Button>
    </form>
  );
}

export function BotonActivar({ id, activa }: { id: string; activa: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return <Button variant="outline" size="sm" disabled={pendiente} onClick={() => iniciar(async () => void (await alternarTemporada(id, !activa)))}>{activa ? "Pausar" : "Activar"}</Button>;
}

export function BotonCargarBase() {
  const [pendiente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button variant="outline" className="h-11 w-full" disabled={pendiente} onClick={() => iniciar(async () => { const r = await cargarBase(); setMsg(r.ok ? (r.datos.creadas ? `${r.datos.creadas} temporada(s) cargadas.` : "Ya tenías todas.") : r.error); })}>
        {pendiente ? "Cargando…" : "Cargar temporadas típicas de Colombia"}
      </Button>
      {msg ? <p role="status" className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
