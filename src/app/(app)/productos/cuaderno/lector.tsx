"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { type ResumenCuaderno, importarCuaderno } from "./acciones";

interface Respuesta {
  documentoId: string;
  productos: { nombre: string; cantidad: number; precio: number; costo: number; yaExiste: boolean }[];
  deudas: { cliente: string; monto: number; telefono: string | null; nota: string | null; clienteId: string | null; clienteNombre: string | null }[];
  confianza: number;
  advertencias: string[];
}

interface FilaProducto { nombre: string; cantidad: string; precio: string; costo: string; incluir: boolean; yaExiste: boolean }
interface FilaDeuda { cliente: string; monto: string; incluir: boolean; clienteId: string | null; clienteNombre: string | null; telefono: string | null }

export function LectorCuaderno({ bodegaId, puedeDeudas }: { bodegaId: string; puedeDeudas: boolean }) {
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ id: string; confianza: number; avisos: string[] } | null>(null);
  const [prods, setProds] = useState<FilaProducto[]>([]);
  const [deudas, setDeudas] = useState<FilaDeuda[]>([]);
  const [resumen, setResumen] = useState<ResumenCuaderno | null>(null);
  const [pendiente, iniciar] = useTransition();

  const leer = async (archivo: File) => {
    setError(null); setResumen(null); setLeyendo(true);
    try {
      const datos = new FormData();
      datos.set("foto", archivo);
      const resp = await fetch("/api/ia/cuaderno", { method: "POST", body: datos });
      const json = (await resp.json()) as Respuesta | { error: string };
      if (!resp.ok || "error" in json) return setError("error" in json ? json.error : "No pudimos leer el cuaderno");
      setDoc({ id: json.documentoId, confianza: json.confianza, avisos: json.advertencias });
      setProds(json.productos.map((p) => ({ nombre: p.nombre, cantidad: String(p.cantidad), precio: String(p.precio), costo: String(p.costo), incluir: !p.yaExiste, yaExiste: p.yaExiste })));
      setDeudas(json.deudas.map((d) => ({ cliente: d.cliente, monto: String(d.monto), incluir: puedeDeudas, clienteId: d.clienteId, clienteNombre: d.clienteNombre, telefono: d.telefono })));
    } catch {
      setError("No pudimos leer el cuaderno. Revisa tu conexión.");
    } finally {
      setLeyendo(false);
    }
  };

  const confirmar = () => {
    if (!doc) return;
    setError(null);
    iniciar(async () => {
      const r = await importarCuaderno({
        documento_id: doc.id,
        bodega_id: bodegaId,
        productos: prods.filter((p) => p.incluir).map((p) => ({ nombre: p.nombre, cantidad: leerNumeroCO(p.cantidad)?.toNumber() ?? 0, precio: leerNumeroCO(p.precio)?.toNumber() ?? 0, costo: leerNumeroCO(p.costo)?.toNumber() ?? 0 })),
        deudas: deudas.filter((d) => d.incluir).map((d) => ({ cliente: d.cliente, monto: leerNumeroCO(d.monto)?.toNumber() ?? 0, cliente_id: d.clienteId, telefono: d.telefono })),
      });
      if (r.ok) setResumen(r.datos);
      else setError(r.error);
    });
  };

  if (resumen)
    return (
      <div role="status" className="space-y-2 rounded-xl border p-5 text-center">
        <h2 className="text-lg font-semibold">Cuaderno cargado ✔</h2>
        <p>{resumen.productosCreados} producto(s) creados{resumen.productosOmitidos ? ` (${resumen.productosOmitidos} ya existían)` : ""}</p>
        <p>{resumen.deudasRegistradas} deuda(s) registradas{resumen.clientesNuevos ? ` · ${resumen.clientesNuevos} cliente(s) nuevos` : ""}</p>
        <div className="flex justify-center gap-4 pt-2 text-primary underline"><Link href="/productos">Ver productos</Link><Link href="/clientes?deuda=1">Ver deudas</Link></div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-dashed p-4">
        <label htmlFor="foto-cuaderno" className="text-sm font-medium">Foto del cuaderno</label>
        <Input id="foto-cuaderno" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={leyendo} className="h-11"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); e.target.value = ""; }} />
        {leyendo ? <p role="status" className="text-sm text-muted-foreground">Leyendo el cuaderno… puede tardar unos segundos.</p> : null}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {doc ? (
        <>
          <p className="text-xs text-muted-foreground">La IA propone, tú decides: corrige lo que haga falta y desmarca lo que no quieras cargar.</p>
          {doc.confianza < 0.6 ? <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">La letra se leyó con poca seguridad: revisa todo con cuidado.</p> : null}
          {doc.avisos.map((a) => <p key={a} className="text-sm text-amber-700 dark:text-amber-400">⚠ {a}</p>)}

          {prods.length > 0 ? (
            <div className="space-y-2">
              <h2 className="font-medium">Productos ({prods.filter((p) => p.incluir).length} de {prods.length})</h2>
              <ul className="space-y-2">
                {prods.map((p, i) => (
                  <li key={i} className="space-y-2 rounded-xl border p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={p.incluir} onChange={(e) => setProds((l) => l.map((x, j) => (j === i ? { ...x, incluir: e.target.checked } : x)))} className="size-4" />
                      <Input aria-label="Nombre del producto" value={p.nombre} onChange={(e) => setProds((l) => l.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} className="h-10" />
                    </label>
                    {p.yaExiste ? <p className="text-xs text-amber-700 dark:text-amber-400">Ya tienes un producto con este nombre: se omitirá.</p> : null}
                    <div className="grid grid-cols-3 gap-2">
                      {(["cantidad", "precio", "costo"] as const).map((c) => (
                        <Input key={c} aria-label={`${c} de ${p.nombre}`} inputMode="decimal" placeholder={c} value={p[c]} className="h-10" onChange={(e) => setProds((l) => l.map((x, j) => (j === i ? { ...x, [c]: e.target.value } : x)))} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {deudas.length > 0 ? (
            <div className="space-y-2">
              <h2 className="font-medium">Deudas de clientes ({deudas.filter((d) => d.incluir).length} de {deudas.length})</h2>
              {!puedeDeudas ? <p className="text-xs text-muted-foreground">Solo el dueño o un administrador puede cargar deudas anteriores.</p> : null}
              <ul className="space-y-2">
                {deudas.map((d, i) => (
                  <li key={i} className="space-y-2 rounded-xl border p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" disabled={!puedeDeudas} checked={d.incluir} onChange={(e) => setDeudas((l) => l.map((x, j) => (j === i ? { ...x, incluir: e.target.checked } : x)))} className="size-4" />
                      <Input aria-label="Nombre del cliente" value={d.cliente} onChange={(e) => setDeudas((l) => l.map((x, j) => (j === i ? { ...x, cliente: e.target.value } : x)))} className="h-10" />
                    </label>
                    <p className="text-xs text-muted-foreground">{d.clienteId ? `Se sumará a «${d.clienteNombre}», que ya es cliente tuyo.` : "Se creará como cliente nuevo."}</p>
                    <Input aria-label={`Deuda de ${d.cliente}`} inputMode="decimal" value={d.monto} className="h-10" onChange={(e) => setDeudas((l) => l.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} />
                    <p className="text-right text-xs text-muted-foreground">{formatoCOP(leerNumeroCO(d.monto)?.toNumber() ?? 0)}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {prods.length === 0 && deudas.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No se encontró nada legible. Prueba con otra foto, con buena luz y la hoja plana.</p> : null}
          <Button className="h-12 w-full" disabled={pendiente || (prods.every((p) => !p.incluir) && deudas.every((d) => !d.incluir))} onClick={confirmar}>
            {pendiente ? "Cargando…" : "Cargar lo seleccionado"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
