# Surtix — Documento de producto

## 1. Problema

Los negocios pequeños de Colombia manejan su inventario en cuaderno, Excel o de memoria. Consecuencias:

- No saben cuánto ganan realmente ni qué producto deja plata.
- Pierden mercancía (robo, daño, vencimiento) sin enterarse.
- Se les acaba lo que más se vende y se les queda guardado lo que no se vende.
- Fían sin control y olvidan cobrar.
- Reciben pantallazos falsos de Nequi/Daviplata.
- Pierden horas digitando facturas de proveedores.

Ya existen opciones gratis o baratas (Excel, Odoo, Alegra, Siigo, apps de POS). **Nadie paga por otro inventario;
pagan por resultados:** menos pérdidas, menos tiempo, más ventas.

## 2. Propuesta de valor

> "Tu negocio controlado desde WhatsApp. Sabes cuánto ganas, qué te falta y quién te debe, sin digitar."

Pilares que juntos son difíciles de encontrar:

1. Inventario sólido y auditable (kardex).
2. Control de pérdidas y robo.
3. WhatsApp como interfaz para el dueño y sus clientes.
4. IA que elimina la digitación (facturas, comprobantes, cuadernos).
5. Funciona sin internet.
6. Hecho para un nicho y con servicio humano local.

## 3. Usuarios (roles)

| Rol | Qué hace |
|---|---|
| Dueño | Ve todo, recibe alertas y reportes, configura |
| Admin | Gestiona productos, precios, usuarios |
| Vendedor | POS, clientes, cotizaciones, su caja |
| Bodeguero | Recepciones, traslados, conteos, ajustes (con aprobación) |
| Contador | Solo lectura y exportaciones |
| Vendedor de ruta | Pedidos en campo, cobros, visitas |

## 4. Módulos y funciones

Etiquetas: **[MVP]** primera versión vendible · **[F2]** fase 2 · **[F3]** fase 3 · **[F4]** futuro.

### 4.1 Productos
- [MVP] Productos con SKU, código de barras, categoría, unidad base, precio, stock mínimo, foto.
- [MVP] Presentaciones: venta por unidad, caja, paquete, metro, kilo (con factor de conversión y precio propio).
- [MVP] Lector de código de barras con la **cámara del celular** (no hay que comprar lector).
- [F2] Variantes (talla, color) para tiendas de ropa.
- [F2] Lotes y fechas de vencimiento (veterinarias, agroinsumos, víveres, droguerías).
- [F2] Seriales y garantías (celulares, electrodomésticos, herramientas).
- [F2] Precios por lista: detal, mayorista, cliente especial.
- [F2] Etiquetas y códigos QR imprimibles.
- [F3] Precios automáticos: si sube el costo, se recalcula el precio según el margen objetivo, con redondeo
  a precios "bonitos" ($4.900, $10.000).
- [F3] Simulador de precios: "si subes 5% esta categoría, ganarías $X más al mes".

### 4.2 Inventario
- [MVP] Existencias por bodega/sucursal.
- [MVP] Kardex: historial de cada movimiento con usuario, fecha, costo y documento de origen.
- [MVP] Costo promedio ponderado automático.
- [MVP] Ajustes con motivo obligatorio (daño, pérdida, vencimiento, error).
- [F2] Traslados entre bodegas.
- [F2] Conteo físico guiado desde el celular (escanea y cuenta), con reporte de diferencias.
- [F2] Inventario valorizado.
- [F3] Conteo aproximado por foto del estante (IA).

### 4.3 Compras
- [MVP] Proveedores.
- [MVP] Registro de compra / recepción de mercancía (genera entradas al inventario).
- [MVP] **Foto de la factura del proveedor → la IA carga productos, cantidades y costos.** El usuario solo revisa y confirma.
- [F2] Órdenes de compra y cuentas por pagar.
- [F2] Devoluciones a proveedor.
- [F2] Comparador de proveedores: historial de precios por producto y proveedor, "A te lo vende 8% más barato que B".
- [F2] Alerta de alzas silenciosas de un proveedor.
- [F3] Orden de compra sugerida según rotación y enviada al proveedor por WhatsApp.

### 4.4 Ventas
- [MVP] POS rápido (buscar o escanear, cantidad, descuento, cobrar).
- [MVP] Pagos mixtos: efectivo + Nequi + Daviplata + tarjeta + crédito.
- [MVP] Ventas a crédito (fiado) con cupo por cliente.
- [MVP] **POS sin internet** con sincronización posterior.
- [MVP] Anulación de ventas con motivo (queda en auditoría).
- [MVP] Recibo por WhatsApp o impresora térmica.
- [F2] Cotizaciones que se convierten en venta.
- [F2] Separados (apartados) con abonos.
- [F2] Devoluciones de clientes.
- [F3] Pedidos que llegan por WhatsApp y entran al sistema.
- [F3] Catálogo web público generado con el inventario (link para compartir).
- [F4] Facturación electrónica DIAN vía proveedor externo (Factus, Alegra, Siigo u otro).

### 4.5 Verificación de pagos digitales
- [MVP] Foto del comprobante de Nequi/Daviplata/transferencia → la IA extrae monto, fecha y referencia.
- [MVP] Alerta si el comprobante ya se usó antes (hash de imagen + referencia) o si el monto no cuadra.
- [F2] Cierre del día: "Ventas digitales $450.000, verificadas $420.000, pendientes $30.000".

### 4.6 Caja
- [MVP] Apertura y cierre de turno, arqueo guiado (conteo por denominación).
- [MVP] Diferencia esperado vs contado.
- [F2] Gastos del negocio (servicios, transporte, arriendo) con foto del soporte.
- [F2] Retiros y entradas de efectivo.

### 4.7 Clientes y cobranza
- [MVP] Clientes con teléfono, cupo, saldo.
- [MVP] Abonos a deudas.
- [F2] Recordatorios de cobro automáticos por WhatsApp.
- [F2] Puntaje de pago: quién paga bien y a quién no fiarle más.
- [F3] Puntos de fidelización por número de celular.
- [F3] Mensaje de cumpleaños con descuento y "hace 30 días no vienes".

### 4.8 Control de pérdidas y antirrobo
- [MVP] Auditoría de todo: quién creó, modificó, anuló, descontó.
- [F2] Alertas: anulación justo después de cobrar, descuentos repetidos al mismo cliente, ajustes negativos frecuentes,
  caja abierta mucho tiempo con pocas ventas, faltantes en conteos por turno.
- [F2] Puntaje de riesgo por turno (sin acusar, solo señales).
- [F3] Reporte de "inventario fantasma": productos que desaparecen sin venta.

### 4.9 Reportes e inteligencia
- [MVP] Dashboard del dueño en el celular: ventas del día, utilidad, caja, alertas.
- [MVP] Ventas por día, producto, vendedor, método de pago.
- [F2] Utilidad por producto y categoría, clasificación ABC, rotación.
- [F2] **Plata dormida:** productos sin ventas en X días y dinero atrapado, con sugerencia (combo, descuento,
  devolver) y generación de imagen de promoción para estados de WhatsApp/Instagram.
- [F3] Predicción: "se te acaba X en 6 días".
- [F3] Calendario de temporadas colombianas (primas, regreso a clases, día de la madre, diciembre)
  con aviso de compra anticipada según el historial.
- [F3] Asistente en lenguaje natural: "¿cuál fue mi producto más rentable este mes?".
- [F3] Puntaje de salud del negocio (margen, rotación, cartera, pérdidas).
- [F3] Reporte semanal en PDF enviado al dueño por WhatsApp.
- [F4] Comparación anónima con negocios del mismo nicho y zona.

### 4.10 WhatsApp para el dueño
- [F3] "¿Cuánto vendí hoy?", "¿cuántas quedan de X?", "¿quién me debe?".
- [F3] Registrar un gasto o una venta por mensaje o audio.
- [F3] Recibir alertas: stock bajo, comprobante sospechoso, diferencia de caja.

### 4.11 Vendedores
- [F2] Metas diarias visibles y avance en tiempo real.
- [F2] Comisiones automáticas.
- [F3] Ranking semanal.

### 4.12 Venta en ruta (mayoristas/distribuidores)
- [F3] App de pedidos en campo (offline), ruta del día, cobros pendientes por cliente, ubicación de visitas.

### 4.13 Onboarding y migración
- [MVP] Importar Excel desordenado: la IA detecta qué columna es nombre, precio, cantidad.
- [F2] **Foto del cuaderno → productos, precios y deudas de clientes cargados.**
- [MVP] Plantillas por nicho (ferretería, ropa, víveres, veterinaria) con categorías y unidades precargadas.

### 4.14 Contador y cumplimiento
- [F2] Usuario contador de solo lectura.
- [F2] Exportación de ventas, compras y gastos a Excel/CSV.
- [F4] Facturación electrónica DIAN (integración, no se construye desde cero).

### 4.15 Red de negocios (cuando haya muchos clientes)
- [F4] Compras en grupo al mismo distribuidor para mejor precio.
- [F4] Benchmark anónimo por nicho.
- [F4] Portal del distribuidor: ve pedidos de todos sus tenderos.

## 5. Nichos candidatos

Elegir **uno** para el lanzamiento, validando con 3–5 negocios reales:

| Nicho | Lo que más les duele | Funciones clave |
|---|---|---|
| Ferretería | Venta por metro/caja, miles de referencias, precios por mayor | Presentaciones, listas de precios, comparador de proveedores |
| Ropa/calzado | Tallas y colores, temporadas, plata dormida | Variantes, plata dormida, temporadas |
| Víveres/mayorista | Fiados, rutas, márgenes bajos | Cobranza, ruta, precios automáticos |
| Veterinaria/agro | Vencimientos y lotes | Lotes, alertas de vencimiento |

## 6. Métricas de éxito

- Tiempo de arranque de un negocio nuevo: menos de 30 minutos.
- Venta en POS: menos de 15 segundos.
- El dueño abre el dashboard o recibe un reporte al menos 1 vez al día.
- Primeros 10 clientes pagando en 3 meses desde el lanzamiento.
