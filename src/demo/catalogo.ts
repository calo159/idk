/** Catálogo de la ferretería de demo (precios aproximados de Riohacha, en COP). Nombres genéricos, sin marcas reales. */

export interface ProductoDemo {
  nombre: string;
  categoria: string;
  unidad: string;
  costo: number;
  precio: number;
  /** Ventas esperadas por día (promedio) y tamaño típico de la venta. */
  rotacion: number;
  loteTipico: number;
  minimo: number;
  barras?: string;
  /** Presentación opcional, ej. caja x12. */
  presentacion?: { nombre: string; factor: number; precio: number };
}

const p = (
  nombre: string, categoria: string, unidad: string, costo: number, precio: number,
  rotacion: number, loteTipico = 1, minimo = 5, extra: Partial<ProductoDemo> = {},
): ProductoDemo => ({ nombre, categoria, unidad, costo, precio, rotacion, loteTipico, minimo, ...extra });

export const CATALOGO: ProductoDemo[] = [
  // Construcción
  p("Cemento gris 50 kg", "Construcción", "unidad", 29500, 34000, 4.5, 2, 30, { barras: "7701000000011" }),
  p("Cemento blanco 5 kg", "Construcción", "unidad", 14000, 18500, 0.8, 1, 8),
  p("Arena de río (bulto)", "Construcción", "unidad", 3800, 6000, 3, 3, 30),
  p("Varilla corrugada 3/8 x 6 m", "Construcción", "unidad", 19000, 24500, 2, 4, 20),
  p("Varilla corrugada 1/2 x 6 m", "Construcción", "unidad", 33000, 40000, 1.2, 3, 15),
  p("Alambre de amarre", "Construcción", "kilo", 6200, 8500, 2.2, 2, 20),
  p("Ladrillo común", "Construcción", "unidad", 650, 950, 12, 40, 400),
  p("Malla electrosoldada 2.35 x 6 m", "Construcción", "unidad", 118000, 142000, 0.3, 1, 3),
  // Plomería
  p("Tubo PVC presión 1/2\" x 6 m", "Plomería", "unidad", 14500, 19000, 1.4, 2, 12),
  p("Tubo PVC presión 3/4\" x 6 m", "Plomería", "unidad", 21500, 27500, 1, 2, 10),
  p("Tubo sanitario PVC 4\" x 3 m", "Plomería", "unidad", 31000, 39000, 0.9, 1, 8),
  p("Codo PVC presión 1/2\"", "Plomería", "unidad", 650, 1200, 6, 4, 60, { presentacion: { nombre: "Caja x50", factor: 50, precio: 52000 } }),
  p("Unión PVC presión 1/2\"", "Plomería", "unidad", 500, 1000, 5, 4, 60),
  p("Tee PVC presión 1/2\"", "Plomería", "unidad", 800, 1500, 4, 3, 50),
  p("Pegante PVC 1/8 galón", "Plomería", "unidad", 16500, 22000, 1.6, 1, 10),
  p("Cinta teflón", "Plomería", "unidad", 700, 1500, 7, 3, 60),
  p("Llave lavamanos cromada", "Plomería", "unidad", 21000, 32000, 0.6, 1, 4),
  p("Manguera jardín 1/2\" (metro)", "Plomería", "metro", 1900, 3200, 5, 6, 80),
  p("Tanque plástico 500 L", "Plomería", "unidad", 215000, 265000, 0.1, 1, 2),
  // Electricidad
  p("Cable THHN #12 (metro)", "Electricidad", "metro", 1750, 2600, 9, 12, 200),
  p("Cable THHN #14 (metro)", "Electricidad", "metro", 1150, 1800, 8, 12, 200),
  p("Cable encauchetado 2x14 (metro)", "Electricidad", "metro", 2400, 3600, 3, 8, 100),
  p("Toma doble polo a tierra", "Electricidad", "unidad", 3600, 6500, 2.4, 2, 15),
  p("Interruptor sencillo", "Electricidad", "unidad", 2800, 5200, 2.4, 2, 15),
  p("Bombillo LED 9 W", "Electricidad", "unidad", 2600, 5000, 7, 3, 50, { barras: "7701000000028" }),
  p("Bombillo LED 18 W", "Electricidad", "unidad", 5200, 9500, 3, 2, 25),
  p("Breaker 20 A enchufable", "Electricidad", "unidad", 8200, 13500, 1, 1, 8),
  p("Cinta aislante", "Electricidad", "unidad", 1300, 2800, 5, 2, 40),
  p("Extensión eléctrica 5 m", "Electricidad", "unidad", 11000, 18500, 0.9, 1, 6),
  p("Ventilador de mesa 16\"", "Electricidad", "unidad", 62000, 89000, 0.4, 1, 4),
  // Pinturas
  p("Pintura vinilo blanco galón", "Pinturas", "unidad", 41000, 56000, 2, 1, 10),
  p("Pintura vinilo blanco cuñete", "Pinturas", "unidad", 168000, 215000, 0.5, 1, 4),
  p("Pintura esmalte sintético galón", "Pinturas", "unidad", 59000, 79000, 0.9, 1, 6),
  p("Anticorrosivo gris galón", "Pinturas", "unidad", 48000, 64000, 0.7, 1, 5),
  p("Brocha 3\"", "Pinturas", "unidad", 3800, 7500, 3.2, 1, 20),
  p("Rodillo con bandeja", "Pinturas", "unidad", 9800, 16500, 1.4, 1, 10),
  p("Thinner (litro)", "Pinturas", "litro", 5200, 8500, 2.4, 1, 15),
  p("Lija de agua #150", "Pinturas", "unidad", 700, 1800, 6, 3, 50),
  p("Estuco plástico galón", "Pinturas", "unidad", 21000, 29000, 1.1, 1, 8),
  // Herramientas
  p("Martillo uña 16 oz", "Herramientas", "unidad", 14500, 24500, 0.9, 1, 5),
  p("Destornillador pala 1/4\"", "Herramientas", "unidad", 3600, 7500, 1.4, 1, 10),
  p("Destornillador estrella #2", "Herramientas", "unidad", 3600, 7500, 1.4, 1, 10),
  p("Alicate universal 8\"", "Herramientas", "unidad", 12500, 21000, 0.9, 1, 6),
  p("Flexómetro 5 m", "Herramientas", "unidad", 6800, 13000, 1.5, 1, 10),
  p("Nivel de burbuja 12\"", "Herramientas", "unidad", 7400, 14500, 0.5, 1, 5),
  p("Pala redonda con cabo", "Herramientas", "unidad", 27000, 42000, 0.6, 1, 4),
  p("Carretilla reforzada", "Herramientas", "unidad", 118000, 155000, 0.15, 1, 2),
  p("Machete 22\"", "Herramientas", "unidad", 13500, 22000, 0.7, 1, 5),
  p("Taladro percutor 1/2\"", "Herramientas", "unidad", 118000, 159000, 0.12, 1, 2),
  p("Disco de corte metal 4 1/2\"", "Herramientas", "unidad", 2900, 5500, 3.5, 2, 30),
  p("Broca para concreto 1/4\"", "Herramientas", "unidad", 2600, 5500, 1.5, 1, 12),
  // Tornillería
  p("Tornillo drywall 1\" (cien)", "Tornillería", "paquete", 3400, 6500, 3, 2, 15),
  p("Tornillo drywall 2\" (cien)", "Tornillería", "paquete", 5400, 9500, 2.2, 2, 12),
  p("Puntilla 2\" (libra)", "Tornillería", "unidad", 3400, 5200, 3.3, 2, 20),
  p("Puntilla 3\" (libra)", "Tornillería", "unidad", 3400, 5200, 2.6, 2, 20),
  p("Chazo plástico 1/4\" (diez)", "Tornillería", "paquete", 900, 2200, 4, 2, 30),
  p("Tornillo hexagonal 3/8 x 2\"", "Tornillería", "unidad", 650, 1500, 4.4, 5, 60),
  p("Arandela plana 3/8\"", "Tornillería", "unidad", 120, 400, 6, 8, 120),
  p("Tuerca hexagonal 3/8\"", "Tornillería", "unidad", 180, 500, 6, 8, 120),
  // Cerrajería y seguridad
  p("Candado 40 mm", "Cerrajería", "unidad", 7400, 14500, 1.2, 1, 8),
  p("Cerradura de sobreponer", "Cerrajería", "unidad", 31000, 46000, 0.4, 1, 3),
  p("Bisagra 3\" (par)", "Cerrajería", "par", 1900, 4200, 2, 1, 12),
  p("Cadena galvanizada (metro)", "Cerrajería", "metro", 6200, 10500, 0.9, 2, 15),
  p("Pasador 4\"", "Cerrajería", "unidad", 2100, 4800, 1.2, 1, 8),
  // Aseo y hogar
  p("Escoba plástica", "Hogar", "unidad", 5200, 9500, 2.4, 1, 12),
  p("Trapero algodón", "Hogar", "unidad", 4300, 8500, 1.6, 1, 10),
  p("Balde plástico 12 L", "Hogar", "unidad", 4200, 8500, 2, 1, 12),
  p("Cloro (galón)", "Hogar", "unidad", 5400, 8500, 2.6, 1, 15),
  p("Insecticida aerosol", "Hogar", "unidad", 7800, 12500, 2.2, 1, 12),
  p("Ventilador de techo", "Hogar", "unidad", 148000, 198000, 0.08, 1, 1),
  p("Candela de parafina (docena)", "Hogar", "docena", 3800, 7200, 1.3, 1, 8),
  p("Manguera para gas (metro)", "Hogar", "metro", 2900, 4800, 1.1, 2, 20),
  // Agro y tierra caliente
  p("Machete con vaina", "Agro", "unidad", 18500, 28500, 0.5, 1, 4),
  p("Lima triangular", "Agro", "unidad", 2900, 6000, 1.6, 1, 10),
  p("Guadaña (hilo de nylon, rollo)", "Agro", "rollo", 17500, 27000, 0.5, 1, 4),
  p("Fumigadora de espalda 20 L", "Agro", "unidad", 118000, 158000, 0.1, 1, 2),
  p("Alambre de púas (rollo)", "Agro", "rollo", 142000, 178000, 0.25, 1, 3),
  p("Grapa para cerca (libra)", "Agro", "unidad", 4300, 7500, 0.7, 2, 10),
];

export const PROVEEDORES_DEMO = [
  { nombre: "Distribuidora La Guajira SAS", nit: "900412345-1", telefono: "3015550101", contacto: "Rubén Pushaina" },
  { nombre: "Ferrocentro del Caribe", nit: "800765432-3", telefono: "3105550102", contacto: "Alexandra Mendoza" },
  { nombre: "Eléctricos y Más Riohacha", nit: "901223344-5", telefono: "3205550103", contacto: "Jorge Brito" },
  { nombre: "Pinturas del Norte", nit: "890321654-7", telefono: "3125550104", contacto: "Marisol Epieyú" },
  { nombre: "Aceros y Tubos Costa", nit: "830159753-9", telefono: "3135550105", contacto: "Hernando Daza" },
  { nombre: "Importadora Herramientas MG", nit: "901852963-2", telefono: "3145550106", contacto: "Mauricio Gómez" },
];

/** Qué proveedor surte cada categoría. */
export const PROVEEDOR_POR_CATEGORIA: Record<string, number> = {
  "Construcción": 4, Plomería: 4, Electricidad: 2, Pinturas: 3, Herramientas: 5,
  "Tornillería": 1, Cerrajería: 1, Hogar: 0, Agro: 0,
};

export const CLIENTES_DEMO = [
  ["Constructora Wayúu Ltda.", "3101110001", 3_000_000], ["Alberto Fuentes", "3101110002", 500_000],
  ["Yaneth Ipuana", "3101110003", 300_000], ["Maestro Rafael Gutiérrez", "3101110004", 800_000],
  ["Luz Dary Pimienta", "3101110005", 200_000], ["Hotel Costa Azul", "3101110006", 1_500_000],
  ["José Luis Mejía", "3101110007", 400_000], ["Carmen Rosa Iguarán", "3101110008", 250_000],
  ["Taller Metálicas El Cerrejón", "3101110009", 1_200_000], ["Edwin Epinayú", "3101110010", 300_000],
  ["Arquitectos Asociados Guajira", "3101110011", 2_000_000], ["Nelly Barros", "3101110012", 150_000],
  ["Finca La Esperanza", "3101110013", 900_000], ["Dario Redondo", "3101110014", 350_000],
  ["Colegio Técnico Riohacha", "3101110015", 1_000_000], ["Marlene Pana", "3101110016", 200_000],
  ["Rodolfo Cotes", "3101110017", 450_000], ["Instalaciones Eléctricas JM", "3101110018", 1_300_000],
  ["Sandra Mejía", "3101110019", 0], ["Pedro Vence", "3101110020", 0],
  ["Ana Milena Brito", "3101110021", 0], ["Jairo Deluque", "3101110022", 0],
  ["Reinaldo Pushaina", "3101110023", 600_000], ["Fabiola Gil", "3101110024", 0],
  ["Municipal Obras Menores", "3101110025", 2_500_000],
] as const;
