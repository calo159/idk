/**
 * Genera el SQL de la demo (ferretería de Riohacha, 60 días de operación) en supabase/seed-demo.sql.
 *
 * Uso:
 *   npm run demo:sql                 → archivo para cargar en Supabase (usuarios con contraseña reales)
 *   npm run demo:sql -- --dias 30    → otra cantidad de días
 *
 * Cargarlo en Supabase local (con Docker):
 *   npm run db:reset && psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/seed-demo.sql
 * o pegarlo en el SQL Editor de un proyecto de Supabase VACÍO.
 *
 * Usuarios de la demo: demo@surtix.co (dueño), maria@surtix.co y luis@surtix.co (vendedores).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEMO, generarDemoSql } from "../src/demo/generador";
import { hoyBogota } from "../src/lib/fechas";

const args = process.argv.slice(2);
const valor = (nombre: string) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const dias = Number(valor("dias") ?? 60);
if (!Number.isInteger(dias) || dias < 7 || dias > 365) throw new Error("--dias debe estar entre 7 y 365");

const { sql, resumen } = generarDemoSql({ hoy: valor("hoy") ?? hoyBogota(), dias, authCompleto: true });
const destino = join(process.cwd(), "supabase", "seed-demo.sql");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, sql, "utf8");

console.log(`Demo generada: ${destino} (${(sql.length / 1024).toFixed(0)} KB)`);
console.log(resumen);
console.log(`\nEntra con ${DEMO.correoDueno} / ${DEMO.contrasena}`);
