import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmar } from "@/lib/firma";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: () => ({ rpc }) }));

const TOKEN = "token-de-n8n-largo-1234567890";
const SECRETO = "secreto-hmac-de-32-caracteres-ok!!";
beforeEach(() => {
  rpc.mockReset();
  process.env.SURTIX_API_TOKEN = TOKEN;
  process.env.N8N_WEBHOOK_SECRET = SECRETO;
});

const { GET } = await import("./route");
const { POST } = await import("./[id]/route");

const get = (token?: string) => GET(new Request("http://x/api/webhooks/eventos", { headers: token ? { authorization: `Bearer ${token}` } : {} }));
const post = (id: string, cuerpo: unknown, opciones: { token?: string; firmar?: boolean; secreto?: string } = {}) => {
  const texto = JSON.stringify(cuerpo);
  const f = firmar(texto, opciones.secreto ?? SECRETO);
  return POST(
    new Request(`http://x/api/webhooks/eventos/${id}`, {
      method: "POST",
      body: texto,
      headers: {
        authorization: `Bearer ${opciones.token ?? TOKEN}`,
        ...(opciones.firmar === false ? {} : { "x-surtix-firma": f.firma, "x-surtix-fecha": f.fecha }),
      },
    }),
    { params: Promise.resolve({ id }) },
  );
};

describe("GET /api/webhooks/eventos", () => {
  it("sin token o con token malo: 401 y no toca la base de datos", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("otro-token")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("entrega el mensaje armado y marca para omitir lo que no tiene destino o texto", async () => {
    rpc.mockResolvedValue({
      error: null,
      data: [
        { id: 1, organizacion_id: "o", organizacion: "Ferretería El Puerto", telefono_whatsapp: "3015550100", tipo: "alerta.creada", payload: { severidad: "alta", mensaje: "Faltante de caja" }, intentos: 1 },
        { id: 2, organizacion_id: "o", organizacion: "Ferretería El Puerto", telefono_whatsapp: null, tipo: "alerta.creada", payload: { mensaje: "x" }, intentos: 1 },
        { id: 3, organizacion_id: "o", organizacion: "Ferretería El Puerto", telefono_whatsapp: "3015550100", tipo: "compra.anulada", payload: {}, intentos: 1 },
      ],
    });
    const r = await get(TOKEN);
    const { eventos } = await r.json();
    expect(eventos[0]).toMatchObject({ id: 1, destino: "573015550100", omitir: false });
    expect(eventos[0].mensaje).toContain("Faltante de caja");
    expect(eventos[1]).toMatchObject({ omitir: true, destino: null });
    expect(eventos[2]).toMatchObject({ omitir: true, mensaje: null });
    expect(rpc).toHaveBeenCalledWith("reclamar_eventos", { p_limite: 50 });
  });
  it("un error de base de datos no filtra detalles", async () => {
    rpc.mockResolvedValue({ error: { message: "secreto interno" }, data: null });
    const r = await get(TOKEN);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secreto interno");
  });
});

describe("POST /api/webhooks/eventos/[id]", () => {
  it("confirma un evento con token y firma válidos", async () => {
    rpc.mockResolvedValue({ error: null });
    expect((await post("7", { ok: true })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("finalizar_evento", { p_id: 7, p_ok: true, p_error: undefined });
  });
  it("registra el fallo de envío", async () => {
    rpc.mockResolvedValue({ error: null });
    await post("8", { ok: false, error: "WhatsApp rechazó el número" });
    expect(rpc).toHaveBeenCalledWith("finalizar_evento", { p_id: 8, p_ok: false, p_error: "WhatsApp rechazó el número" });
  });
  it("sin firma, con firma de otro secreto o sin token: 401", async () => {
    expect((await post("7", { ok: true }, { firmar: false })).status).toBe(401);
    expect((await post("7", { ok: true }, { secreto: "otro-secreto-distinto-de-32-chars!!" })).status).toBe(401);
    expect((await post("7", { ok: true }, { token: "malo" })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("id y cuerpo inválidos: 400", async () => {
    expect((await post("abc", { ok: true })).status).toBe(400);
    expect((await post("7", { ok: "si" })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("si falta configuración responde 503 en vez de aceptar todo", async () => {
    delete process.env.N8N_WEBHOOK_SECRET;
    expect((await post("7", { ok: true })).status).toBe(503);
  });
});
