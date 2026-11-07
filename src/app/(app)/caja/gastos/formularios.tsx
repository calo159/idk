"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIAS_GASTO } from "@/lib/validaciones/gastos";
import { anularGasto, moverEfectivo, registrarGasto } from "./acciones";

const selectClase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormGasto({ turnoId }: { turnoId: string | null }) {
  const [estado, accion, pendiente] = useActionState(registrarGasto, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const err = (k: string) => (e[k] ? <p className="text-xs text-destructive">{e[k]}</p> : null);
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Registrar gasto</h2>
      {turnoId ? <input type="hidden" name="turno_id" value={turnoId} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="categoria">Categoría</Label>
          <select id="categoria" name="categoria" className={selectClase} defaultValue="">
            <option value="" disabled>Elige…</option>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {err("categoria")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="metodo">Se pagó con</Label>
          <select id="metodo" name="metodo" className={selectClase} defaultValue="efectivo">
            <option value="efectivo">Efectivo de la caja</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
          {err("metodo")}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="descripcion">Descripción</Label>
        <Input id="descripcion" name="descripcion" className="h-11" />
        {err("descripcion")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="monto">Monto ($)</Label>
          <Input id="monto" name="monto" inputMode="decimal" className="h-11" />
          {err("monto")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fecha">Fecha (opcional)</Label>
          <Input id="fecha" name="fecha" type="date" className="h-11" />
          {err("fecha")}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="soporte">Foto del soporte (factura o recibo)</Label>
        <Input id="soporte" name="soporte" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="h-11" />
        {err("soporte")}
      </div>
      {estado && !estado.ok && !Object.keys(e).length ? (
        <p role="alert" className="text-sm text-destructive">{estado.error}</p>
      ) : null}
      {estado?.ok ? <p role="status" className="text-sm text-primary">Gasto registrado.</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Registrar gasto"}
      </Button>
    </form>
  );
}

export function BotonAnularGasto({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant="ghost"
        size="sm"
        disabled={pendiente}
        onClick={() => {
          const motivo = window.prompt("¿Por qué se anula este gasto?");
          if (!motivo) return;
          iniciar(async () => {
            const r = await anularGasto(id, motivo);
            setError(r.ok ? null : (r.campos?.motivo ?? r.error));
          });
        }}
      >
        Anular
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}

export function FormMovimientoCaja({ turnoId }: { turnoId: string }) {
  const [estado, accion, pendiente] = useActionState(moverEfectivo, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Retiro o ingreso de efectivo</h2>
      <input type="hidden" name="turno_id" value={turnoId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Movimiento</Label>
          <select id="tipo" name="tipo" className={selectClase} defaultValue="retiro">
            <option value="retiro">Retiro (sale plata)</option>
            <option value="ingreso">Ingreso (entra plata)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="monto-mov">Monto ($)</Label>
          <Input id="monto-mov" name="monto" inputMode="decimal" className="h-11" />
          {e.monto ? <p className="text-xs text-destructive">{e.monto}</p> : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="motivo-mov">Motivo (obligatorio)</Label>
        <Input id="motivo-mov" name="motivo" placeholder="Ej. consignación al banco" className="h-11" />
        {e.motivo ? <p className="text-xs text-destructive">{e.motivo}</p> : null}
      </div>
      {estado && !estado.ok && !Object.keys(e).length ? (
        <p role="alert" className="text-sm text-destructive">{estado.error}</p>
      ) : null}
      {estado?.ok ? <p role="status" className="text-sm text-primary">Movimiento registrado.</p> : null}
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Registrar movimiento"}
      </Button>
    </form>
  );
}
