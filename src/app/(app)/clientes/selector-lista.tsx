"use client";

import { useState, useTransition } from "react";
import { asignarLista } from "../inventario/avanzado/acciones";

export function SelectorLista({ clienteId, actual, listas }: { clienteId: string; actual: string | null; listas: { id: string; nombre: string }[] }) {
  const [valor, setValor] = useState(actual ?? "");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-1.5 rounded-xl border p-4">
      <label htmlFor="lista-cliente" className="text-sm font-medium">Lista de precios</label>
      <select id="lista-cliente" value={valor} disabled={pendiente} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        onChange={(e) => {
          const nueva = e.target.value;
          setValor(nueva);
          iniciar(async () => { const r = await asignarLista(clienteId, nueva); setMensaje(r.ok ? "Guardado" : r.error); });
        }}>
        <option value="">Precios normales</option>
        {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
      </select>
      {mensaje ? <p role="status" className="text-xs text-muted-foreground">{mensaje}</p> : null}
    </div>
  );
}
