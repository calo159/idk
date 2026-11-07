"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoCantidad, leerNumeroCO } from "@/lib/dinero";
import { devolverAProveedor } from "../ordenes/acciones";

export function DevolverAProveedor({ compraId, proveedorId, bodegaId, lineas }: {
  compraId: string;
  proveedorId: string;
  bodegaId: string;
  lineas: { productoId: string; nombre: string; cantidad: number }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [cant, setCant] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) return <Button variant="outline" className="h-11 w-full" onClick={() => setAbierto(true)}>Devolver mercancía al proveedor</Button>;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Devolución al proveedor</h2>
      <p className="text-xs text-muted-foreground">Sale del inventario y, si esta compra se debe, baja la deuda.</p>
      <ul className="space-y-2">
        {lineas.map((l) => (
          <li key={l.productoId} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{l.nombre} <span className="text-xs text-muted-foreground">(compraste {formatoCantidad(l.cantidad)})</span></span>
            <Input aria-label={`Devolver de ${l.nombre}`} inputMode="decimal" className="h-10 w-24 text-right" placeholder="0" value={cant[l.productoId] ?? ""} onChange={(e) => setCant((c) => ({ ...c, [l.productoId]: e.target.value }))} />
          </li>
        ))}
      </ul>
      <Input aria-label="Motivo de la devolución" placeholder="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-11" />
      <Button className="h-11 w-full" disabled={pendiente} onClick={() =>
        iniciar(async () => {
          const items = lineas
            .map((l) => ({ producto_id: l.productoId, cantidad: leerNumeroCO(cant[l.productoId] ?? "")?.toNumber() ?? 0 }))
            .filter((x) => x.cantidad > 0);
          const r = await devolverAProveedor({ proveedor_id: proveedorId, bodega_id: bodegaId, compra_id: compraId, motivo, lineas: items });
          setMensaje({ ok: r.ok, texto: r.ok ? "Devolución registrada." : r.error });
        })}>
        {pendiente ? "Registrando…" : "Registrar devolución"}
      </Button>
      {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
    </div>
  );
}
