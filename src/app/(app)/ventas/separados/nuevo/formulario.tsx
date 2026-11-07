"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LineaSelector, type ProductoSelector, SelectorLineas, lineasParaEnviar } from "@/components/selector-lineas";
import { leerNumeroCO } from "@/lib/dinero";
import { crearSeparado } from "../acciones";

export function FormularioSeparado({ catalogo, clientes, bodegaId }: { catalogo: ProductoSelector[]; clientes: { id: string; nombre: string }[]; bodegaId: string }) {
  const router = useRouter();
  const [lineas, setLineas] = useState<LineaSelector[]>([]);
  const [cliente, setCliente] = useState(clientes[0]?.id ?? "");
  const [limite, setLimite] = useState("");
  const [abono, setAbono] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cli-sep">Cliente</Label>
        <select id="cli-sep" value={cliente} onChange={(e) => setCliente(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <SelectorLineas catalogo={catalogo} lineas={lineas} onChange={setLineas} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="abono-sep">Abono inicial ($)</Label><Input id="abono-sep" inputMode="decimal" value={abono} onChange={(e) => setAbono(e.target.value)} className="h-11" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="met-sep">Se recibió por</Label>
          <select id="met-sep" value={metodo} onChange={(e) => setMetodo(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="efectivo">Efectivo</option><option value="nequi">Nequi</option><option value="daviplata">Daviplata</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option>
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="lim-sep">Plazo para pagar</Label><Input id="lim-sep" type="date" value={limite} onChange={(e) => setLimite(e.target.value)} className="h-11" /></div>
        <div className="space-y-1.5"><Label htmlFor="nota-sep">Nota</Label><Input id="nota-sep" value={nota} onChange={(e) => setNota(e.target.value)} className="h-11" /></div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="h-12 w-full" disabled={pendiente || lineas.length === 0 || !cliente} onClick={() =>
        iniciar(async () => {
          setError(null);
          const r = await crearSeparado({
            cliente_id: cliente, bodega_id: bodegaId, fecha_limite: limite, nota,
            abono_inicial: leerNumeroCO(abono)?.toNumber() ?? 0, metodo, lineas: lineasParaEnviar(lineas),
          });
          if (r.ok) router.push("/ventas/separados");
          else setError(r.error);
        })}>
        {pendiente ? "Guardando…" : "Crear separado"}
      </Button>
    </div>
  );
}
