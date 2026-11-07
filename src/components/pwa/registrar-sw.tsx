"use client";

import { useEffect } from "react";

/** Registra el service worker (solo en producción) para que el POS abra sin internet. */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin SW la app funciona igual, solo que sin modo offline */
    });
  }, []);
  return null;
}

/** En el login se borran las páginas guardadas: nada del negocio queda en caché tras cerrar sesión. */
export function LimpiarCacheOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((r) => r.active?.postMessage("limpiar")).catch(() => {});
  }, []);
  return null;
}
