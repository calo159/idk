"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarCliente, registrarAbono } from "./acciones";

export interface ClienteForm {
  id?: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  cupo_credito: number;
  acepta_mensajes: boolean;
}

export function FormCliente({ cliente, puedeCupo }: { cliente?: ClienteForm; puedeCupo: boolean }) {
  const [estado, accion, pendiente] = useActionState(guardarCliente, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const campo = (
    nombre: string,
    etiqueta: string,
    valor: string | number | null | undefined,
    extra: { tipo?: string; modo?: "numeric" | "tel" | "decimal"; deshabilitado?: boolean } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={nombre}>{etiqueta}</Label>
      <Input
        id={nombre}
        name={nombre}
        type={extra.tipo}
        inputMode={extra.modo}
        disabled={extra.deshabilitado}
        defaultValue={valor ?? ""}
        className="h-11"
      />
      {e[nombre] ? <p className="text-xs text-destructive">{e[nombre]}</p> : null}
    </div>
  );
  return (
    <form action={accion} className="space-y-3" noValidate>
      {cliente?.id ? <input type="hidden" name="id" value={cliente.id} /> : null}
      {campo("nombre", "Nombre", cliente?.nombre)}
      <div className="grid grid-cols-2 gap-3">
        {campo("telefono", "Celular / WhatsApp", cliente?.telefono, { modo: "tel" })}
        {campo("documento", "Cédula / NIT", cliente?.documento, { modo: "numeric" })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {campo("fecha_nacimiento", "Cumpleaños", cliente?.fecha_nacimiento, { tipo: "date" })}
        {campo("cupo_credito", "Cupo de fiado ($)", cliente?.cupo_credito ?? 0, {
          modo: "decimal",
          deshabilitado: !puedeCupo,
        })}
      </div>
      {!puedeCupo ? (
        <p className="text-xs text-muted-foreground">Solo el dueño o un administrador cambia el cupo.</p>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="acepta_mensajes" defaultChecked={cliente?.acepta_mensajes ?? true} className="size-4" />
        Acepta mensajes por WhatsApp
      </label>
      {estado && !estado.ok && !Object.keys(e).length ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : cliente?.id ? "Guardar cambios" : "Crear cliente"}
      </Button>
    </form>
  );
}

export function FormAbono({ clienteId, saldo }: { clienteId: string; saldo: number }) {
  const [estado, accion, pendiente] = useActionState(registrarAbono, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Registrar abono</h2>
      <input type="hidden" name="cliente_id" value={clienteId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="monto">Monto ($)</Label>
          <Input id="monto" name="monto" inputMode="decimal" defaultValue={saldo > 0 ? String(saldo) : ""} className="h-11" />
          {e.monto ? <p className="text-xs text-destructive">{e.monto}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="metodo">Método</Label>
          <select
            id="metodo"
            name="metodo"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            defaultValue="efectivo"
          >
            <option value="efectivo">Efectivo</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
          </select>
        </div>
      </div>
      {estado && !estado.ok && !Object.keys(e).length ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      {estado?.ok ? (
        <p role="status" className="text-sm text-primary">
          Abono registrado.
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente || saldo <= 0}>
        {pendiente ? "Registrando…" : "Registrar abono"}
      </Button>
    </form>
  );
}
