"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoCantidad, leerNumeroCO } from "@/lib/dinero";
import { devolverVenta } from "../acciones";

export function DevolverVenta({ ventaId, lineas, tieneCliente }: {
  ventaId: string;
  lineas: { detalleId: string; nombre: string; vendida: number; devuelta: number }[];
  tieneCliente: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cant, setCant] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [reembolso, setReembolso] = useState("efectivo");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (!abierto) return <Button variant="outline" className="h-11 w-full" onClick={() => setAbierto(true)}>Registrar devolución del cliente</Button>;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Devolución del cliente</h2>
      <ul className="space-y-2">
        {lineas.map((l) => (
          <li key={l.detalleId} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{l.nombre} <span className="text-xs text-muted-foreground">(vendidas {formatoCantidad(l.vendida)}{l.devuelta > 0 ? `, ya devueltas ${formatoCantidad(l.devuelta)}` : ""})</span></span>
            <Input aria-label={`Devolver de ${l.nombre}`} inputMode="decimal" placeholder="0" className="h-10 w-20 text-right" value={cant[l.detalleId] ?? ""} onChange={(e) => setCant((c) => ({ ...c, [l.detalleId]: e.target.value }))} />
          </li>
        ))}
      </ul>
      <select aria-label="Cómo se devuelve el dinero" value={reembolso} onChange={(e) => setReembolso(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
        <option value="efectivo">Devolver efectivo (sale de tu caja)</option>
        <option value="nequi">Devolver por Nequi</option>
        <option value="daviplata">Devolver por Daviplata</option>
        <option value="transferencia">Devolver por transferencia</option>
        {tieneCliente ? <option value="abono_deuda">Abonar a lo que debe el cliente</option> : null}
      </select>
      <Input aria-label="Motivo de la devolución" placeholder="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-11" />
      <Button className="h-11 w-full" disabled={pendiente} onClick={() =>
        iniciar(async () => {
          const items = lineas.map((l) => ({ venta_detalle_id: l.detalleId, cantidad: leerNumeroCO(cant[l.detalleId] ?? "")?.toNumber() ?? 0 })).filter((x) => x.cantidad > 0);
          const r = await devolverVenta({ venta_id: ventaId, motivo, reembolso, lineas: items });
          setMensaje({ ok: r.ok, texto: r.ok ? "Devolución registrada: la mercancía volvió al inventario." : r.error });
        })}>
        {pendiente ? "Registrando…" : "Registrar devolución"}
      </Button>
      {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
    </div>
  );
}
