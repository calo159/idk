"use client";

import { useActionState, useState, useTransition } from "react";
import { EscanerCodigo } from "@/components/escaner-codigo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UNIDADES } from "@/lib/validaciones/productos";
import {
  activarProducto,
  crearCategoria,
  eliminarPresentacion,
  guardarPresentacion,
  guardarProducto,
} from "./acciones";

export interface ProductoForm {
  id?: string;
  nombre: string;
  sku: string | null;
  codigo_barras: string | null;
  categoria_id: string | null;
  descripcion: string | null;
  unidad_base: string;
  precio_venta: number;
  margen_objetivo: number | null;
  stock_minimo: number;
  maneja_inventario: boolean;
}

function Campo({
  id,
  etiqueta,
  error,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

const selectClase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormProducto({
  producto,
  categorias,
}: {
  producto?: ProductoForm;
  categorias: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(guardarProducto, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const [codigo, setCodigo] = useState(producto?.codigo_barras ?? "");
  const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

  return (
    <form action={accion} className="space-y-4" noValidate>
      {producto?.id ? <input type="hidden" name="id" value={producto.id} /> : null}
      <Campo id="nombre" etiqueta="Nombre" error={e.nombre}>
        <Input id="nombre" name="nombre" defaultValue={producto?.nombre} className="h-11" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="precio_venta" etiqueta="Precio de venta ($)" error={e.precio_venta}>
          <Input
            id="precio_venta"
            name="precio_venta"
            inputMode="decimal"
            defaultValue={num(producto?.precio_venta)}
            className="h-11"
          />
        </Campo>
        <Campo id="unidad_base" etiqueta="Se vende por" error={e.unidad_base}>
          <select
            id="unidad_base"
            name="unidad_base"
            defaultValue={producto?.unidad_base ?? "unidad"}
            className={selectClase}
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo id="categoria_id" etiqueta="Categoría" error={e.categoria_id}>
        <select
          id="categoria_id"
          name="categoria_id"
          defaultValue={producto?.categoria_id ?? ""}
          className={selectClase}
        >
          <option value="">Sin categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="codigo_barras" etiqueta="Código de barras" error={e.codigo_barras}>
          <Input
            id="codigo_barras"
            name="codigo_barras"
            inputMode="numeric"
            value={codigo}
            onChange={(ev) => setCodigo(ev.target.value)}
            className="h-11"
          />
          <EscanerCodigo alLeer={setCodigo} etiqueta="Escanear código" />
        </Campo>
        <Campo id="sku" etiqueta="SKU (opcional)" error={e.sku}>
          <Input id="sku" name="sku" defaultValue={producto?.sku ?? ""} className="h-11" />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="stock_minimo" etiqueta="Stock mínimo" error={e.stock_minimo}>
          <Input
            id="stock_minimo"
            name="stock_minimo"
            inputMode="decimal"
            defaultValue={num(producto?.stock_minimo)}
            className="h-11"
          />
        </Campo>
        <Campo id="margen_objetivo" etiqueta="Margen objetivo (%)" error={e.margen_objetivo}>
          <Input
            id="margen_objetivo"
            name="margen_objetivo"
            inputMode="decimal"
            defaultValue={num(producto?.margen_objetivo)}
            className="h-11"
          />
        </Campo>
      </div>
      <Campo id="descripcion" etiqueta="Descripción (opcional)" error={e.descripcion}>
        <Input
          id="descripcion"
          name="descripcion"
          defaultValue={producto?.descripcion ?? ""}
          className="h-11"
        />
      </Campo>
      <Campo id="foto" etiqueta="Foto (JPG, PNG o WebP, máx. 3 MB)" error={e.foto}>
        <Input
          id="foto"
          name="foto"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="h-11"
        />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="maneja_inventario"
          defaultChecked={producto?.maneja_inventario ?? true}
          className="size-4"
        />
        Controlar inventario (desmarca si es un servicio)
      </label>
      {estado && !estado.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : producto?.id ? "Guardar cambios" : "Crear producto"}
      </Button>
    </form>
  );
}

export function FormPresentacion({ productoId }: { productoId: string }) {
  const [estado, accion, pendiente] = useActionState(guardarPresentacion, null);
  const e = estado && !estado.ok ? (estado.campos ?? {}) : {};
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h3 className="font-medium">Nueva presentación</h3>
      <input type="hidden" name="producto_id" value={productoId} />
      <div className="grid grid-cols-2 gap-3">
        <Campo id="p-nombre" etiqueta="Nombre (ej. Caja x12)" error={e.nombre}>
          <Input id="p-nombre" name="nombre" className="h-11" />
        </Campo>
        <Campo id="p-factor" etiqueta="Unidades que trae" error={e.factor}>
          <Input id="p-factor" name="factor" inputMode="decimal" className="h-11" />
        </Campo>
        <Campo id="p-precio" etiqueta="Precio ($)" error={e.precio_venta}>
          <Input id="p-precio" name="precio_venta" inputMode="decimal" className="h-11" />
        </Campo>
        <Campo id="p-codigo" etiqueta="Código de barras" error={e.codigo_barras}>
          <Input id="p-codigo" name="codigo_barras" inputMode="numeric" className="h-11" />
        </Campo>
      </div>
      {estado && !estado.ok && !Object.keys(e).length ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Agregar presentación"}
      </Button>
    </form>
  );
}

export function BotonEliminarPresentacion({
  presentacionId,
  productoId,
}: {
  presentacionId: string;
  productoId: string;
}) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pendiente}
      onClick={() => iniciar(async () => void (await eliminarPresentacion(presentacionId, productoId)))}
    >
      Quitar
    </Button>
  );
}

export function BotonActivarProducto({ productoId, activo }: { productoId: string; activo: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pendiente}
      onClick={() => iniciar(async () => void (await activarProducto(productoId, !activo)))}
    >
      {activo ? "Desactivar" : "Reactivar"}
    </Button>
  );
}

export function FormCategoria() {
  const [estado, accion, pendiente] = useActionState(crearCategoria, null);
  return (
    <form action={accion} className="flex items-start gap-2" noValidate>
      <div className="flex-1">
        <Input name="nombre" placeholder="Nueva categoría" aria-label="Nueva categoría" className="h-10" />
        {estado && !estado.ok ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {estado.campos?.nombre ?? estado.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="outline" className="h-10" disabled={pendiente}>
        Agregar
      </Button>
    </form>
  );
}
