import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
