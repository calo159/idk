"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarWhatsApp } from "./acciones";

export function FormWhatsApp({ actual, numeroId }: { actual: string | null; numeroId?: string | null }) {
  const [estado, accion, pendiente] = useActionState(guardarWhatsApp, null);
  return (
    <form action={accion} className="space-y-2 rounded-xl border p-4" noValidate>
      <label htmlFor="wa-dueno" className="text-sm font-medium">WhatsApp para alertas</label>
      <p className="text-xs text-muted-foreground">Aquí te avisamos de faltantes de caja, comprobantes sospechosos, anulaciones y stock bajo.</p>
      <Input id="wa-dueno" name="telefono" inputMode="tel" defaultValue={actual ?? ""} placeholder="3001234567" className="h-11" />
      <label htmlFor="wa-numero-id" className="block pt-1 text-sm font-medium">ID del número de WhatsApp Business (para pedidos de clientes)</label>
      <Input id="wa-numero-id" name="numero_id" inputMode="numeric" defaultValue={numeroId ?? ""} placeholder="Opcional" className="h-11" />
      {estado && !estado.ok && estado.campos?.numero_id ? <p role="alert" className="text-sm text-destructive">{estado.campos.numero_id}</p> : null}
      {estado && !estado.ok ? <p role="alert" className="text-sm text-destructive">{estado.campos?.telefono ?? estado.error}</p> : null}
      {estado?.ok ? <p role="status" className="text-sm text-primary">Guardado.</p> : null}
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button>
    </form>
  );
}
