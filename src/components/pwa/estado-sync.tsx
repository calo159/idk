"use client";

import { liveQuery } from "dexie";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { formatoCOP } from "@/lib/dinero";
import {
  type VentaEnCola,
  descartarDeCola,
  listarCola,
  recuperarEnvioInterrumpido,
  reintentarRechazada,
  sincronizarCola,
} from "@/lib/offline/cola";
import { enviarVentaOffline } from "@/lib/offline/enviar";

/**
 * Muestra si hay internet y cuántas ventas esperan sincronizarse. Intenta enviarlas al montar,
 * al volver la conexión y cada 30 segundos mientras haya pendientes.
 */
function suscribirConexion(aviso: () => void) {
  window.addEventListener("online", aviso);
  window.addEventListener("offline", aviso);
  return () => {
    window.removeEventListener("online", aviso);
    window.removeEventListener("offline", aviso);
  };
}

export function EstadoSync() {
  const enLinea = useSyncExternalStore(
    suscribirConexion,
    () => navigator.onLine,
    () => true,
  );
  const [cola, setCola] = useState<VentaEnCola[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const sincronizar = useCallback(async () => {
    if (!navigator.onLine) return;
    setSincronizando(true);
    try {
      await sincronizarCola(enviarVentaOffline);
    } finally {
      setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    const alConectar = () => void sincronizar();
    void recuperarEnvioInterrumpido().then(sincronizar);
    window.addEventListener("online", alConectar);
    const id = setInterval(() => void sincronizar(), 30_000);
    return () => {
      window.removeEventListener("online", alConectar);
      clearInterval(id);
    };
  }, [sincronizar]);

  // La lista se actualiza sola cuando cambia IndexedDB (venta nueva, enviada, rechazada).
  useEffect(() => {
    const sub = liveQuery(() => listarCola()).subscribe({ next: setCola, error: () => setCola([]) });
    return () => sub.unsubscribe();
  }, []);

  const pendientes = cola.filter((v) => v.estado !== "rechazada");
  const rechazadas = cola.filter((v) => v.estado === "rechazada");
  if (enLinea && cola.length === 0) return null;

  return (
    <div className="space-y-2" aria-live="polite">
      <div
        className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
          enLinea ? "bg-muted" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        }`}
      >
        <span>
          {enLinea ? "Con internet" : "Sin internet: puedes seguir vendiendo"}
          {pendientes.length > 0 ? ` · ${pendientes.length} venta(s) por sincronizar` : ""}
        </span>
        {enLinea && pendientes.length > 0 ? (
          <Button size="sm" variant="outline" disabled={sincronizando} onClick={() => void sincronizar()}>
            {sincronizando ? "Enviando…" : "Enviar ahora"}
          </Button>
        ) : null}
      </div>
      {rechazadas.map((v) => (
        <div
          key={v.offlineId}
          role="alert"
          className="space-y-1.5 rounded-lg border border-destructive/50 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            Una venta de {formatoCOP(v.total)} no se pudo registrar
          </p>
          <p className="text-muted-foreground">{v.ultimoError}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await reintentarRechazada(v.offlineId);
                void sincronizar();
              }}
            >
              Reintentar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (window.confirm("¿Descartar esta venta? No quedará registrada.")) {
                  await descartarDeCola(v.offlineId);
                }
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
