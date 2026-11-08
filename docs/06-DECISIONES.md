# Surtix — Decisiones técnicas

Registro corto de decisiones que no están en `02-ARQUITECTURA.md`. Una entrada por decisión.

## D-001 · Next.js 16 sin `cacheComponents`
- **Contexto:** `create-next-app` activa `cacheComponents` y `partialPrefetching` por defecto.
- **Decisión:** se desactivan. Todo el área `(app)` depende de la sesión del usuario y de RLS; no hay contenido
  cacheable entre usuarios. Con `cacheComponents` cada lectura de `cookies()` exige un `<Suspense>` y no aporta valor.
- **Cuándo revisar:** catálogo público (3.11), donde sí conviene caché.
- **Nota:** `middleware.ts` ahora se llama `proxy.ts` en Next 16.

## D-002 · Tests de base de datos con PGlite (sin Docker)
- **Contexto:** `supabase start` requiere Docker; no siempre está disponible (ej. el equipo de desarrollo inicial).
- **Decisión:** `src/test/db/` levanta Postgres real en WASM (PGlite), simula `auth.users`/`auth.uid()` como lo hace
  Supabase (`request.jwt.claim.sub`) y crea los roles `anon`/`authenticated`/`service_role`. Aplica las migraciones
  reales de `supabase/migrations/` en orden. Así los tests de RLS, kardex y funciones SQL corren en cualquier máquina y en CI.
- **Límite:** no cubre GoTrue ni Storage. Esos se prueban con Supabase local (`npm run db:start`) y Playwright.

## D-003 · Dinero con `decimal.js`
- PostgREST entrega `numeric` como número JSON (los tipos generados dicen `number`). Es seguro para numeric(14,2) (≤ 15 dígitos
  significativos), pero NUNCA se opera con ese `number`: `src/lib/dinero.ts` lo convierte a `Decimal` (redondeo igual al
  de Postgres) y hacia la BD se envía `paraBd()` (string). Prohibido sumar/multiplicar dinero con `+` o `*` sueltos.

## D-004 · Cambios de BD solo con migraciones nuevas
- `0001_esquema_inicial.sql` está probada y congelada. Correcciones y ampliaciones van en `0002_…`, `0003_…`.

## D-005 — POS offline: cola en IndexedDB + Server Action idempotente
- Las ventas sin internet se guardan en Dexie (clave = `offline_id`) y se envían con la misma Server Action `cobrarVenta`
  al volver la conexión (evento `online`, al abrir y cada 30 s). El servidor es idempotente por `offline_id`.
- Una respuesta negativa del servidor (sin stock, cupo, caja cerrada) deja la venta **rechazada y visible** para que
  una persona decida (reintentar o descartar); nunca se pierde en silencio ni se reintenta sola.
- La venta conserva su hora real (`creado_en`, máx. 7 días atrás). Los movimientos de inventario llevan la hora de sincronización.
- Limitaciones conocidas: sin conexión no se pueden leer comprobantes con IA (el pago queda "sin verificar");
  el cupo del cliente y el stock se validan localmente con datos de la última carga y definitivamente al sincronizar.
- El service worker solo guarda `/ventas/pos` y `/caja` (y estáticos). Al abrir `/login` se borra esa caché.

## D-006 — Catálogo público: solo funciones SQL abiertas a `anon`, sin formulario de pedidos
- La página `/catalogo/<dirección>` usa el rol `anon` y únicamente `catalogo_publico` y `catalogo_productos` (security definer): devuelven
  nombre, descripción, categoría, unidad, precio, precio anterior y «disponible» (nunca costos, cantidades ni clientes). Las tablas siguen cerradas por RLS.
- Los pedidos **no se guardan en la app**: se envían por WhatsApp al negocio, donde ya los lee el flujo F6. Un formulario público de escritura sería
  una puerta abierta a spam sin ganar nada.
- Fotos: el bucket de productos es privado; mostrarlas exige URLs firmadas generadas en el servidor. Queda para una mejora posterior.
- Caché: la página declara `revalidate = 300`; en la compilación aparece como dinámica porque pasa por `proxy.ts`. Si el tráfico lo exige, se excluye `/catalogo` del matcher.

