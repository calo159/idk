import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // El disco de desarrollo está casi lleno: sin caché persistente de Turbopack (más lento al arrancar,
    // pero no escribe cientos de MB en .next). Activar con SURTIX_CACHE=1 si hay espacio.
    turbopackFileSystemCacheForDev: process.env.SURTIX_CACHE === "1",
    turbopackFileSystemCacheForBuild: process.env.SURTIX_CACHE === "1",
  },
  // Decisión: sin cacheComponents. El área autenticada es 100 % por usuario (sesión + RLS);
  // ver docs/06-DECISIONES.md.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
