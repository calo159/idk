import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: () => ({ rpc }) }));

const SECRETO = "eventos_secreto_de_prueba";
beforeEach(() => {
  rpc.mockReset();
  process.env.WOMPI_EVENTS_SECRET = SECRETO;
});
const { POST } = await import("./route");

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
function evento(o: { status?: string; centavos?: number; ref?: string; tipo?: string; secreto?: string } = {}) {
  const tx = { id: "tx-1", status: o.status ?? "APPROVED", amount_in_cents: o.centavos ?? 7_990_000, reference: o.ref ?? "SUR-ABC" };
  const ts = 1_700_000_000;
  return {
    event: o.tipo ?? "transaction.updated", data: { transaction: tx }, timestamp: ts, environment: "test",
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: sha(`${tx.id}${tx.status}${tx.amount_in_cents}${ts}${o.secreto ?? SECRETO}`) },
  };
}
const enviar = (cuerpo: unknown) => POST(new Request("http://x/api/webhooks/wompi", { method: "POST", body: JSON.stringify(cuerpo) }));

describe("POST /api/webhooks/wompi", () => {
  it("sin secreto configurado: 503", async () => {
    delete process.env.WOMPI_EVENTS_SECRET;
    expect((await enviar(evento())).status).toBe(503);
  });
  it("checksum inválido: 401 y no toca la base de datos", async () => {
    expect((await enviar(evento({ secreto: "otro" }))).status).toBe(401);
    expect((await enviar({ hola: 1 })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("pago aprobado: aplica en la BD con el monto en pesos", async () => {
    rpc.mockResolvedValueOnce({ data: "aplicado", error: null });
    const r = await (await enviar(evento())).json();
    expect(r).toEqual({ ok: true, resultado: "aplicado" });
    expect(rpc).toHaveBeenCalledWith("aplicar_pago_suscripcion", expect.objectContaining({ p_referencia: "SUR-ABC", p_transaccion_id: "tx-1", p_estado: "aprobado", p_monto: 79900 }));
  });
  it("pago rechazado: lo registra como rechazado", async () => {
    rpc.mockResolvedValueOnce({ data: "rechazado", error: null });
    await enviar(evento({ status: "DECLINED" }));
    expect(rpc).toHaveBeenCalledWith("aplicar_pago_suscripcion", expect.objectContaining({ p_estado: "rechazado" }));
  });
  it("pendiente y eventos de otro tipo se ignoran con 200", async () => {
    expect(await (await enviar(evento({ status: "PENDING" }))).json()).toEqual({ ok: true, pendiente: true });
    expect(await (await enviar(evento({ tipo: "nequi_token.updated" }))).json()).toEqual({ ok: true, ignorado: true });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("si la BD falla responde 500 (Wompi reintentará); un pago desconocido responde 200", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "connection" } });
    expect((await enviar(evento())).status).toBe(500);
    rpc.mockResolvedValueOnce({ data: "desconocido", error: null });
    expect((await enviar(evento())).status).toBe(200);
  });
});
