# Prompts para Claude Code

Copia y pega uno por sesión. Espera a que termine, prueba y haz commit antes del siguiente.

## 1. Arranque (Fase 0)
```
Lee CLAUDE.md y todos los archivos de docs/. Luego ejecuta la Fase 0 del roadmap (tareas 0.1 a 0.6).
La migración supabase/migrations/0001_esquema_inicial.sql ya existe y está probada: no la modifiques,
úsala tal cual. Antes de empezar, muéstrame un plan corto y espera mi aprobación.
```

## 2. Registro y productos
```
Sigue con las tareas 1.1 a 1.4 del roadmap. Usa la función SQL crear_organizacion para el registro.
El escáner de código de barras debe funcionar con la cámara del celular. Escribe tests.
```

## 3. Inventario y compras
```
Haz las tareas 1.5 y 1.6. Toda entrada o salida de inventario pasa por las funciones SQL
(confirmar_compra, ajustar_inventario); nunca escribas directo en existencias ni en movimientos.
Muestra el kardex por producto con saldo y costo promedio.
```

## 4. Factura con IA
```
Haz la tarea 1.7: subir foto o PDF de factura → /api/ia/factura con la API de Claude (visión) →
JSON validado con Zod → borrador de compra con coincidencia de productos (por código, luego por nombre).
El usuario revisa y confirma. Guarda el resultado en documentos_ia.
```

## 5. POS, clientes y caja
```
Haz las tareas 1.8, 1.9, 1.11 y 1.12. El POS debe permitir vender en menos de 15 segundos:
búsqueda instantánea, escaneo, pagos mixtos y crédito. Usa confirmar_venta, anular_venta,
registrar_abono y cerrar_turno. Tests e2e con Playwright de una venta completa y un cierre de caja.
```

## 6. Comprobantes Nequi/Daviplata
```
Haz la tarea 1.10: foto del comprobante → /api/ia/comprobante → guarda en comprobantes con hash
perceptual de la imagen → llama verificar_comprobante con el monto del pago → marca el pago con
marcar_verificacion_pago y muestra una alerta clara si es sospechoso.
```

## 7. Offline
```
Haz la tarea 1.13: POS como PWA, catálogo y existencias en IndexedDB con Dexie, cola de ventas con
offline_id, sincronización al volver la conexión e indicador visible de "sin conexión / pendientes".
Prueba: vender en modo avión, reconectar y verificar que no haya duplicados.
```

## 8. Importar Excel, dashboard y demo
```
Haz las tareas 1.14, 1.15 y 1.16. El dashboard es para el celular del dueño: ventas de hoy, utilidad,
caja, alertas y top productos. Crea datos de demo de una ferretería de Riohacha con 60 días de historia.
```

## Después del MVP
```
Revisa docs/03-ROADMAP.md, dime qué sigue en la Fase 2 y propón el orden según impacto para el cliente.
```

## Consejos
- Si algo falla, pega el error completo y pide: "explícame la causa antes de corregir".
- Pide que te explique cada parte importante: así aprendes y puedes defender el proyecto.
- Cada vez que termines una fase, pide una revisión: "revisa seguridad, RLS y manejo de dinero".
