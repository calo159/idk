# Surtix — Roadmap

Marca `[x]` al terminar. Cada tarea debe quedar con tests de su lógica crítica.

## Fase 0 — Base del proyecto
- [x] 0.1 Crear proyecto Next.js + TypeScript estricto + Tailwind + shadcn/ui + ESLint/Prettier.
- [x] 0.2 Configurar Supabase local, aplicar `supabase/migrations/0001_esquema_inicial.sql` y `seed.sql`. _(`config.toml` listo; migraciones verificadas con PGlite en `src/test/db/`. `supabase start` requiere instalar Docker Desktop.)_
- [ ] 0.3 Generar tipos de Supabase y clientes server/browser en `src/lib/supabase/`.
- [ ] 0.4 Utilidades: `dinero.ts` (formato COP, sumas seguras), fechas en America/Bogota, esquemas Zod base.
- [ ] 0.5 Vitest y Playwright configurados. Test de RLS entre dos organizaciones.
- [ ] 0.6 Layout mobile-first: menú inferior en celular, lateral en escritorio.

## Fase 1 — MVP vendible
- [ ] 1.1 Registro de negocio: crea organización, bodega principal, usuario dueño y plantilla de nicho.
- [ ] 1.2 Usuarios e invitaciones con roles.
- [ ] 1.3 Productos: CRUD, categorías, presentaciones, código de barras, foto.
- [ ] 1.4 Escáner de código de barras con cámara.
- [ ] 1.5 Inventario: existencias, kardex por producto, ajustes con motivo.
- [ ] 1.6 Proveedores y compras: registrar compra, confirmar (entradas + costo promedio).
- [ ] 1.7 IA: foto de factura → borrador de compra con coincidencia de productos.
- [ ] 1.8 Clientes: cupo, saldo, abonos.
- [ ] 1.9 POS: búsqueda/escaneo, descuentos, pagos mixtos, crédito, recibo.
- [ ] 1.10 IA: verificación de comprobantes Nequi/Daviplata + alerta de repetidos.
- [ ] 1.11 Caja: apertura, cierre, arqueo por denominación, diferencia.
- [ ] 1.12 Anulación de ventas y compras con auditoría.
- [ ] 1.13 POS offline (PWA + Dexie + cola con `offline_id`).
- [ ] 1.14 Importar productos desde Excel con mapeo por IA.
- [ ] 1.15 Dashboard del dueño + reportes básicos (ventas por día, producto, vendedor, método de pago).
- [ ] 1.16 Datos de demo realistas (ferretería de Riohacha) para mostrar a clientes.

## Fase 2 — Control y dinero
- [ ] 2.1 Multi-bodega y traslados.
- [ ] 2.2 Conteo físico guiado y reporte de diferencias.
- [ ] 2.3 Órdenes de compra, cuentas por pagar, devoluciones.
- [ ] 2.4 Comparador de proveedores y alerta de alzas.
- [ ] 2.5 Listas de precios, variantes, lotes/vencimientos, seriales.
- [ ] 2.6 Cotizaciones, separados con abonos, devoluciones de clientes.
- [ ] 2.7 Gastos con foto de soporte, retiros de caja.
- [ ] 2.8 Alertas antirrobo y puntaje de riesgo por turno.
- [ ] 2.9 Reportes: utilidad por producto, ABC, rotación, inventario valorizado, plata dormida.
- [ ] 2.10 Metas y comisiones de vendedores.
- [ ] 2.11 Usuario contador y exportaciones.
- [ ] 2.12 Foto del cuaderno → productos y deudas.

## Fase 3 — Automatización e inteligencia
- [ ] 3.1 n8n: outbox, webhooks firmados, flujo de alertas al dueño por WhatsApp.
- [ ] 3.2 Resumen diario y reporte semanal en PDF por WhatsApp.
- [ ] 3.3 Recordatorios de cobro y puntaje de pago.
- [ ] 3.4 Bot de WhatsApp del dueño (consultas y registro de gastos por texto/audio).
- [ ] 3.5 Pedidos de clientes por WhatsApp → venta en borrador.
- [ ] 3.6 Predicción de agotamiento y orden de compra sugerida.
- [ ] 3.7 Calendario de temporadas.
- [ ] 3.8 Precios automáticos y simulador.
- [ ] 3.9 Promociones de plata dormida con imagen generada.
- [ ] 3.10 Fidelización por celular, cumpleaños, clientes inactivos.
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
