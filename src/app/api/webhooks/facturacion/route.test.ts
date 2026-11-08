import { beforeEach, describe, expect, it, vi } from "vitest";

const procesar = vi.fn();
vi.mock("@/server/facturacion/procesar", () => ({ procesarCola: (...a: unknown[]) => procesar(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: () => ({}) }));

const TOKEN = "token-de-n8n-largo-1234567890";
beforeEach(() => {
  procesar.mockReset();
  process.env.SURTIX_API_TOKEN = TOKEN;
});
const { POST } = await import("./route");
const llamar = (token: string | null = TOKEN) => POST(new Request("http://x/api/webhooks/facturacion", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }));

describe("POST /api/webhooks/facturacion", () => {
  it("sin token o con uno equivocado: 401 y no procesa nada", async () => {
    expect((await llamar(null)).status).toBe(401);
    expect((await llamar("otro-token-distinto-1234567")).status).toBe(401);
    expect(procesar).not.toHaveBeenCalled();
  });
  it("sin token configurado en el servidor: 503", async () => {
    delete process.env.SURTIX_API_TOKEN;
    expect((await llamar()).status).toBe(503);
  });
  it("procesa la cola y devuelve el resumen", async () => {
    procesar.mockResolvedValueOnce({ tomadas: 3, aceptadas: 2, rechazadas: 1, errores: 0 });
    expect(await (await llamar()).json()).toEqual({ ok: true, tomadas: 3, aceptadas: 2, rechazadas: 1, errores: 0 });
  });
  it("si falla responde 500 sin filtrar el motivo", async () => {
    procesar.mockRejectedValueOnce(new Error("clave secreta xyz"));
    const r = await llamar();
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("xyz");
  });
});
