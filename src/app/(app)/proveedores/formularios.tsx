"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activarProveedor, guardarProveedor } from "./acciones";

export interface ProveedorForm {
  id?: string;
  nombre: string;
  nit: string | null;
  telefono: string | null;
  contacto: string | null;
}

export function FormProveedor({ proveedor }: { proveedor?: ProveedorForm }) {
  const [estado, accion, pendiente] = useActionState(guardarProveedor, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const id = proveedor?.id ?? "nuevo";
  const campo = (
    nombre: keyof Omit<ProveedorForm, "id">,
    etiqueta: string,
    modo?: "numeric" | "tel",
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${nombre}`}>{etiqueta}</Label>
      <Input
        id={`${id}-${nombre}`}
        name={nombre}
        inputMode={modo}
        defaultValue={proveedor?.[nombre] ?? ""}
        className="h-11"
      />
      {e[nombre] ? <p className="text-xs text-destructive">{e[nombre]}</p> : null}
    </div>
  );
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">{proveedor?.id ? "Editar proveedor" : "Nuevo proveedor"}</h2>
      {proveedor?.id ? <input type="hidden" name="id" value={proveedor.id} /> : null}
      {campo("nombre", "Nombre")}
      <div className="grid grid-cols-2 gap-3">
        {campo("nit", "NIT (opcional)")}
        {campo("telefono", "Celular / WhatsApp", "tel")}
      </div>
      {campo("contacto", "Persona de contacto")}
      {estado && !estado.ok && !Object.keys(e).length ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      {estado?.ok ? (
        <p role="status" className="text-sm text-primary">
          Guardado.
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

export function BotonActivarProveedor({ id, activo }: { id: string; activo: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pendiente}
      onClick={() => iniciar(async () => void (await activarProveedor(id, !activo)))}
    >
      {activo ? "Desactivar" : "Reactivar"}
    </Button>
  );
}
