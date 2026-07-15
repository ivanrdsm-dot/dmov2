# DMov · Carga de servicios Mayo-Junio 2026

**50 servicios · 7 clientes · listos para cargar al sistema.**

---

## 📂 Contenido de esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `SERVICIOS_DMOV_2026-05-06_FORMATEADO.xlsx` | Excel reformateado a tabla plana con columna CLIENTE en cada fila. Compatible con el importador del sistema. |
| `01-backup-mayo.js` | Descarga JSON con las facturas actuales de mayo 2026 (seguridad antes de borrar). |
| `02-delete-mayo.js` | Borra las facturas de mayo 2026 de Firestore con triple confirmación. |
| `03-importar-bitacora.js` | Crea las 50 facturas con cliente, plan y empresa ya mapeados. |
| `README.md` | Este archivo. |

---

## 🎯 Decisiones de mapeo (cliente → plan)

| Excel | Sistema · Cliente | Empresa que factura | Plan |
|---|---|---|---|
| **SCJ** (17) | SCJ | MARKETING & PROMOTION SAPI DE CV | `10344 MAP → SCJ Promotores Operación` |
| **HENRY** (13) | Henry / Walmart ✨ nuevo | POR DEFINIR | `Walmart Canjes Promotores` |
| **ACT NOW** (7) | Actnow | PROMOCIONES AMERICA LATINA SAPI | `210201 PL → Campari Promotores` |
| **ROBOTS** (5) | Robots / POD | PROMOTOR ON DEMAND SA DE CV | `212802 POD Robots` |
| **CANNON** (5) | Canon | G-MAP OPERADORA SA DE CV | `202003 GMAP → Canon Promotores` |
| **HERSHEYS** (2) | Hersheys | PROMOCIONES AMERICA LATINA SAPI | `222829 → Hersheys Implementaciones` |
| **IVAN** (1) ⚠️ | MAP / Sofía Trueba | MARKETING & PROMOTION SAPI | `12801 MAP → Varios 2011` |

**✨ Henry / Walmart** se agregó al catálogo CLIENTE_PLANES en App.jsx como cliente nuevo. Datos fiscales pendientes (`pendienteFiscales: true`). Hay que completarlos cuando los tengamos.

**⚠️ IVAN** se cargó provisionalmente al plan MAP/Varios. Confirmar después y cambiar manualmente si pertenece a otro plan o si requiere uno nuevo.

---

## 🛠️ Flujo de ejecución (paso a paso)

### Paso 0 · Pre-requisitos

- [ ] Estar logueado en https://dmov2-ixgf.vercel.app/ con cuenta admin.
- [ ] Tener abierto DevTools (F12 → pestaña Console).
- [ ] Cerrar cualquier modal/tarea pendiente en la app.

### Paso 1 · BACKUP (no destructivo)

Pega `01-backup-mayo.js` en la consola y dale Enter.

**Resultado esperado:**
- Se descarga un JSON `dmov-backup-mayo-2026-*.json` a tu carpeta de Descargas.
- En consola ves resumen por cliente con conteos y totales.
- Si no había nada en mayo: el script avisa y termina (no hay nada que hacer).

**No avances hasta tener el JSON en tus Descargas.**

### Paso 2 · ELIMINAR mayo 2026

Pega `02-delete-mayo.js` en la consola.

**Resultado esperado:**
- Te pide escribir literal: `BORRAR MAYO 2026`
- Luego un confirm() del navegador.
- Borra una por una y reporta progreso cada 10.
- Confirma al final cuántas borró.

### Paso 3 · IMPORTAR los 50 servicios

Pega `03-importar-bitacora.js` en la consola.

**Resultado esperado:**
- Te muestra el resumen por cliente.
- Pide confirmación.
- Crea las 50 facturas con folio único `FAC-*`, status "Pendiente", subtotal/total en $0.
- Al final tienes las IDs en `window.__DMOV_FACTURAS_CREADAS` por si quieres revisar.

### Paso 4 · Validar en la app

- Refresca el módulo **Facturación** en https://dmov2-ixgf.vercel.app/.
- Filtra por mes **MAYO** y **JUNIO** del año **2026**.
- Debes ver:
  - 32 facturas en MAYO (todas excepto las de junio)
  - 18 facturas en JUNIO
  - Total: 50
  - Todas con cliente, plan y empresa asignados.
  - Todas con monto $0 (pendiente captura).

### Paso 5 · Juanita captura precios

- Cada factura tiene un botón de editar en la UI.
- Juanita entra a cada una y captura el precio del servicio.
- El subtotal, IVA y total se recalculan automáticamente.

### Paso 6 · Completar datos fiscales de Henry

Cuando tengas los datos fiscales de Henry / Walmart:
1. Editar `App.jsx` línea ~1119 (catálogo CLIENTE_PLANES)
2. Llenar: `empresa`, `rfc`, `domicilio1`, `domicilio2`, `regimenFiscal`
3. Quitar la marca `pendienteFiscales: true`
4. Re-deployar a Vercel

---

## 🆘 Si algo sale mal

### Si borraste mayo y necesitas restaurar
1. Abre el JSON `dmov-backup-mayo-2026-*.json` que descargaste.
2. Te genero un script de restauración (avísame).

### Si la importación creó duplicados
- Ejecuta `02-delete-mayo.js` otra vez (borra todas las del mes).
- Vuelve a correr `03-importar-bitacora.js`.

### Si un script falla a mitad
- Los pasos 1, 2, 3 son **idempotentes** (puedes correr el mismo script otra vez).
- Backup vuelve a generar el JSON.
- Delete deja en cero lo que encuentre (si ya estaba vacío, no hace nada).
- Import puede crear duplicados si no borraste antes. Borra primero.

---

## 📊 Alternativa: usar el importador de la UI

Si prefieres NO usar los scripts:

1. En Facturación → botón "Importar bitácora" (solo admin).
2. Sube `SERVICIOS_DMOV_2026-05-06_FORMATEADO.xlsx`.
3. El sistema detecta automáticamente cliente → plan.
4. Confirma la previsualización.
5. Crea las facturas.

**Ventaja:** todo desde UI, sin tocar consola.
**Desventaja:** no elimina lo viejo de mayo; tendrías que borrarlas a mano una por una.

**Recomendación:** scripts (más limpio para reemplazar todo el mes).
