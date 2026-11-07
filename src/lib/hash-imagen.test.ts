import { describe, expect, it } from "vitest";
import { distanciaHamming, dHashDesdeGris, esHashPerceptual } from "./hash-imagen";

const degradado = Array.from({ length: 72 }, (_, i) => (i % 9) * 28);

describe("dHash", () => {
  it("produce 16 caracteres hex y es determinista", () => {
    const h = dHashDesdeGris(degradado);
    expect(esHashPerceptual(h)).toBe(true);
    expect(dHashDesdeGris(degradado)).toBe(h);
  });
  it("es estable ante un cambio uniforme de brillo", () => {
    const mas = degradado.map((v) => Math.min(255, v + 10));
    expect(distanciaHamming(dHashDesdeGris(degradado), dHashDesdeGris(mas))).toBe(0);
  });
  it("imágenes distintas quedan lejos", () => {
    const inverso = [...degradado].reverse();
    expect(distanciaHamming(dHashDesdeGris(degradado), dHashDesdeGris(inverso))).toBeGreaterThan(20);
  });
  it("distancia de Hamming básica", () => {
    expect(distanciaHamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(distanciaHamming("f0f0f0f0f0f0f0f0", "f0f0f0f0f0f0f0f3")).toBe(2);
  });
  it("exige 72 píxeles", () => {
    expect(() => dHashDesdeGris([1, 2, 3])).toThrow();
  });
});
