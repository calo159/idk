/** Migración 0006: el cupo de crédito solo lo cambian dueño y admin. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { cliente } from "./fabrica";

let db: Bd;
let orgId: string;
let dueno: string;
let vendedor: string;
let admin: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Cupo SAS", "cupo@x.co");
  orgId = n.orgId;
  dueno = n.duenoId;
  vendedor = await agregarMiembro(db, orgId, "v@cupo.co", "vendedor");
  admin = await agregarMiembro(db, orgId, "a@cupo.co", "admin");
});
afterAll(async () => db.close());

describe("cupo de crédito protegido", () => {
  it("un vendedor no puede subir el cupo ni crear clientes con cupo", async () => {
    const id = await cliente(db, orgId, { cupo: 1000 });
    const e1 = await comoUsuario(db, vendedor, () =>
      mensajeDeError(() => db.query("update clientes set cupo_credito = 9999999 where id = $1", [id])),
    );
    expect(e1).toMatch(/define el cupo/);
    const e2 = await comoUsuario(db, vendedor, () =>
      mensajeDeError(() =>
        db.query("insert into clientes (organizacion_id, nombre, cupo_credito) values ($1,'X',5000)", [orgId]),
      ),
    );
    expect(e2).toMatch(/define el cupo/);
  });

  it("el vendedor sí crea clientes sin cupo y edita otros datos", async () => {
    await comoUsuario(db, vendedor, async () => {
      const r = await db.query<{ id: string }>(
        "insert into clientes (organizacion_id, nombre) values ($1,'Sin cupo') returning id",
        [orgId],
      );
      await db.query("update clientes set nombre = 'Sin cupo 2' where id = $1", [r.rows[0]!.id]);
    });
  });

  it("dueño y admin cambian el cupo y queda en auditoría", async () => {
    const id = await cliente(db, orgId, { cupo: 1000 });
    await comoUsuario(db, dueno, () => db.query("update clientes set cupo_credito = 2000 where id = $1", [id]));
    await comoUsuario(db, admin, () => db.query("update clientes set cupo_credito = 3000 where id = $1", [id]));
    const a = await db.query<{ n: string }>(
      "select count(*)::text n from auditoria where tabla='clientes' and registro_id=$1 and accion='cambio_cupo'",
      [id],
    );
    expect(a.rows[0]!.n).toBe("2");
  });

  it("actualizar sin tocar el cupo no genera auditoría ni error", async () => {
    const id = await cliente(db, orgId, { cupo: 1000 });
    await comoUsuario(db, vendedor, () => db.query("update clientes set nombre = 'Nuevo' where id = $1", [id]));
    const a = await db.query<{ n: string }>(
      "select count(*)::text n from auditoria where registro_id=$1 and accion='cambio_cupo'",
      [id],
    );
    expect(a.rows[0]!.n).toBe("0");
  });
});
