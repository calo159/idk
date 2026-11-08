"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reintentarFactura, solicitarFactura } from "./factura-acciones";

export interface FacturaVista {
  id: string;
  estado: string;
  numeroCompleto: string;
  ambiente: string;
  cufe: string | null;
  error: string | null;
  pdfUrl: string | null;
}

const ETIQUETA: Record<string, string> = { pendiente: "En cola de envío", enviando: "Enviándose…", aceptada: "Aceptada", rechazada: "Rechazada", error: "Error de envío" };

export function FacturaElectronica({ ventaId, factura, puedeFacturar }: { ventaId: string; factura: FacturaVista | null; puedeFacturar: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (fn: () => Promise<{ ok: boolean } & ({ ok: true } | { ok: false; error: string })>) =>
    iniciar(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError((r as { error: string }).error);
    });

  return (
    <section className="space-y-2 rounded-xl border p-4 text-sm">
      <h2 className="font-medium">Factura electrónica</h2>
      {factura ? (
        <>
          <p>
            <span className="font-medium">{factura.numeroCompleto}</span> · {ETIQUETA[factura.estado] ?? factura.estado}
            {factura.ambiente === "pruebas" ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Pruebas · sin validez fiscal</span> : null}
          </p>
          {factura.cufe ? <p className="break-all text-xs text-muted-foreground">CUFE: {factura.cufe}</p> : null}
          {factura.pdfUrl ? <a href={factura.pdfUrl} target="_blank" rel="noreferrer" className="text-primary underline">Ver PDF</a> : null}
          {factura.error ? <p className="text-destructive">{factura.error}</p> : null}
          {puedeFacturar && (factura.estado === "rechazada" || factura.estado === "error") ? (
            <Button size="sm" variant="outline" disabled={pendiente} onClick={() => correr(() => reintentarFactura(factura.id, ventaId))}>{pendiente ? "Reintentando…" : "Corregir y reintentar"}</Button>
          ) : null}
        </>
      ) : puedeFacturar ? (
        <>
          <p className="text-muted-foreground">Esta venta aún no tiene factura electrónica.</p>
          <Button size="sm" disabled={pendiente} onClick={() => correr(() => solicitarFactura(ventaId))}>{pendiente ? "Facturando…" : "Facturar electrónicamente"}</Button>
        </>
      ) : (
        <p className="text-muted-foreground">Sin factura electrónica.</p>
      )}
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    </section>
  );
}
