"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLES } from "@/lib/permisos";
import { activarMiembro, cambiarRol, cancelarInvitacion, invitarUsuario } from "./acciones";

const ROLES_INVITABLES = ROLES.filter((r) => r.valor !== "dueno");

export function FormInvitar({ urlBase }: { urlBase: string }) {
  const [estado, accion, pendiente] = useActionState(invitarUsuario, null);
  const enlace = estado?.ok ? `${urlBase}/invitacion/${estado.datos.token}` : null;
  const correo = (estado && !estado.ok ? estado.campos?.correo : undefined) ?? null;

  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Invitar a alguien</h2>
      <div className="space-y-1.5">
        <Label htmlFor="correo">Correo</Label>
        <Input id="correo" name="correo" type="email" className="h-11" />
        {correo ? <p className="text-xs text-destructive">{correo}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre (opcional)</Label>
        <Input id="nombre" name="nombre" className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rol">Rol</Label>
        <select
          id="rol"
          name="rol"
          defaultValue="vendedor"
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        >
          {ROLES_INVITABLES.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.etiqueta} — {r.descripcion}
            </option>
          ))}
        </select>
      </div>
      {estado && !estado.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      {enlace ? (
        <div role="status" className="space-y-2 rounded-lg bg-primary/10 p-3 text-sm">
          <p className="font-medium">Invitación creada. Compártela por WhatsApp:</p>
          <p className="font-mono text-xs break-all">{enlace}</p>
          <a
            className="inline-block text-primary underline"
            href={`https://wa.me/?text=${encodeURIComponent(`Te invito a Surtix: ${enlace}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir WhatsApp
          </a>
        </div>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Creando…" : "Crear invitación"}
      </Button>
    </form>
  );
}

export function SelectorRol({
  miembroId,
  rol,
  bloqueado,
}: {
  miembroId: string;
  rol: string;
  bloqueado: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  return (
    <select
      aria-label="Rol"
      defaultValue={rol}
      disabled={bloqueado || pendiente}
      onChange={(e) => iniciar(async () => void (await cambiarRol(miembroId, e.target.value)))}
      className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
    >
      {ROLES.map((r) => (
        <option key={r.valor} value={r.valor} disabled={r.valor === "dueno" && rol !== "dueno"}>
          {r.etiqueta}
        </option>
      ))}
    </select>
  );
}

export function BotonActivar({
  miembroId,
  activo,
  bloqueado,
}: {
  miembroId: string;
  activo: boolean;
  bloqueado: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={bloqueado || pendiente}
      onClick={() => iniciar(async () => void (await activarMiembro(miembroId, !activo)))}
    >
      {activo ? "Desactivar" : "Activar"}
    </Button>
  );
}

export function BotonCancelar({ invitacionId }: { invitacionId: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pendiente}
      onClick={() => iniciar(async () => void (await cancelarInvitacion(invitacionId)))}
    >
      Cancelar
    </Button>
  );
}
