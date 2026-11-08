import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmar } from "@/lib/firma";

const rpc = vi.fn();
const productos = [{ id: "p1", nombre: "Cemento gris 50 kg", precio_venta: 34000 }, { id: "p2", nombre: "Arena de río (bulto)", precio_venta: 6000 }];
vi.mock("@/lib/supabase/admin", () => ({
  crearClienteAdmin: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: productos }) }) }) }) }) }),
}));

const TOKEN = "token-de-n8n-largo-1234567890";
const SECRETO = "secreto-hmac-de-32-caracteres-ok!!";
const negocio = { organizacion_id: "o1", organizacion: "Ferretería El Puerto" };
beforeEach(() => {
  rpc.mockReset();
  process.env.SURTIX_API_TOKEN = TOKEN;
  process.env.N8N_WEBHOOK_SECRET = SECRETO;
  delete process.env.ANTHROPIC_API_KEY;
});
const { POST } = await import("./route");
const enviar = (cuerpo: unknown, firmado = true) => {
  const t = JSON.stringify(cuerpo);
  const f = firmar(t, SECRETO);
  return POST(new Request("http://x/api/webhooks/pedido", { method: "POST", body: t, headers: { authorization: `Bearer ${TOKEN}`, ...(firmado ? { "x-surtix-firma": f.firma, "x-surtix-fecha": f.fecha } : {}) } }));
};
const msg = (texto: string, id = "wamid.1") => ({ phone_number_id: "1234567890", telefono: "573112223344", texto, mensaje_id: id });

describe("POST /api/webhooks/pedido", () => {
  it("sin firma: 401 sin tocar la base de datos", async () => {
    expect((await enviar(msg("2 cemento"), false)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("un número de WhatsApp que no es de ningún negocio no recibe respuesta", async () => {
    rpc.mockResolvedValueOnce({ data: [] });
    expect(await (await enviar(msg("2 cemento"))).json()).toEqual({ respuesta: null, motivo: "negocio_no_encontrado" });
  });
  it("crea un pedido pendiente con lo que entendió y responde al cliente", async () => {
    rpc.mockResolvedValueOnce({ data: [negocio] }).mockResolvedValueOnce({ data: [{ pedido_id: "ped1", nuevo: true, cliente_id: null }], error: null });
    const r = await (await enviar(msg("hola, 2 cemento gris y 3 arenas, 1 unicornio"))).json();
    expect(r.destino).toBe("573112223344");
    expect(r.respuesta).toContain("• 2 × Cemento gris 50 kg");
    expect(r.respuesta).toContain("• 3 × Arena de río (bulto)");
    expect(r.respuesta).toContain("confirmar contigo: unicornio");
    const [nombre, args] = rpc.mock.calls[1] as [string, { p_lineas: unknown[]; p_no_encontrados: unknown[]; p_org: string }];
    expect(nombre).toBe("registrar_pedido_whatsapp");
    expect(args.p_org).toBe("o1");
    expect(args.p_lineas).toHaveLength(2);
    expect(args.p_no_encontrados).toHaveLength(1);
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("confirmar_venta"); // nunca crea ventas
  });
  it("si no entiende nada, pide que lo escriba de otra forma y NO guarda nada", async () => {
    rpc.mockResolvedValueOnce({ data: [negocio] });
    const r = await (await enviar(msg("gracias"))).json();
    expect(r.respuesta).toContain("No logré entender");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("un reenvío del mismo mensaje no vuelve a responder", async () => {
    rpc.mockResolvedValueOnce({ data: [negocio] }).mockResolvedValueOnce({ data: [{ pedido_id: "ped1", nuevo: false, cliente_id: null }], error: null });
    expect(await (await enviar(msg("2 cemento gris"))).json()).toEqual({ respuesta: null, motivo: "mensaje_repetido" });
  });
  it("teléfono inválido y cuerpo inválido", async () => {
    expect(await (await enviar({ ...msg("2 cemento"), telefono: "12345678" })).json()).toEqual({ respuesta: null, motivo: "telefono_invalido" });
    expect((await enviar({ texto: "x" })).status).toBe(400);
  });
});
