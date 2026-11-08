"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearDistribuidorAdmin } from "./acciones";

/** Alta de un distribuidor: la persona que lo administra debe haberse registrado antes en Surtix. */
export function NuevoDistribuidor() {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ nombre: "", nit: "", telefono: "", correo: "" });
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const campo = (k: keyof typeof f, etiqueta: string) => (
    <div className="space-y-1">
      <label htmlFor={`d-${k}`} className="text-xs">{etiqueta}</label>
      <Input id={`d-${k}`} className="h-11" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
    </div>
  );
  if (!abierto) return <Button variant="outline" className="h-11 w-full" onClick={() => setAbierto(true)}>+ Dar de alta un distribuidor</Button>;
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await crearDistribuidorAdmin(f);
          setAviso(r.ok ? { ok: true, texto: "Distribuidor creado: ya puede entrar a /distribuidor." } : { ok: false, texto: r.error });
          if (r.ok) setF({ nombre: "", nit: "", telefono: "", correo: "" });
        });
      }}
    >
      <h2 className="font-medium">Nuevo distribuidor</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("nombre", "Nombre del distribuidor")}
        {campo("correo", "Correo de quien lo administra (ya registrado)")}
        {campo("nit", "NIT (opcional)")}
        {campo("telefono", "Teléfono (opcional)")}
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={pendiente}>{pendiente ? "Creando…" : "Crear distribuidor"}</Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setAbierto(false)}>Cerrar</Button>
      </div>
      {aviso ? <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto}</p> : null}
    </form>
  );
}
