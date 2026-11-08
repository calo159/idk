"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { guardarRuta } from "./acciones";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export interface Plan {
  usuarioId: string;
  dia: number;
  clienteId: string;
}

export function EditorRutas({ vendedores, clientes, plan }: { vendedores: { id: string; nombre: string }[]; clientes: { id: string; nombre: string }[]; plan: Plan[] }) {
  const [usuarioId, setUsuarioId] = useState(vendedores[0]?.id ?? "");
  const [dia, setDia] = useState(1);
  // Cambios sin guardar, por «usuario|día». Si no hay cambios se muestra lo guardado.
  const [editadas, setEditadas] = useState<Record<string, string[]>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const guardadaDe = (u: string, d: number) => plan.filter((p) => p.usuarioId === u && p.dia === d).map((p) => p.clienteId);
  const clave = `${usuarioId}|${dia}`;
  const lista = editadas[clave] ?? guardadaDe(usuarioId, dia);
  const nombre = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? "(cliente eliminado)";
  const disponibles = clientes.filter((c) => !lista.includes(c.id));
  const poner = (nueva: string[]) => setEditadas((e) => ({ ...e, [clave]: nueva }));
  const mover = (i: number, d: -1 | 1) => {
    const n = [...lista];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    poner(n);
  };

  if (vendedores.length === 0)
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Primero invita a un vendedor de ruta en Configuración → Usuarios y roles.</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="rv" className="text-xs">Vendedor</label>
        <select id="rv" value={usuarioId} onChange={(e) => { setUsuarioId(e.target.value); setAviso(null); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      </div>
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Día de la semana">
        {DIAS.map((d, i) => {
          const n = (editadas[`${usuarioId}|${i + 1}`] ?? guardadaDe(usuarioId, i + 1)).length;
          return (
            <button key={d} type="button" role="tab" aria-selected={dia === i + 1} onClick={() => { setDia(i + 1); setAviso(null); }} className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${dia === i + 1 ? "bg-primary text-primary-foreground" : ""}`}>
              {d.slice(0, 3)}{n > 0 ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      <ol className="divide-y rounded-xl border text-sm">
        {lista.length === 0 ? (
          <li className="p-4 text-center text-muted-foreground">Sin clientes este día.</li>
        ) : (
          lista.map((id, i) => (
            <li key={id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-6 text-center text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{nombre(id)}</span>
              <button type="button" aria-label={`Subir ${nombre(id)}`} disabled={i === 0} onClick={() => mover(i, -1)} className="size-9 rounded border disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Bajar ${nombre(id)}`} disabled={i === lista.length - 1} onClick={() => mover(i, 1)} className="size-9 rounded border disabled:opacity-30">↓</button>
              <button type="button" aria-label={`Quitar ${nombre(id)}`} onClick={() => poner(lista.filter((x) => x !== id))} className="size-9 rounded border text-destructive">✕</button>
            </li>
          ))
        )}
      </ol>

      <div className="space-y-1">
        <label htmlFor="rc" className="text-xs">Agregar cliente a este día</label>
        <select id="rc" value="" onChange={(e) => e.target.value && poner([...lista, e.target.value])} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
          <option value="">Elegir cliente…</option>
          {disponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      <Button
        className="h-12 w-full"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await guardarRuta({ usuarioId, dia, clientes: lista });
            setAviso(r.ok ? { ok: true, texto: `Ruta guardada (${r.datos.guardados} clientes)` } : { ok: false, texto: r.error });
            if (r.ok) setEditadas((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== clave)));
          })
        }
      >
        {pendiente ? "Guardando…" : `Guardar ruta del ${DIAS[dia - 1]!.toLowerCase()}`}
      </Button>
      {aviso ? <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto}</p> : null}
    </div>
  );
}
