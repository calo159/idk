import { normalizarTexto, similitudNombres } from "@/lib/validaciones/ia";

/** Un renglón pedido por el cliente, antes de emparejarlo con el catálogo. */
export interface ItemPedido {
  descripcion: string;
  cantidad: number;
}

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, docena: 12, media: 0.5, medio: 0.5,
};
const UNIDADES = /^(unidades?|und|metros?|mts?|kilos?|kg|libras?|bultos?|bolsas?|cajas?|paquetes?|rollos?|galones?|litros?|pares?|docenas?)$/;
const RELLENO = /^(de|del|la|el|los|las|me|regalas?|regalen|necesito|quiero|quisiera|mandame|mándame|enviame|envíame|pido|favor|por|porfa|hola|buenas|buenos|dias|tardes|noches|ola|pedido|gracias|muchas|saludos|please)$/;

const n = (w: string) => normalizarTexto(w);

/** Divide «2 cemento, 10 metros de cable y 1 martillo» en renglones con cantidad. Sin IA, sin costo. */
export function extraerItemsReglas(textoCrudo: string): ItemPedido[] {
  // Los saltos de línea separan renglones (listas pegadas o enviadas desde el catálogo). Se descartan las líneas que son
  // solo encabezado («Hola, quiero pedir:») o una nota entre paréntesis («(Total aproximado $ 86.000)»).
  const texto = textoCrudo
    .slice(0, 2000)
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l && !l.endsWith(":") && !/^\(.*\)$/.test(l))
    .join("\n")
    .slice(0, 1000);
  const trozos = texto.split(/(?<!\d),|,(?!\d)|[;\n]+|\s+y\s+(?=\d|un |una |dos |tres |cuatro |cinco |medio |media )/i).map((t) => t.trim()).filter(Boolean);
  const items: ItemPedido[] = [];
  for (const trozo of trozos) {
    const palabras = trozo.split(/\s+/);
    const quitarRelleno = () => {
      while (palabras.length && RELLENO.test(n(palabras[0]!))) palabras.shift();
    };
    quitarRelleno();
    if (palabras.length === 0) continue;
    let cantidad = 1;
    const primera = palabras[0]!;
    if (/^\d+([.,]\d+)?$/.test(primera)) {
      cantidad = Number(primera.replace(",", "."));
      palabras.shift();
    } else if (NUMEROS[n(primera)] !== undefined) {
      cantidad = NUMEROS[n(primera)]!;
      palabras.shift();
      if (cantidad === 0.5 && n(palabras[0] ?? "") === "docena") {
        cantidad = 6;
        palabras.shift();
      }
    }
    if (palabras.length && UNIDADES.test(n(palabras[0]!))) palabras.shift();
    quitarRelleno();
    const descripcion = n(palabras.join(" "));
    if (descripcion.length < 2 || !(cantidad > 0) || cantidad > 100000) continue;
    items.push({ descripcion, cantidad });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Emparejar con el catálogo
// ---------------------------------------------------------------------------
export interface ProductoCatalogoPedido {
  id: string;
  nombre: string;
  precio: number;
}

export interface LineaPedido {
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
}

export interface NoEncontrado {
  descripcion: string;
  cantidad: number;
  /** Productos parecidos para que la persona elija (cuando hay varios posibles). */
  candidatos: { producto_id: string; nombre: string }[];
}

const raiz = (t: string) => (t.length > 4 && t.endsWith("es") ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
const tokens = (t: string) => normalizarTexto(t).split(" ").filter(Boolean).map(raiz);

export function emparejarItems(items: ItemPedido[], catalogo: ProductoCatalogoPedido[]): { lineas: LineaPedido[]; noEncontrados: NoEncontrado[] } {
  const prod = catalogo.map((p) => ({ p, t: new Set(tokens(p.nombre)) }));
  const lineas: LineaPedido[] = [];
  const noEncontrados: NoEncontrado[] = [];

  for (const item of items) {
    const q = tokens(item.descripcion);
    // Candidatos: contienen TODAS las palabras pedidas.
    let candidatos = prod.filter(({ t }) => q.every((w) => t.has(w)));
    if (candidatos.length === 0) {
      // Si no, los más parecidos por palabras compartidas (Jaccard) con un mínimo razonable.
      candidatos = prod.filter(({ p }) => similitudNombres(p.nombre, item.descripcion) >= 0.6);
    }
    const ordenados = candidatos
      .map((c) => ({ ...c, s: similitudNombres(c.p.nombre, item.descripcion) }))
      .sort((a, b) => b.s - a.s || a.p.nombre.length - b.p.nombre.length);

    const mejor = ordenados[0];
    const segundo = ordenados[1];
    // Ambiguo: dos productos distintos igual de buenos → que decida una persona.
    const ambiguo = !!mejor && !!segundo && segundo.s >= mejor.s - 0.05 && mejor.s < 0.99;
    if (!mejor || ambiguo) {
      noEncontrados.push({
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        candidatos: ordenados.slice(0, 3).map((c) => ({ producto_id: c.p.id, nombre: c.p.nombre })),
      });
      continue;
    }
    const previa = lineas.find((l) => l.producto_id === mejor.p.id);
    if (previa) previa.cantidad += item.cantidad;
    else lineas.push({ producto_id: mejor.p.id, nombre: mejor.p.nombre, cantidad: item.cantidad, precio: mejor.p.precio });
  }
  return { lineas, noEncontrados };
}

/** Respuesta automática al cliente al recibir su pedido (no promete precios ni existencias). */
export function mensajeRecepcionPedido(negocio: string, lineas: LineaPedido[], noEncontrados: NoEncontrado[]): string {
  const partes = [`¡Hola! Recibimos tu pedido en *${negocio}* ✅`];
  if (lineas.length) partes.push(lineas.map((l) => `• ${l.cantidad} × ${l.nombre}`).join("\n"));
  if (noEncontrados.length) partes.push(`Estos los vamos a confirmar contigo: ${noEncontrados.map((n) => n.descripcion).join(", ")}.`);
  partes.push("Te escribimos en unos minutos con el total para que confirmes.");
  return partes.join("\n");
}
