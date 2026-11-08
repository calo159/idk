import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, crearBd, listarMigraciones } from "./bd";

describe("migraciones", () => {
  let db: Bd;
  beforeAll(async () => {
    db = await crearBd();
  });
  afterAll(async () => {
    await db.close();
  });

  it("existe al menos la migración 0001 y están numeradas en orden", () => {
    const nombres = listarMigraciones().map((m) => m.nombre);
    expect(nombres[0]).toBe("0001_esquema_inicial.sql");
    expect(nombres).toEqual([...nombres].sort());
  });

  it("todas las tablas de negocio tienen RLS activado", async () => {
    const r = await db.query<{ tabla: string }>(`
      select c.relname as tabla
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(r.rows.map((x) => x.tabla)).toEqual([]);
  });

  it("toda tabla de negocio (salvo organizaciones y catálogos globales) tiene organizacion_id", async () => {
    const r = await db.query<{ tabla: string }>(`
      select c.relname as tabla
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('organizaciones', 'planes') -- planes: catálogo de precios global
        and not exists (select 1 from pg_attribute a
                         where a.attrelid = c.oid and a.attname = 'organizacion_id' and not a.attisdropped)
    `);
    expect(r.rows.map((x) => x.tabla)).toEqual([]);
  });
});
