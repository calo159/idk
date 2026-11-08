"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { crearOrdenDeOferta, retirarseDeOferta, unirseOferta } from "./acciones";

export interface OfertaVista {
  id: string;
  distribuidor: string;
  titulo: string;
  descripcion: string | null;
  unidad: string;
  precioReferencia: number;
  cierraEn: string;
  entrega: string | null;
  minimo: number;
  maximo: number | null;
  total: number;
  negocios: number;
  precioActual: number | null;
  escalas: { desde: number; precio: number }[];
  mia: number | null;
}

const num = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);

/** Cuánto falta para la siguiente escala (o para la primera si aún no hay precio). */
function siguiente(o: OfertaVista) {
  const e = o.escalas.find((x) => x.desde > o.total);
  return e ? { faltan: e.desde - o.total, precio: e.precio } : null;
}

export function TarjetaOferta({ o, puedeComprometer, formatoFecha }: { o: OfertaVista; puedeComprometer: boolean; formatoFecha: { cierra: string; entrega: string | null } }) {
  const [cantidad, setCantidad] = useState(o.mia ? String(o.mia) : "");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const sig = siguiente(o);
  const correr = (fn: () => Promise<{ ok: boolean } & ({ ok: true } | { ok: false; error: string })>, exito: string) =>
    iniciar(async () => {
      const r = await fn();
      setAviso(r.ok ? { ok: true, texto: exito } : { ok: false, texto: (r as { error: string }).error });
    });

  return (
    <li className="space-y-3 rounded-xl border p-4">
      <div>
        <p className="text-xs text-muted-foreground">{o.distribuidor}</p>
        <p className="font-medium">{o.titulo}</p>
        {o.descripcion ? <p className="text-sm text-muted-foreground">{o.descripcion}</p> : null}
        <p className="text-xs text-muted-foreground">Cierra el {formatoFecha.cierra}{formatoFecha.entrega ? ` · entrega estimada ${formatoFecha.entrega}` : ""}</p>
      </div>

      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p>
          Precio normal <s className="text-muted-foreground">{formatoCOP(o.precioReferencia)}</s> por {o.unidad}.{" "}
          {o.precioActual !== null ? <strong>Hoy en grupo: {formatoCOP(o.precioActual)}</strong> : <span>Aún no se llega al mínimo para el precio de grupo.</span>}
        </p>
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          {o.escalas.map((e) => (
            <li key={e.desde} className={o.total >= e.desde ? "font-medium text-foreground" : ""}>
              {o.total >= e.desde ? "✔ " : ""}Desde {num(e.desde)} {o.unidad} en total: {formatoCOP(e.precio)} c/u
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-xs">
          Llevan {num(o.total)} {o.unidad} entre {o.negocios} negocio(s).{" "}
          {sig ? <>Faltan <strong>{num(sig.faltan)}</strong> para bajar a {formatoCOP(sig.precio)}.</> : "¡Ya están en el mejor precio!"}
        </p>
      </div>

      {puedeComprometer ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = leerNumeroCO(cantidad)?.toNumber() ?? 0;
            correr(() => unirseOferta({ oferta: o.id, cantidad: n }), o.mia ? "Cantidad actualizada" : "¡Listo! Te uniste a la compra.");
          }}
        >
          <label htmlFor={`c-${o.id}`} className="text-xs">
            {o.mia ? "Tu compromiso (puedes cambiarlo hasta que cierre)" : `¿Cuántos ${o.unidad} quieres? (mínimo ${num(o.minimo)}${o.maximo ? `, máximo ${num(o.maximo)}` : ""})`}
          </label>
          <div className="flex gap-2">
            <Input id={`c-${o.id}`} inputMode="decimal" className="h-11" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            <Button type="submit" className="h-11" disabled={pendiente || !cantidad.trim()}>{o.mia ? "Actualizar" : "Unirme"}</Button>
            {o.mia ? (
              <Button type="button" variant="outline" className="h-11" disabled={pendiente} onClick={() => { if (window.confirm("¿Retirarte de esta compra?")) correr(() => retirarseDeOferta(o.id), "Te retiraste de la compra."); }}>Retirarme</Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Pagas el precio de la escala que se alcance al cierre, igual para todos. Si no se llega al mínimo, no se compra nada.</p>
        </form>
      ) : o.mia ? (
        <p className="text-sm">Tu negocio se comprometió con {num(o.mia)} {o.unidad}.</p>
      ) : null}
      {aviso ? <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto}</p> : null}
    </li>
  );
}

export function ConvertirEnOrden({ ofertaId, productos, bodegas }: { ofertaId: string; productos: { id: string; nombre: string }[]; bodegas: { id: string; nombre: string }[] }) {
  const [producto, setProducto] = useState("");
  const [bodega, setBodega] = useState(bodegas[0]?.id ?? "");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-3">
      <p className="text-sm font-medium">Crear la orden de compra</p>
      <select aria-label="Producto de tu inventario" value={producto} onChange={(e) => setProducto(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
        <option value="">¿A qué producto tuyo corresponde?</option>
        {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      {bodegas.length > 1 ? (
        <select aria-label="Bodega de destino" value={bodega} onChange={(e) => setBodega(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
          {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      ) : null}
      <Button className="h-11 w-full" disabled={pendiente || !producto} onClick={() => iniciar(async () => {
        const r = await crearOrdenDeOferta({ oferta: ofertaId, producto, bodega });
        setAviso(r.ok ? { ok: true, texto: "Orden creada en borrador." } : { ok: false, texto: r.error });
      })}>{pendiente ? "Creando…" : "Crear orden de compra"}</Button>
      {aviso ? <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto} {aviso.ok ? <Link href="/compras/ordenes" className="underline">Ver órdenes</Link> : null}</p> : null}
    </div>
  );
}
