"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LineaSelector, type ProductoSelector, SelectorLineas, lineasParaEnviar } from "@/components/selector-lineas";
import { crearCotizacion } from "../acciones";

export function FormularioCotizacion({ catalogo, clientes }: { catalogo: ProductoSelector[]; clientes: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [lineas, setLineas] = useState<LineaSelector[]>([]);
  const [cliente, setCliente] = useState("");
  const [vigencia, setVigencia] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cli-cot">Cliente (opcional)</Label>
          <select id="cli-cot" value={cliente} onChange={(e) => setCliente(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Sin cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vig-cot">Válida hasta</Label>
          <Input id="vig-cot" type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} className="h-11" />
        </div>
      </div>
      <SelectorLineas catalogo={catalogo} lineas={lineas} onChange={setLineas} />
      <div className="space-y-1.5"><Label htmlFor="nota-cot">Nota</Label><Input id="nota-cot" value={nota} onChange={(e) => setNota(e.target.value)} className="h-11" /></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="h-12 w-full" disabled={pendiente || lineas.length === 0} onClick={() =>
        iniciar(async () => {
          setError(null);
          const r = await crearCotizacion({ cliente_id: cliente || null, vigencia_hasta: vigencia, nota, lineas: lineasParaEnviar(lineas) });
          if (r.ok) router.push("/ventas/cotizaciones");
          else setError(r.error);
        })}>
        {pendiente ? "Guardando…" : "Guardar cotización"}
      </Button>
    </div>
  );
}
