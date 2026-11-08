# Surtix — Roadmap

Marca `[x]` al terminar. Cada tarea debe quedar con tests de su lógica crítica.

## Fase 0 — Base del proyecto
- [x] 0.1 Crear proyecto Next.js + TypeScript estricto + Tailwind + shadcn/ui + ESLint/Prettier.
- [x] 0.2 Configurar Supabase local, aplicar `supabase/migrations/0001_esquema_inicial.sql` y `seed.sql`. _(`config.toml` listo; migraciones verificadas con PGlite en `src/test/db/`. `supabase start` requiere instalar Docker Desktop.)_
- [x] 0.3 Generar tipos de Supabase y clientes server/browser en `src/lib/supabase/`.
- [x] 0.4 Utilidades: `dinero.ts` (formato COP, sumas seguras), fechas en America/Bogota, esquemas Zod base.
- [x] 0.5 Vitest y Playwright configurados. Test de RLS entre dos organizaciones. _(+ tests de inventario, costo promedio, ventas, caja y comprobantes; migración 0002 cierra el hueco de referencias entre negocios.)_
- [x] 0.6 Layout mobile-first: menú inferior en celular, lateral en escritorio.

## Fase 1 — MVP vendible
- [x] 1.1 Registro de negocio: crea organización, bodega principal, usuario dueño y plantilla de nicho. _(SQL probado con PGlite; pantallas login/registro/recuperar/bienvenida verificadas sin sesión. El flujo completo contra GoTrue queda por probar con Supabase local.)_
- [x] 1.2 Usuarios e invitaciones con roles. _(Migración 0003 + 22 tests de roles; pantalla /configuracion/usuarios pendiente de prueba con sesión real.)_
- [x] 1.3 Productos: CRUD, categorías, presentaciones, código de barras, foto. _(Migración 0004: bucket privado `productos`. Pantallas sin ejecutar contra Supabase real: validaciones y SQL sí probados.)_
- [x] 1.4 Escáner de código de barras con cámara. _(BarcodeDetector + ZXing como respaldo para iPhone; no probado con cámara real.)_
- [x] 1.5 Inventario: existencias, kardex y ajustes con motivo (entrada, salida y conteo físico). _(Lógica SQL ya cubierta por tests; pantallas sin ejecutar contra Supabase real.)_
- [x] 1.6 Proveedores y compras (borrador, confirmar, anular). _(SQL probado; pantallas sin ejecutar contra Supabase real.)_
- [x] 1.7 IA: factura por foto (`POST /api/ia/factura`, salida validada con Zod, `documentos_ia`, emparejado con catálogo). _(Probada con modelo simulado; falta probar con ANTHROPIC_API_KEY real y fotos reales.)_
- [x] 1.8 Clientes con cupo de fiado y abonos (migración 0006 protege el cupo). _(Pantallas sin ejecutar contra Supabase real.)_
- [x] 1.9 POS: búsqueda, lector USB y cámara, presentaciones, pagos mixtos, vuelto, fiado con cupo, venta idempotente por offline_id (migración 0007: auditoría de precios). _(Pantalla sin ejecutar contra Supabase real.)_
- [x] 1.10 Verificación de comprobantes Nequi/Daviplata: lectura con IA, hash exacto y perceptual, referencia repetida, monto, fecha, uso en otra venta, alerta al dueño (migración 0008). _(IA probada con modelo simulado; UI sin ejecutar contra Supabase real.)_
- [x] 1.11 Caja: apertura con base, cierre ciego con conteo por denominaciones y diferencia calculada en SQL. _(Pantallas sin ejecutar contra Supabase real; `cerrar_turno` probada en SQL.)_
- [x] 1.12 Anulaciones desde la interfaz: historial de ventas con detalle, anular venta (dueño/admin, con motivo) y anular compra. _(Pantallas sin ejecutar contra Supabase real; SQL probado.)_
- [x] 1.13 POS offline: PWA (manifest + service worker), cola Dexie con offline_id, sincronización automática, ventas rechazadas visibles. Ver D-005. _(Cola probada con fake-indexeddb; falta probar el service worker en un celular real.)_
- [x] 1.14 Importar productos desde Excel/CSV con mapeo de columnas por IA (con respaldo por títulos), vista previa con errores por fila y carga de inventario inicial (migración 0009). _(Probado con datos simulados; falta probar con Excel reales y la IA real.)_
- [x] 1.15 Dashboard del dueño (ventas, utilidad, fiado, por reponer, 7 días, alertas) y reportes por día, producto, vendedor y método de pago con CSV (migración 0010). _(SQL probado con datos reales de prueba; pantallas sin ejecutar contra Supabase real.)_
- [x] 1.16 Datos de demo: ferretería de Riohacha con 60 días de operación (`npm run demo:sql`). Invariantes probados en PGlite (stock = kardex, cartera, caja, reportes). _(La variante con usuarios reales de Supabase Auth no se pudo ejecutar sin Docker.)_

## Fase 2 — Control y dinero
- [x] 2.1 Multi-bodega y traslados atómicos con costo conservado, anulables (migración 0013). _(SQL probado; pantallas sin ejecutar contra Supabase real.)_
- [x] 2.2 Conteo físico guiado (ciego), diferencias valoradas, corrección opcional del inventario y alerta por faltantes grandes (migración 0013). Nota: el “ciego” es de interfaz; un usuario técnico podría leer `cantidad_sistema` por la API.
- [x] 2.3 Órdenes de compra (recepción parcial), cuentas por pagar con vencimientos y pagos, compras a crédito y devoluciones a proveedor (migración 0014). _(SQL probado; pantallas sin ejecutar contra Supabase real.)_
- [x] 2.4 Comparador de proveedores (último precio, rango, diferencia contra el mejor) y alerta de alzas de precio al confirmar compras (migración 0015). _(SQL probado; pantalla sin ejecutar contra Supabase real.)_
- [x] 2.5 Listas de precios por cliente (el POS las aplica), variantes (talla/color), lotes con vencimiento (saldo derivado del stock, FEFO) y seriales con garantía (migración 0019). _(SQL probado; pantallas sin ejecutar contra Supabase real.)_
- [x] 2.6 Cotizaciones (envío por WhatsApp y venta desde el POS), separados con abonos y entrega, y devoluciones de clientes con reembolso y reporte neto (migración 0016). _(SQL probado; pantallas sin ejecutar contra Supabase real.)_
- [x] 2.7 Gastos con foto de soporte, retiros e ingresos de efectivo (migración 0011; el efectivo esperado del cierre los descuenta). _(Pantallas sin ejecutar contra Supabase real.)_
- [x] 2.8 Alertas antirrobo (anulación rápida, ajustes negativos repetidos, faltantes, comprobantes sospechosos) y puntaje de riesgo por turno como señales, no acusaciones (migración 0011).

- [x] 2.9 Reportes de inventario: valorizado, ABC, rotación y plata dormida (migración 0012). _(SQL probado; pantalla sin ejecutar contra Supabase real. La utilidad por producto ya está en Reportes.)_
- [x] 2.10 Metas mensuales y comisiones de vendedores (porcentaje sobre ventas o utilidad, bono por meta, neto de devoluciones; cada vendedor ve solo lo suyo) (migración 0017). _(SQL probado; pantallas sin ejecutar contra Supabase real.)_
- [x] 2.11 Usuario contador (solo lectura) y exportaciones CSV para Excel: ventas, compras, gastos, cartera, cuentas por pagar e inventario. _(Pantalla sin ejecutar contra Supabase real.)_
- [x] 2.12 Foto del cuaderno → productos con existencias y deudas de clientes (migración 0018; la IA propone, la persona revisa; probado con modelo simulado). _(Falta probar con ANTHROPIC_API_KEY real y cuadernos reales.)_

## Fase 3 — Automatización e inteligencia
- [x] 3.1 n8n: outbox con reclamo seguro, API de eventos con token + firma HMAC anti-repetición, flujo F1 de alertas al dueño por WhatsApp (migración 0020). _(Rutas y SQL probados; el flujo JSON no se probó contra n8n ni WhatsApp reales.)_
- [x] 3.2 Resumen diario (8 p. m.) y reporte semanal en PDF por WhatsApp (migración 0021, flujos F2 y F3). _(SQL, textos y PDF probados; los flujos no se probaron contra n8n ni WhatsApp.)_
- [x] 3.3 Cobranza: deuda vencida por antigüedad, puntaje de pago, recordatorios de 3 niveles por WhatsApp y bloqueo de fiado a malos pagadores sin autorización (migración 0022, flujo F4). _(SQL y textos probados; flujo no probado contra n8n real.)_
- [x] 3.4 Bot de WhatsApp del dueño: consultas (ventas, stock, deudas) y registro de gastos con confirmación SÍ/NO, solo números de dueño/admin, idempotente por mensaje (migración 0023, flujo F5). _(Lógica y SQL probados; falta transcripción de audio y probar con WhatsApp/n8n reales.)_
- [x] 3.5 Pedidos de clientes por WhatsApp: extracción (reglas + IA de respaldo), emparejado con el catálogo (ambiguos para una persona), pedido pendiente, venta desde el POS y aviso al cliente con el total (migración 0024, flujo F6). _(Lógica y SQL probados; falta probar con n8n/WhatsApp reales.)_
- [x] 3.6 Predicción de agotamiento y compra sugerida (ritmo mezclado 14/60 días, cobertura + entrega, proveedor más barato), órdenes de compra en borrador desde la app y aviso semanal (migración 0025, flujo F7). _(SQL y textos probados; flujo no probado contra n8n real. No crea la orden respondiendo SÍ por WhatsApp.)_
- [x] 3.7 Calendario de temporadas (se repiten cada año, cruzan el año, por categoría o todo el negocio; factores típicos de Colombia) que ajusta la compra sugerida (migración 0026). _(SQL probado; pantalla sin ejecutar contra Supabase real.)_
- [x] 3.8 Precios automáticos por margen objetivo (redondeo comercial, tope ±15 %, opt-in al confirmar compras, historial de precios) y simulador de utilidad con elasticidad (migración 0027). _(SQL y simulador probados; pantalla sin ejecutar contra Supabase real. El simulador solo cubre productos con margen objetivo.)_
- [x] 3.9 Promociones de plata dormida con imagen generada. (Sugerencias con descuento escalonado que nunca baja del costo; el POS cobra el precio promocional y no lo audita como cambio de precio; afiche 1080×1080 en canvas + texto para WhatsApp. Sin verificar visualmente en un navegador real.)
- [x] 3.10 Fidelización por celular (puntos, canje en el POS), cumpleaños con puntos de regalo y clientes inactivos (migración 0029, flujo F8). _(SQL, rutas y textos probados; canje en el POS y pantalla sin ejecutar contra Supabase real; flujo no probado contra n8n/WhatsApp reales.)_
- [ ] 3.11 Catálogo web público.
- [ ] 3.12 Asistente en lenguaje natural dentro de la app.
- [ ] 3.13 App de venta en ruta.
- [ ] 3.14 Puntaje de salud del negocio.

## Fase 4 — Negocio y escala
- [ ] 4.1 Planes y cobro de suscripción (Wompi o Mercado Pago), periodo de prueba.
- [ ] 4.2 Panel de super-admin (clientes, uso, soporte).
- [ ] 4.3 Facturación electrónica DIAN vía proveedor externo.
- [ ] 4.4 Programa de referidos.
- [ ] 4.5 Benchmark anónimo por nicho.
- [ ] 4.6 Compras en grupo y portal del distribuidor.
