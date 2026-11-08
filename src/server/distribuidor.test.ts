import { beforeEach, describe, expect, it, vi } from "vitest";

let usuario: { id: string; email: string } | null = null;
let mios: { id: string; nombre: string }[] | null = [];
const rpc = vi.fn(async () => ({ data: mios }));
vi.mock("@/lib/supabase/servidor", () => ({ crearClienteServidor: async () => ({ auth: { getUser: async () => ({ data: { user: usuario } }) }, rpc }) }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
}));

const { requerirDistribuidor } = await import("./distribuidor");
beforeEach(() => {
  usuario = { id: "u1", email: "ventas@cementos.co" };
  mios = [{ id: "d1", nombre: "Cementos del Caribe" }];
  rpc.mockClear();
});

describe("requerirDistribuidor", () => {
  it("sin sesión manda a iniciar sesión (y vuelve al portal)", async () => {
    usuario = null;
    await expect(requerirDistribuidor()).rejects.toThrow("NEXT_REDIRECT:/login?siguiente=%2Fdistribuidor");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("alguien que no es de ningún distribuidor ve un 404", async () => {
    mios = [];
    await expect(requerirDistribuidor()).rejects.toThrow("NEXT_NOT_FOUND");
    mios = null;
    await expect(requerirDistribuidor()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("una persona del distribuidor entra con su distribuidor", async () => {
    await expect(requerirDistribuidor()).resolves.toMatchObject({ distribuidor: { id: "d1", nombre: "Cementos del Caribe" }, correo: "ventas@cementos.co" });
  });
});
