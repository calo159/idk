"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatoCantidad, leerNumeroCO } from "@/lib/dinero";
import { cambiarEstadoOrden, recibirOrden } from "../acciones";

export interface LineaRecibo {
  detalleId: string;
  nombre: string;
  pedida: number;
  recibida: number;
  costo: number;
}

export function PanelOrden({ ordenId, estado, lineas, puedeGestionar }: { ordenId: string; estado: string; lineas: LineaRecibo[]; puedeGestionar: boolean }) {
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(lineas.map((l) => [l.detalleId, String(Math.max(l.pedida - l.recibida, 0))])),
  );
  const [costos, setCostos] = useState<Record<string, string>>({});
  const [factura, setFactura] = useState("");
  const [condicion, setCondicion] = useState<"contado" | "credito">("contado");
  const [dias, setDias] = useState("30");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (!puedeGestionar) return null;

  const puedeRecibir = ["borrador", "enviada", "recibida_parcial"].includes(estado);

  return (
    <div className="space-y-4">
      {estado === "borrador" ? (
        <Button className="h-11 w-full" disabled={pendiente} onClick={() => iniciar(async () => { const r = await cambiarEstadoOrden(ordenId, "enviada"); setMensaje({ ok: r.ok, texto: r.ok ? "Orden marcada como enviada" : r.error }); })}>
          Marcar como enviada al proveedor
        </Button>
      ) : null}

      {puedeRecibir ? (
        <div className="space-y-3 rounded-xl border p-4">
          <h2 className="font-medium">Recibir mercancía</h2>
          <p className="text-xs text-muted-foreground">Escribe lo que llegó (puede ser parcial). Si el costo de la factura cambió, corrígelo.</p>
          <ul className="space-y-2">
            {lineas.map((l) => (
              <li key={l.detalleId} className="space-y-1">
                <p className="text-sm">{l.nombre} <span className="text-xs text-muted-foreground">(pedido {formatoCantidad(l.pedida)}, ya recibido {formatoCantidad(l.recibida)})</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label={`Llegó de ${l.nombre}`} inputMode="decimal" className="h-10" value={cantidades[l.detalleId] ?? ""} onChange={(e) => setCantidades((c) => ({ ...c, [l.detalleId]: e.target.value }))} />
                  <Input aria-label={`Costo de ${l.nombre}`} inputMode="decimal" className="h-10" placeholder={`Costo ($ ${l.costo})`} value={costos[l.detalleId] ?? ""} onChange={(e) => setCostos((c) => ({ ...c, [l.detalleId]: e.target.value }))} />
                </div>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="fact-oc">N.º de factura</Label><Input id="fact-oc" className="h-11" value={factura} onChange={(e) => setFactura(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="cond-oc">Pago</Label>
              <select id="cond-oc" value={condicion} onChange={(e) => setCondicion(e.target.value as "contado" | "credito")} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
                <option value="contado">De contado</option>
                <option value="credito">A crédito</option>
              </select>
            </div>
          </div>
          {condicion === "credito" ? (
            <div className="space-y-1.5"><Label htmlFor="dias-oc">Días de crédito</Label><Input id="dias-oc" inputMode="numeric" className="h-11" value={dias} onChange={(e) => setDias(e.target.value)} /></div>
          ) : null}
          <Button className="h-12 w-full" disabled={pendiente} onClick={() =>
            iniciar(async () => {
              const r = await recibirOrden({
                orden_id: ordenId,
                factura,
                condicion,
                dias_credito: Number(dias) || 0,
                lineas: lineas.map((l) => ({
                  detalle_id: l.detalleId,
                  cantidad: leerNumeroCO(cantidades[l.detalleId] ?? "")?.toNumber() ?? 0,
                  costo: costos[l.detalleId] ? leerNumeroCO(costos[l.detalleId]!)?.toNumber() : undefined,
                })),
              });
              setMensaje({ ok: r.ok, texto: r.ok ? "Mercancía recibida: el inventario ya se actualizó." : r.error });
            })}>
            {pendiente ? "Registrando…" : "Registrar recepción"}
          </Button>
        </div>
      ) : null}

      {["borrador", "enviada"].includes(estado) ? (
        <Button variant="ghost" size="sm" disabled={pendiente} onClick={() => { if (window.confirm("¿Cancelar esta orden?")) iniciar(async () => { const r = await cambiarEstadoOrden(ordenId, "cancelada"); setMensaje({ ok: r.ok, texto: r.ok ? "Orden cancelada" : r.error }); }); }}>
          Cancelar orden
        </Button>
      ) : null}
      {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
    </div>
  );
}
