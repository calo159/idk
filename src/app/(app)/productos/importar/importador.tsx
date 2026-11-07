"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leerCSV } from "@/lib/csv";
import { formatoCOP } from "@/lib/dinero";
import {
  CAMPOS_IMPORTACION,
  type CampoImportacion,
  type Mapeo,
  detectarEncabezado,
  leerFilas,
  mapeoVacio,
} from "@/lib/importar";
import { type ResumenImportacion, importarProductos } from "./acciones";

const MAX_BYTES = 5 * 1024 * 1024;

export function Importador({ bodegaId }: { bodegaId: string }) {
  const [filas, setFilas] = useState<unknown[][] | null>(null);
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [mapeo, setMapeo] = useState<Mapeo>(mapeoVacio());
  const [origen, setOrigen] = useState<"ia" | "heuristica" | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [pendiente, iniciar] = useTransition();

  const lectura = useMemo(() => (filas ? leerFilas(filas, mapeo) : null), [filas, mapeo]);

  const abrir = async (archivo: File) => {
    setError(null);
    setResumen(null);
    setFilas(null);
    if (archivo.size > MAX_BYTES) return setError("El archivo no puede pesar más de 5 MB");
    setCargando(true);
    try {
      let crudas: unknown[][];
      if (/\.csv$|\.txt$/i.test(archivo.name)) crudas = leerCSV(await archivo.text());
      else if (/\.xlsx$/i.test(archivo.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        crudas = (await readSheet(archivo)) as unknown[][];
      } else return setError("Usa un archivo .xlsx o .csv (si es .xls, guárdalo como .xlsx)");
      if (crudas.length < 2) return setError("El archivo no tiene datos");

      const i = detectarEncabezado(crudas);
      const heads = (crudas[i] ?? []).map((c) => String(c ?? "").trim());
      const datos = crudas.slice(i + 1);
      setNombreArchivo(archivo.name);
      setEncabezados(heads);
      setFilas(datos);

      // Solo viajan los encabezados y 6 filas de ejemplo al servidor.
      const muestra = datos.slice(0, 6).map((f) => heads.map((_, c) => String(f[c] ?? "").slice(0, 80)));
      const resp = await fetch("/api/ia/mapeo-columnas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encabezados: heads.map((h) => h.slice(0, 80)), muestra }),
      });
      if (resp.ok) {
        const j = (await resp.json()) as { mapeo: Mapeo; origen: "ia" | "heuristica" };
        setMapeo(j.mapeo);
        setOrigen(j.origen);
      } else setError("No pudimos proponer las columnas: elígelas tú abajo.");
    } catch {
      setError("No pudimos leer el archivo. Verifica que no esté dañado.");
    } finally {
      setCargando(false);
    }
  };

  const importar = () => {
    if (!lectura) return;
    setError(null);
    iniciar(async () => {
      const r = await importarProductos({
        bodega_id: bodegaId,
        filas: lectura.validas.map((p) => ({
          nombre: p.nombre,
          precio_venta: p.precio_venta,
          costo: p.costo,
          cantidad: p.cantidad,
          codigo_barras: p.codigo_barras,
          sku: p.sku,
          categoria: p.categoria,
          unidad: p.unidad,
          stock_minimo: p.stock_minimo,
        })),
      });
      if (r.ok) setResumen(r.datos);
      else setError(r.error);
    });
  };

  if (resumen) {
    return (
      <div role="status" className="space-y-2 rounded-xl border p-5 text-center">
        <h2 className="text-lg font-semibold">Importación lista ✔</h2>
        <p>{resumen.creados} producto(s) creados</p>
        {resumen.conStock > 0 ? <p>{resumen.conStock} con inventario inicial</p> : null}
        {resumen.categoriasNuevas > 0 ? <p>{resumen.categoriasNuevas} categoría(s) nuevas</p> : null}
        {resumen.omitidos > 0 ? (
          <p className="text-sm text-muted-foreground">{resumen.omitidos} omitidos porque ya existían</p>
        ) : null}
        <Link href="/productos" className="inline-block pt-2 text-primary underline">
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-xl border border-dashed p-4">
        <label htmlFor="archivo" className="text-sm font-medium">
          Archivo de Excel (.xlsx) o CSV
        </label>
        <Input
          id="archivo"
          type="file"
          accept=".xlsx,.csv,.txt"
          className="h-11"
          disabled={cargando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void abrir(f);
          }}
        />
        {cargando ? <p className="text-sm text-muted-foreground">Leyendo el archivo…</p> : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {filas && lectura ? (
        <>
          <div className="space-y-3 rounded-xl border p-4">
            <h2 className="font-medium">¿Qué es cada columna?</h2>
            <p className="text-xs text-muted-foreground">
              {origen === "ia"
                ? "La IA propuso esto; revísalo y corrige lo que haga falta."
                : "Propuesta según los títulos de las columnas; revísala."}{" "}
              Archivo: {nombreArchivo} · {filas.length} filas.
            </p>
            {CAMPOS_IMPORTACION.map((c) => (
              <div key={c.clave} className="grid grid-cols-2 items-center gap-3">
                <label htmlFor={`m-${c.clave}`} className="text-sm">
                  {c.etiqueta}
                  {c.obligatorio ? " *" : ""}
                </label>
                <select
                  id={`m-${c.clave}`}
                  value={mapeo[c.clave] ?? ""}
                  onChange={(e) =>
                    setMapeo((m) => ({
                      ...m,
                      [c.clave as CampoImportacion]: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  <option value="">— No importar —</option>
                  {encabezados.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Columna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h2 className="font-medium">Vista previa</h2>
            <p className="text-sm">
              <strong>{lectura.validas.length}</strong> listos para importar
              {lectura.errores.length > 0 ? `, ${lectura.errores.length} con errores` : ""}
              {lectura.repetidas.length > 0 ? `, ${lectura.repetidas.length} repetidos en el archivo` : ""}.
            </p>
            <ul className="divide-y rounded-xl border text-sm">
              {lectura.validas.slice(0, 8).map((p) => (
                <li key={p.fila} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                  <span className="text-xs text-muted-foreground">{p.cantidad > 0 ? `${p.cantidad} ${p.unidad}` : ""}</span>
                  <span className="tabular-nums">{formatoCOP(p.precio_venta)}</span>
                </li>
              ))}
            </ul>
            {lectura.errores.length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-destructive">Ver errores ({lectura.errores.length})</summary>
                <ul className="mt-2 space-y-1">
                  {lectura.errores.slice(0, 50).map((e) => (
                    <li key={e.fila}>
                      Fila {e.fila}: {e.mensaje}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

          <Button
            className="h-12 w-full"
            disabled={pendiente || lectura.validas.length === 0 || mapeo.nombre === null}
            onClick={importar}
          >
            {pendiente ? "Importando…" : `Importar ${lectura.validas.length} producto(s)`}
          </Button>
          {mapeo.nombre === null ? (
            <p className="text-xs text-destructive">Elige qué columna es el nombre del producto.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
