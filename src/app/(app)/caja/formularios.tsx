"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DENOMINACIONES, type Conteo, estadoCierre, totalConteo } from "@/lib/caja";
import { formatoCOP } from "@/lib/dinero";
import { type ResultadoCierre, abrirTurno, cerrarTurno } from "./acciones";

export function FormAbrirCaja({ bodegas = [] }: { bodegas?: { id: string; nombre: string }[] }) {
  const [estado, accion, pendiente] = useActionState(abrirTurno, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Abrir caja</h2>
      <p className="text-sm text-muted-foreground">
        Cuenta el efectivo con el que empiezas (la base) y escríbelo.
      </p>
      {bodegas.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="bodega_id">¿Desde qué bodega vendes?</Label>
          <select id="bodega_id" name="bodega_id" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>{b.nombre}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="base_inicial">Base en efectivo ($)</Label>
        <Input id="base_inicial" name="base_inicial" inputMode="decimal" defaultValue="0" className="h-12 text-lg" />
        {e.base_inicial ? <p className="text-xs text-destructive">{e.base_inicial}</p> : null}
      </div>
      {estado && !estado.ok && !Object.keys(e).length ? (
        <p role="alert" className="text-sm text-destructive">{estado.error}</p>
      ) : null}
      <Button type="submit" className="h-12 w-full" disabled={pendiente}>
        {pendiente ? "Abriendo…" : "Abrir caja"}
      </Button>
    </form>
  );
}

export function FormCerrarCaja({ turnoId }: { turnoId: string }) {
  const [conteo, setConteo] = useState<Conteo>({});
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCierre | null>(null);
  const [pendiente, iniciar] = useTransition();
  const contado = totalConteo(conteo);

  if (resultado) {
    const estado = estadoCierre(resultado.diferencia);
    return (
      <div role="status" className="space-y-3 rounded-xl border p-5 text-center">
        <h2 className="text-lg font-semibold">Caja cerrada</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>Esperado</dt><dd className="tabular-nums">{formatoCOP(resultado.esperado)}</dd></div>
          <div className="flex justify-between"><dt>Contado</dt><dd className="tabular-nums">{formatoCOP(resultado.contado)}</dd></div>
        </dl>
        <p
          className={`rounded-lg p-3 text-lg font-semibold ${
            estado === "cuadra" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          }`}
        >
          {estado === "cuadra"
            ? "La caja cuadra ✔"
            : estado === "faltante"
              ? `Faltan ${formatoCOP(Math.abs(Number(resultado.diferencia)))}`
              : `Sobran ${formatoCOP(resultado.diferencia)}`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Cerrar caja</h2>
      <p className="text-sm text-muted-foreground">
        Cuenta todo el efectivo que hay en la caja. El sistema compara contra lo que debería haber.
      </p>
      <ul className="grid grid-cols-2 gap-3">
        {DENOMINACIONES.map((den) => (
          <li key={den} className="space-y-1">
            <Label htmlFor={`den-${den}`} className="text-xs text-muted-foreground">
              {formatoCOP(den)}
            </Label>
            <Input
              id={`den-${den}`}
              inputMode="numeric"
              placeholder="0"
              className="h-11"
              onChange={(e) => {
                const n = Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0));
                setConteo((c) => ({ ...c, [String(den)]: n }));
              }}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between text-lg font-semibold">
        <span>Total contado</span>
        <span className="tabular-nums">{formatoCOP(contado)}</span>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button
        className="h-12 w-full"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm(`¿Cerrar la caja con ${formatoCOP(contado)} contados?`)) return;
          setError(null);
          iniciar(async () => {
            const r = await cerrarTurno({ turno_id: turnoId, conteo });
            if (r.ok) setResultado(r.datos);
            else setError(r.error);
          });
        }}
      >
        {pendiente ? "Cerrando…" : "Cerrar caja"}
      </Button>
    </div>
  );
}
