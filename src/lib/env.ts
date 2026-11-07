import { z } from "zod";

/**
 * Variables PÚBLICAS (llegan al navegador). Deben leerse con acceso estático a `process.env.NEXT_PUBLIC_*`
 * para que Next las incruste en el build.
 */
const esquemaPublico = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL debe ser una URL" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export type EntornoPublico = z.infer<typeof esquemaPublico>;

export function entornoPublico(): EntornoPublico {
  const r = esquemaPublico.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!r.success) {
    throw new Error(
      `Configuración incompleta (.env.local):\n${r.error.issues.map((i) => `- ${i.message}`).join("\n")}`,
    );
  }
  return r.data;
}

/**
 * Variables SOLO DE SERVIDOR. Se validan al usarlas (no al arrancar) para que `next build`
 * funcione sin secretos y cada función pida solo lo que necesita.
 * Nunca importar este archivo desde un componente de cliente.
 */
const esquemaServidor = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  N8N_WEBHOOK_SECRET: z.string().min(16).optional(),
  SURTIX_API_TOKEN: z.string().min(16).optional(),
});

export type EntornoServidor = z.infer<typeof esquemaServidor>;

export function entornoServidor(): EntornoServidor {
  return esquemaServidor.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || undefined,
    N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET || undefined,
    SURTIX_API_TOKEN: process.env.SURTIX_API_TOKEN || undefined,
  });
}

/** Exige una variable de servidor y falla con un mensaje claro si falta. */
export function requerirServidor<K extends keyof EntornoServidor>(
  clave: K,
): NonNullable<EntornoServidor[K]> {
  const valor = entornoServidor()[clave];
  if (valor === undefined || valor === null || valor === "") {
    throw new Error(`Falta la variable de entorno ${clave} (revisa .env.local y .env.example)`);
  }
  return valor as NonNullable<EntornoServidor[K]>;
}
