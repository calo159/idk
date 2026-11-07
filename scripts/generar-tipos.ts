/**
 * Genera src/lib/supabase/tipos.ts leyendo el catálogo de Postgres de una base con todas las
 * migraciones aplicadas (PGlite, sin Docker). Produce el mismo formato `Database` que
 * `supabase gen types typescript`, para que supabase-js tipe consultas y RPC.
 *
 * Uso: npm run db:tipos          (sin Docker)
 *      npm run db:tipos:local    (con `supabase start`, usa el generador oficial)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { crearBd } from "../src/test/db/bd";

type Fila = Record<string, unknown>;

const TIPOS_TS: Record<string, string> = {
  text: "string",
  "character varying": "string",
  character: "string",
  citext: "string",
  uuid: "string",
  date: "string",
  "timestamp with time zone": "string",
  "timestamp without time zone": "string",
  "time without time zone": "string",
  inet: "string",
  integer: "number",
  smallint: "number",
  bigint: "number",
  numeric: "number",
  real: "number",
  "double precision": "number",
  boolean: "boolean",
  json: "Json",
  jsonb: "Json",
  void: "undefined",
};

async function main() {
  const db = await crearBd();
  const q = async <T extends Fila>(sql: string) => (await db.query<T>(sql)).rows;

  const enums = await q<{ nombre: string; valores: string[] }>(`
    select t.typname as nombre, array_agg(e.enumlabel order by e.enumsortorder) as valores
    from pg_type t join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' group by t.typname order by t.typname`);
  const nombresEnum = new Set(enums.map((e) => e.nombre));

  const ts = (pg: string): string => {
    const esArray = pg.endsWith("[]");
    const base = esArray ? pg.slice(0, -2) : pg;
    const t = nombresEnum.has(base)
      ? `Database["public"]["Enums"]["${base}"]`
      : (TIPOS_TS[base] ?? "unknown");
    return esArray ? `${t}[]` : t;
  };

  const columnas = await q<{
    tabla: string;
    tipo_rel: string;
    columna: string;
    tipo: string;
    no_nula: boolean;
    tiene_default: boolean;
    identidad: string;
    generada: string;
  }>(`
    select c.relname as tabla, c.relkind as tipo_rel, a.attname as columna,
           format_type(a.atttypid, null) as tipo, a.attnotnull as no_nula,
           a.atthasdef as tiene_default, a.attidentity as identidad, a.attgenerated as generada
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'v')
    order by c.relname, a.attnum`);

  const unicos = await q<{ tabla: string; columnas: string[] }>(`
    select c.relname as tabla,
           (select array_agg(a.attname order by a.attname) from pg_attribute a
             where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) as columnas
    from pg_index i join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where i.indisunique and i.indpred is null and n.nspname = 'public'`);

  const fks = await q<{
    nombre: string;
    tabla: string;
    columnas: string[];
    referencia: string;
    columnas_ref: string[];
  }>(`
    select con.conname as nombre, c.relname as tabla,
           (select array_agg(a.attname order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as columnas,
           rf.relname as referencia,
           (select array_agg(a.attname order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as columnas_ref
    from pg_constraint con join pg_class c on c.oid = con.conrelid
    join pg_class rf on rf.oid = con.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f' and n.nspname = 'public'
    order by c.relname, con.conname`);

  const funciones = await q<{
    nombre: string;
    nombres_args: string[] | null;
    tipos_args: string[] | null;
    con_default: number;
    retorno: string;
    es_set: boolean;
    salidas: { nombre: string; tipo: string }[] | null;
  }>(`
    select p.proname as nombre, p.proargnames as nombres_args,
           (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) as tipos_args,
           p.pronargdefaults as con_default, format_type(p.prorettype, null) as retorno, p.proretset as es_set,
           (select json_agg(json_build_object('nombre', n, 'tipo', format_type(t, null)) order by o)
              from unnest(p.proallargtypes, p.proargnames, p.proargmodes) with ordinality u(t, n, m, o)
             where m in ('t', 'o')) as salidas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname`);

  const tablas = new Map<string, typeof columnas>();
  for (const c of columnas) {
    const k = `${c.tipo_rel}:${c.tabla}`;
    tablas.set(k, [...(tablas.get(k) ?? []), c]);
  }

  const L: string[] = [];
  L.push("// ⚠ ARCHIVO AUTOGENERADO — no editar a mano. Regenerar con: npm run db:tipos");
  L.push("");
  L.push(
    "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
  );
  L.push("");
  L.push("export type Database = {");
  L.push("  public: {");
  L.push("    Tables: {");
  for (const [k, cols] of tablas) {
    if (!k.startsWith("r:")) continue;
    const nombre = k.slice(2);
    L.push(`      ${nombre}: {`);
    L.push("        Row: {");
    for (const c of cols)
      L.push(`          ${c.columna}: ${ts(c.tipo)}${c.no_nula ? "" : " | null"};`);
    L.push("        };");
    L.push("        Insert: {");
    for (const c of cols) {
      if (c.generada === "s" || c.identidad === "a") {
        L.push(`          ${c.columna}?: never;`);
        continue;
      }
      const opcional = !c.no_nula || c.tiene_default || c.identidad === "d";
      L.push(
        `          ${c.columna}${opcional ? "?" : ""}: ${ts(c.tipo)}${c.no_nula ? "" : " | null"};`,
      );
    }
    L.push("        };");
    L.push("        Update: {");
    for (const c of cols) {
      if (c.generada === "s" || c.identidad === "a") {
        L.push(`          ${c.columna}?: never;`);
        continue;
      }
      L.push(`          ${c.columna}?: ${ts(c.tipo)}${c.no_nula ? "" : " | null"};`);
    }
    L.push("        };");
    const rel = fks.filter((f) => f.tabla === nombre);
    if (rel.length === 0) {
      L.push("        Relationships: [];");
    } else {
      L.push("        Relationships: [");
      for (const f of rel) {
        const claveFk = [...f.columnas].sort().join(",");
        const uno = unicos.some(
          (u) => u.tabla === nombre && [...u.columnas].sort().join(",") === claveFk,
        );
        L.push("          {");
        L.push(`            foreignKeyName: "${f.nombre}";`);
        L.push(`            columns: [${f.columnas.map((x) => `"${x}"`).join(", ")}];`);
        L.push(`            isOneToOne: ${uno};`);
        L.push(`            referencedRelation: "${f.referencia}";`);
        L.push(
          `            referencedColumns: [${f.columnas_ref.map((x) => `"${x}"`).join(", ")}];`,
        );
        L.push("          },");
      }
      L.push("        ];");
    }
    L.push("      };");
  }
  L.push("    };");
  L.push("    Views: {");
  for (const [k, cols] of tablas) {
    if (!k.startsWith("v:")) continue;
    L.push(`      ${k.slice(2)}: {`);
    L.push("        Row: {");
    for (const c of cols) L.push(`          ${c.columna}: ${ts(c.tipo)} | null;`);
    L.push("        };");
    L.push("        Relationships: [];");
    L.push("      };");
  }
  L.push("    };");
  L.push("    Functions: {");
  for (const f of funciones) {
    const nombres = f.nombres_args ?? [];
    const tipos = f.tipos_args ?? [];
    const primeroOpcional = tipos.length - f.con_default;
    L.push(`      ${f.nombre}: {`);
    if (tipos.length === 0) {
      L.push("        Args: Record<PropertyKey, never>;");
    } else {
      L.push("        Args: {");
      tipos.forEach((t, i) => {
        L.push(`          ${nombres[i] ?? `arg${i}`}${i >= primeroOpcional ? "?" : ""}: ${ts(t)};`);
      });
      L.push("        };");
    }
    if (f.salidas && f.salidas.length > 0) {
      // `returns table (...)`: cada columna de salida con su tipo.
      const cols = f.salidas.map((c) => `${c.nombre}: ${ts(c.tipo)}`).join("; ");
      L.push(`        Returns: { ${cols} }[];`);
    } else {
      const r = ts(f.retorno);
      L.push(`        Returns: ${f.es_set ? `${r}[]` : r};`);
    }
    L.push("      };");
  }
  L.push("    };");
  L.push("    Enums: {");
  for (const e of enums) {
    L.push(`      ${e.nombre}: ${e.valores.map((v) => `"${v}"`).join(" | ")};`);
  }
  L.push("    };");
  L.push("    CompositeTypes: Record<string, never>;");
  L.push("  };");
  L.push("};");
  L.push("");
  L.push(`type PublicSchema = Database["public"];`);
  L.push("");
  L.push(
    'export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];',
  );
  L.push(
    'export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];',
  );
  L.push(
    'export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];',
  );
  L.push('export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];');
  L.push("");

  const destino = join(process.cwd(), "src", "lib", "supabase", "tipos.ts");
  writeFileSync(destino, L.join("\n"), "utf8");
  await db.close();
  console.log(`Tipos generados en ${destino}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
