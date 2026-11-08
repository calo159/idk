import { beforeEach, describe, expect, it, vi } from "vitest";

let usuario: { id: string; email: string } | null = null;
let esAdmin: unknown = false;
const rpc = vi.fn(async () => ({ data: esAdmin }));
vi.mock("@/lib/supabase/servidor", () => ({ crearClienteServidor: async () => ({ auth: { getUser: async () => ({ data: { user: usuario } }) }, rpc }) }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
}));

const { requerirSuperAdmin } = await import("./admin");
beforeEach(() => {
  usuario = { id: "u1", email: "soporte@surtix.co" };
  esAdmin = true;
  rpc.mockClear();
});

describe("requerirSuperAdmin", () => {
  it("sin sesión manda a iniciar sesión (y vuelve al panel)", async () => {
    usuario = null;
    await expect(requerirSuperAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?siguiente=%2Fadmin");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("alguien con sesión que no es del equipo ve un 404", async () => {
    esAdmin = false;
    await expect(requerirSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("una respuesta rara de la base de datos no abre el panel (solo `true` exacto)", async () => {
    for (const raro of ["true", 1, {}, null, undefined]) {
      esAdmin = raro;
      await expect(requerirSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
  it("el equipo de Surtix entra", async () => {
    await expect(requerirSuperAdmin()).resolves.toMatchObject({ usuarioId: "u1", correo: "soporte@surtix.co" });
  });
});
