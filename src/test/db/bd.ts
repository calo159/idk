/**
 * Banco de pruebas de base de datos: Postgres real (PGlite, WASM) con las migraciones reales de
 * supabase/migrations/ y un esquema `auth` simulado igual al de Supabase.
 * Ver docs/06-DECISIONES.md · D-002.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const RAIZ_MIGRACIONES = join(process.cwd(), "supabase", "migrations");

/** Lo que Supabase ya trae instalado antes de correr nuestras migraciones. */
const PREPARACION_SUPABASE = `
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
  $$;

  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant select on auth.users to service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export type Bd = PGlite;

export function listarMigraciones(): { nombre: string; sql: string }[] {
  return readdirSync(RAIZ_MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((nombre) => ({ nombre, sql: readFileSync(join(RAIZ_MIGRACIONES, nombre), "utf8") }));
}

/** Crea una base nueva con todas las migraciones aplicadas (sin seed). */
export async function crearBd(): Promise<Bd> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PREPARACION_SUPABASE);
  for (const m of listarMigraciones()) {
    try {
      await db.exec(m.sql);
    } catch (e) {
      throw new Error(`Falló la migración ${m.nombre}: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Crea un usuario en auth.users (como lo haría GoTrue) y devuelve su id. */
export async function crearUsuario(db: Bd, email: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return r.rows[0]!.id;
}

/**
 * Ejecuta `fn` como un usuario autenticado (rol `authenticated`, RLS activa), igual que una
 * petición del navegador con su JWT. Siempre vuelve al superusuario al terminar.
 */
export async function comoUsuario<T>(db: Bd, usuarioId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${usuarioId}', false)`);
  await db.exec(`select set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.exec(`select set_config('request.jwt.claim.role', '', false)`);
  }
}

/** Ejecuta `fn` como visitante sin sesión (rol `anon`). */
export async function comoAnonimo<T>(db: Bd, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

/** Atajo: negocio con su dueño (usa la función real crear_organizacion). */
export async function crearNegocio(
  db: Bd,
  nombre: string,
  email: string,
  nicho = "ferreteria",
): Promise<{ orgId: string; duenoId: string; bodegaId: string }> {
  const duenoId = await crearUsuario(db, email);
  const orgId = await comoUsuario(db, duenoId, async () => {
    const r = await db.query<{ id: string }>("select crear_organizacion($1, $2, $3) as id", [
      nombre,
      nicho,
      `Dueño de ${nombre}`,
    ]);
    return r.rows[0]!.id;
  });
  const b = await db.query<{ id: string }>(
    "select id from bodegas where organizacion_id = $1 and es_principal",
    [orgId],
  );
  return { orgId, duenoId, bodegaId: b.rows[0]!.id };
}

export type RolMiembro = "dueno" | "admin" | "vendedor" | "bodeguero" | "contador" | "ruta";

/** Agrega un miembro con rol a un negocio existente (lo hace el superusuario, como una invitación aceptada). */
export async function agregarMiembro(
  db: Bd,
  orgId: string,
  email: string,
  rol: RolMiembro,
): Promise<string> {
  const id = await crearUsuario(db, email);
  await db.query(
    "insert into miembros (organizacion_id, usuario_id, rol, nombre) values ($1, $2, $3, $4)",
    [orgId, id, rol, email],
  );
  return id;
}

/** Intenta algo que debe fallar y devuelve el mensaje de error (o null si NO falló). */
export async function mensajeDeError(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
