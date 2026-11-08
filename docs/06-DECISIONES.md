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

## D-007 — Venta en ruta: autoventa con el POS y visitas aparte
- El vendedor de ruta vende con el mismo POS (turno de caja propio, cola offline y `offline_id`); su venta queda con `origen = 'ruta'`.
  No hay un «pedido de ruta» separado: así stock, costos, caja y comisiones funcionan igual que en el mostrador.
- Las visitas (`visitas`) son un registro aparte: resultado, nota y ubicación (opcional) con la misma ventana de tiempo que las ventas offline (7 días).
- Service worker: `/ventas/ruta` y el POS se guardan solo en su versión genérica (sin pedido ni cotización precargados). `?cliente=` lo lee el navegador.
- Pendiente: abonos y pedidos de ruta sin internet, y mapa de la ruta.

## D-008 — Suscripciones: estado calculado, Wompi y bloqueo suave
- El estado (prueba / activa / gracia / vencida / suspendida) **no se guarda**: lo calcula `estado_de_suscripcion` a partir de `prueba_hasta`, `periodo_hasta` y `suspendida`. Así no hay un cron que pueda fallar.
- Un pago aprobado extiende desde donde termina lo que ya tenía (prueba o pago anterior): pagar temprano no hace perder días.
- `aplicar_pago_suscripcion` es idempotente por referencia y exige que el monto aprobado coincida con el esperado; si no, el pago queda «en revisión» y no activa nada.
- Si falla la consulta de la suscripción, la app **no bloquea** (falla abierta): un error nuestro no puede dejar a un negocio sin caja.
- Vencida o suspendida bloquea solo las pantallas del grupo `(app)`; `/suscripcion` está fuera para poder pagar. Los datos no se tocan.
- Los límites de plan (usuarios, bodegas) son triggers de base de datos: ninguna pantalla puede saltárselos.
- Pendiente para producción: llaves de Wompi, URL del webhook en su panel, definir precios reales, factura al suscriptor.

## D-009 — Super-admin: solo por SQL, sin suplantar y con bitácora
- El equipo de Surtix se da de alta únicamente desde la consola de la base de datos (SQL editor de Supabase), nunca desde la app:
  `insert into super_admins (usuario_id) values ('<uuid de auth.users>');` (para quitar: `delete from super_admins where usuario_id = '<uuid>';`).
- La tabla `super_admins` y la bitácora `admin_acciones` no tienen políticas de RLS: ni la API ni el dueño de un negocio las leen o escriben.
- Todas las funciones `admin_*` vuelven a verificar `es_super_admin()` dentro de la base de datos; el 404 de `/admin` es solo cortesía.
- El panel muestra conteos y estado, no ventas, clientes, precios ni deudas. **No hay «entrar como el cliente»**: si un caso de soporte lo necesita,
  se hace con una sesión compartida por el propio cliente.
- Toda acción de soporte (plan, días, suspensión, pago manual) exige un motivo de mínimo 3 letras y queda con quién la hizo y cuándo.

## D-010 — Facturación electrónica: marco propio + proveedor tecnológico, sin inventar el contrato
- La factura electrónica en Colombia la valida la DIAN a través de un proveedor tecnológico autorizado. Surtix **no** firma ni transmite XML UBL.
- Se construyó lo que es independiente del proveedor y se puede probar: datos fiscales, resolución y numeración (nunca retrocede, conserva el número al reintentar),
  IVA, el documento (`construir_documento_factura`, única fuente de verdad), la cola y los estados.
- No se escribió un adaptador «a ojo» para Factus/Alegra/Siigo: sin su documentación y credenciales sería código inventado que parecería funcionar.
  El contrato es la interfaz `ProveedorFE`; el simulado sirve para practicar y está bloqueado en producción por la base de datos.
- Supuestos a validar con un contador: precios con IVA incluido, tope de consumidor final = 5 UVT (valor configurable, actualizar cada año), IVA solo 0/5/19 %
  (sin impoconsumo ni retenciones), y nota crédito pendiente.

