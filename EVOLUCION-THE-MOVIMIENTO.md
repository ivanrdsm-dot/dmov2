# THE MOVIMIENTO · Documento Ejecutivo de Evolución

**Fecha:** junio 2026 · **Sistema auditado:** DMov Logistics OS v2.2 (dmov2-ixgf.vercel.app)
**Método:** auditoría de código completa (11,559 líneas), auditoría de datos en producción (Firebase), 76 commits de historia, 4 auditores especializados en paralelo.
**Rol:** CTO + CFO + Product Manager.

---

# 1. DIAGNÓSTICO COMPLETO

## Lo que es hoy

El sistema es **tres aplicaciones en una**, servidas desde un solo archivo React de 764 KB:

1. **Back-office** (18 módulos): dashboard, cotizador, presupuestos, prospección, tracking en vivo, planificador de rutas, choferes, proyectos nacionales, entregas, facturación, reportes, viáticos, gastos de choferes, jornadas, chat, alertas, clientes, usuarios.
2. **PWA del chofer** (`/chofer`): login por teléfono+código, rutas asignadas, GPS en vivo, evidencia fotográfica + firma digital, gastos, chat, jornadas.
3. **Tracking público** (`/track/:id`): el cliente ve su entrega en vivo estilo Uber, sin login.

## Los datos reales (auditados en producción)

| Métrica | Valor | Lectura |
|---|---|---|
| Facturación registrada 2026 (ene–jul) | **$1,798,438 MXN** | El sistema ya es el registro financiero real del negocio |
| Facturas | 128 (69 con monto, 59 en captura) | Operación viva |
| Costos registrados (viáticos) | $1,058,724 | **92% está en categoría "otro"** → el P&L real es invisible |
| Rutas operadas en sistema | 12 | Módulo de rutas subutilizado vs facturación |
| Cotizaciones | 2 | El cotizador casi no se usa (o se cotiza fuera del sistema) |
| Colecciones vacías | entregas, driverLocations, proyectos, plantillas | Módulos construidos que la operación no adoptó |
| Campo `plan` en facturas | **35 variantes de texto para ~8 planes reales** | La agregación por plan/cliente es poco confiable |

**Lectura ejecutiva:** el negocio factura ~$300K/mes a través del sistema y el módulo estrella es **Facturación + bitácora + solicitudes XLSX** (el flujo de Juanita). La parte operativa (rutas, tracking, entregas) está construida con calidad pero la operación diaria no la ha adoptado al mismo nivel. La mina de oro —los datos financieros— existe pero está sucia: meses en dos formatos, planes fragmentados, 92% de costos sin categoría.

---

# 2. FORTALEZAS DEL SISTEMA ACTUAL

1. **Cobertura funcional excepcional para su tamaño.** 18 módulos + PWA + tracking público. Empresas de logística 10× más grandes operan con menos.
2. **La cadena Bitácora → Clasificación automática → Factura → Solicitud XLSX formato oficina** es un diferenciador real: convierte un Excel operativo en solicitudes de factura con datos fiscales SAT correctos (RFC, régimen, domicilio, uso CFDI). Esto ya ahorra horas semanales.
3. **Catálogo `CLIENTE_PLANES` con datos fiscales reales** (9 clientes, RFC, regímenes verificados en CSF). Es el activo de datos maestros más valioso del sistema.
4. **App de chofer de nivel superior:** GPS con WakeLock, evidencia foto+firma, incidencias categorizadas, notificación WhatsApp al cliente por evento, modo offline parcial. Ningún competidor del tamaño de DMov tiene esto.
5. **Tracking público para el cliente** — argumento de venta directo.
6. **Stack moderno y vigente:** React 18, Firebase 10, Mapbox GL 3, Vite 5. No hay deuda de plataforma.
7. **Historia de evolución sana:** 76 commits temáticos, mejoras iterativas reales.

---

# 3. DEBILIDADES

## Críticas (comprometen el negocio hoy)

| # | Debilidad | Evidencia |
|---|---|---|
| D1 | **Seguridad: toda la base financiera es legible y escribible por cualquier sesión anónima.** Las reglas dicen `allow read, write: if request.auth != null` y la app entrega auth anónima a cualquiera que abra la URL. Facturas, ingresos, clientes, PINs — todo expuesto. | `firestore.rules:31-34` |
| D2 | **Storage 100% público** (`allow read, write: if true`): cualquiera puede leer y subir archivos. | `storage.rules` |
| D3 | **Claves committeadas y hardcodeadas** (Firebase API key + token Mapbox activo, en `.env` y como fallback en el código del bundle público). | `App.jsx:31-36` |
| D4 | **El SOS del chofer es invisible:** el botón de pánico escribe en la colección `alerts`, pero el banner de emergencia y el Centro de Alertas leen `alertas` — colección que nada escribe. Una emergencia real no se vería. | `App.jsx:7983` vs `:10910` |
| D5 | **PINs crackeables offline:** SHA-256 sin salt + colección de usuarios legible por anónimos. | `App.jsx:55` |

## Estructurales (limitan el crecimiento)

| # | Debilidad | Consecuencia |
|---|---|---|
| D6 | Monolito de 11,559 líneas, 60 componentes, 0 tests, 0 tipos, 0 CI | Cada cambio arriesga todo; nadie más puede mantenerlo |
| D7 | 10 suscripciones a colecciones completas sin `limit()` al arrancar; facturas suscritas 3 veces | Costo Firebase y lentitud crecen O(N) con la historia del negocio — sin techo |
| D8 | Evidencias (fotos/firmas/tickets) en base64 **dentro** de los documentos | Límite duro de 1 MB/doc: una ruta con varias entregas con foto puede **fallar al guardar** |
| D9 | Sin integridad referencial: cliente/plan/operador/ruta son texto libre re-tecleado | Rentabilidad por cliente/unidad/operador **imposible de calcular con confianza** |
| D10 | Flujos rotos: cotización, proyecto y prospecto "ganado" no fluyen a nada | Re-captura manual, datos duplicados, adopción baja |
| D11 | Costos en 3 silos sin conciliar (`viaticos`, `gastosChofer`, `xViat` estimado); el P&L ignora `gastosChofer` | La utilidad reportada está sobreestimada |
| D12 | Tarifario hardcodeado (~200 ciudades) sin UI de edición | Cambiar un precio = deploy de código |
| D13 | Bundle de 4.5 MB sin code-splitting; el chofer descarga xlsx+pdf+mapbox que nunca usa | Lentitud en campo con datos móviles |
| D14 | 0 atributos de accesibilidad; 33 `alert()/confirm()` nativos | UX por debajo del estándar que se busca |

---

# 4. RIESGOS

| Riesgo | Prob. | Impacto | Detalle |
|---|---|---|---|
| **Fuga o manipulación de datos financieros** | Alta | Crítico | D1–D3: hoy es explotable sin conocimientos avanzados. $1.8M de información comercial y datos fiscales de clientes expuestos. |
| **Fallo operativo por límite de documento** | Media | Alto | D8: el día que una ruta tenga 8-10 entregas con foto, la escritura falla y se pierde evidencia en campo. |
| **Emergencia de chofer no atendida** | Baja | Crítico (humano) | D4: el SOS existe en UI pero no llega al panel. |
| **Costo Firebase creciente** | Alta | Medio | D7: cada mes de operación encarece TODAS las sesiones (se descarga la historia completa). |
| **Bus factor = 1** | Media | Alto | D6: sin tests ni módulos, solo quien lo escribió (Claude + Iván) puede tocarlo con seguridad. |
| **Decisiones sobre datos sucios** | Alta | Alto | 92% de costos "otro" + planes fragmentados: cualquier análisis de rentabilidad hoy es una ilusión. |

---

# 5. OPORTUNIDADES

1. **El dato ya existe** — $1.8M de facturación con fecha, cliente, plan y chofer. Con limpieza + categorización, el dashboard ejecutivo sale de datos reales, no requiere empezar a capturar.
2. **La bitácora es el caballo de Troya de datos:** cada renglón trae fecha/chofer/unidad/cliente/servicio. Si se enriquece con km y costo, la rentabilidad por unidad/operador/ruta se calcula sola.
3. **El tracking público es vendible:** hoy es una feature; puede ser el argumento comercial #1 contra competidores tradicionales (Castores, Tres Guerras no lo tienen).
4. **El catálogo fiscal (`CLIENTE_PLANES`) puede vivir en Firestore** y volverse editable por Juanita, cerrando el ciclo sin deploys.
5. **Cloud Functions desbloquea todo lo automático:** estados de factura, agregaciones para dashboard O(1), alertas de negocio, backups.
6. **Con el Mundial 2026 y Buen Fin en camino,** el sistema puede capturar la operación más intensa del año — si la fundación de datos se arregla antes de agosto.

---

# 6. ARQUITECTURA RECOMENDADA

**Principio rector: evolución incremental, cero pérdida de datos, cero big-bang.** Se conserva React + Firebase + Vercel. Nada de migrar de plataforma.

## Estado objetivo

```
ANTES                                    DESPUÉS
─────────────────────────────           ─────────────────────────────────────────
App.jsx (11.5k líneas)                  /src
  todo mezclado                           /apps
                                            /admin    (back-office, lazy)
Firestore                                   /chofer   (PWA, lazy, bundle ligero)
  reglas abiertas                           /track    (público, bundle mínimo)
  texto libre en todo                     /shared    (ui, hooks, servicios)
  base64 en docs                          /domain    (cálculos: tarifas, IVA, viáticos)
  lecturas O(N)                         Firestore
                                          reglas RBAC por rol y colección
sin backend                               clienteId/planId como referencias
                                          índices declarados
                                        Storage
                                          /evidencias con reglas por ruta
                                        Cloud Functions
                                          agregados diarios (dashboard O(1))
                                          fan-out de denormalización
                                          estados automáticos (Vencida)
                                          backup diario a Storage
```

## Decisiones clave

1. **Misma base de datos, esquema versionado.** Los documentos existentes no se migran destructivamente: se añaden campos (`clienteId`, `categoriaGasto`) con scripts de backfill (como los que ya usamos para mesOp). Los campos legacy se leen con fallback hasta deprecarlos.
2. **Tres bundles, no uno.** `React.lazy` por app: el chofer baja ~300 KB en vez de 4.5 MB.
3. **Cloud Functions solo donde el cliente no puede:** agregaciones, consistencia, tareas programadas. La lógica de UI se queda en el cliente.
4. **Colección `agregados/`** (1 doc por mes + 1 "hoy"): el dashboard ejecutivo lee 2 documentos en vez de 5 colecciones completas.
5. **Catálogos a Firestore:** `catalogos/planes`, `catalogos/tarifario`, `catalogos/categorias_gasto`, `catalogos/unidades` — editables desde un módulo de Configuración.
6. **TypeScript y tests solo en el dominio financiero primero** (cálculo de IVA, tarifas, viáticos, P&L): es donde un bug cuesta dinero.

---

# 7. ROADMAP POR FASES

## FASE 0 · BLINDAJE (1–2 semanas) — no negociable
> Cerrar la puerta antes de amueblar la casa.

- Reglas Firestore RBAC reales (admin/operaciones/chofer con custom claims; chofer solo SU ruta y SUS gastos).
- Cerrar `storage.rules`; rotar y restringir claves (Firebase por dominio, Mapbox por URL).
- Hash de PIN con salt + no exponer colección usuarios.
- **Backup automático diario** de Firestore a Storage (Cloud Function programada).
- Unificar `alerts`/`alertas` y conectar el SOS de verdad.

## FASE 1 · FUNDACIÓN DE DATOS (2–3 semanas)
> Sin esto, el dashboard ejecutivo mentiría.

- `clienteId` y `planId` como referencias en facturas/rutas/presupuestos (backfill de las 128 facturas: ya demostramos el método con mesOp).
- Normalizar las 35 variantes de plan → 8 planes canónicos.
- Categorización obligatoria de gastos (catálogo de 14 categorías de la Fase 5 del brief) + **backfill asistido de los $971K en "otro"**.
- Unificar `viaticos` + `gastosChofer` en modelo único de gastos con `choferId`, `rutaId`, `unidadId`.
- Crear colección `unidades` (¡hoy los vehículos no existen como entidad!) — placa, tipo, seguros, verificación.
- Evidencias a Firebase Storage (URL en el doc, no base64).
- `firestore.indexes.json` + `limit()`/paginación en todas las vistas.

## FASE 2 · NÚCLEO FINANCIERO (3–4 semanas)
- Registro de **pagos** (parciales, anticipos, fecha real de cobro) → flujo de efectivo real y aging de cartera.
- Estados automáticos: Vencida se persiste sola; recordatorios de cobranza.
- Gastos recurrentes (rentas, seguros, nómina) para llegar a **utilidad neta**, no solo bruta.
- Conciliación viático estimado vs gasto real por ruta.
- P&L que incluye TODOS los costos (hoy ignora gastosChofer).

## FASE 3 · DASHBOARD EJECUTIVO + BI (2–3 semanas)
- Cloud Function de agregación diaria → KPIs O(1).
- Dashboard con los 21 indicadores del brief (ver §12).
- Detección de anomalías: gasto por unidad vs su promedio histórico, cliente con caída 2 meses seguidos, margen por ruta bajo umbral, factura por vencer.
- Recomendaciones ejecutivas semanales generadas de datos.

## FASE 4 · FLUJOS CONECTADOS + UX (3–4 semanas)
- Cotización → Ruta → Factura en un clic (los `stops[]` ya tienen la forma correcta).
- Prospecto ganado → Cliente + Presupuesto automático.
- Proyecto nacional → genera sus rutas.
- Rediseño visual: design tokens, componentes compartidos, eliminar alert()/confirm(), accesibilidad, estética Linear/Stripe (ya existe la base de color naranja/navy).
- Code-splitting de las 3 apps.

## FASE 5 · PLATAFORMA (continuo)
- TypeScript en dominio financiero → gradual al resto.
- Tests del motor de cálculo + CI en Vercel.
- Extracción de módulos a archivos (mecánica, sin cambiar comportamiento).

---

# 8. QUICK WINS (cada uno < 1 día, impacto inmediato)

| # | Quick win | Impacto |
|---|---|---|
| QW1 | Unificar `alerts`→`alertas` (o alias de lectura) | El SOS funciona — riesgo humano cerrado |
| QW2 | Cerrar `storage.rules` | Fuga de evidencias cerrada |
| QW3 | Restringir token Mapbox por URL + API key por dominio | Corta abuso de terceros |
| QW4 | Script de normalización de `plan` (35→8) sobre las 128 facturas | Reportes por plan confiables ya |
| QW5 | Persistir "Vencida" con un job diario | Cartera vencida real en dashboard |
| QW6 | Selector obligatorio de categoría en viáticos (quitar default "otro") | Los datos nuevos nacen limpios |
| QW7 | Backup diario automatizado | Seguro de vida del negocio |
| QW8 | Deploy del catálogo con Henry/Walmart (ya está en local) | La bitácora de julio clasifica sola |
| QW9 | Borrar código muerto + 1 de las 2 libs de Excel | −900 KB de bundle |
| QW10 | `limit(200)` + orderBy en las 5 vistas más pesadas | Corta el costo O(N) hoy mismo |

---

# 9. MEJORAS DE ALTO IMPACTO (las 5 que más mueven la aguja)

1. **Fundación de datos (F1 completa).** Sin `clienteId`/categorías, la "inteligencia de negocio" es imposible. Es la mejora que habilita todas las demás.
2. **Registro de pagos + flujo de efectivo.** Hoy el sistema sabe cuánto facturas pero no cuándo cobras. Para una empresa de logística con PPD (pago en parcialidades), el cash flow ES el negocio.
3. **Dashboard ejecutivo sobre agregados.** Decisiones diarias con datos de hoy, no exports de Excel mensuales.
4. **Cotización→Ruta→Factura conectadas.** Elimina la re-captura, sube la adopción del módulo de rutas (hoy 12 rutas vs 128 facturas) y da trazabilidad ingreso-costo por servicio.
5. **Seguridad (F0).** No "mueve la aguja" — evita que la aguja desaparezca.

---

# 10. NUEVOS MÓDULOS RECOMENDADOS

| Módulo | Por qué | Complejidad |
|---|---|---|
| **Unidades / Flota** | Los vehículos no existen como entidad: sin ellos no hay rentabilidad ni mantenimiento por unidad. Placas, seguros, verificaciones, costos. | Media |
| **Cobranza** | Aging de cartera, recordatorios, registro de pagos parciales, complementos PPD. | Media |
| **Finanzas** (P&L vivo + flujo de efectivo) | Consolida lo que hoy está en 3 exports de Excel. | Media-alta |
| **Configuración** | Tarifario, planes, categorías y catálogos editables sin deploy. | Baja-media |
| **Documentos de chofer** | Licencias/vencimientos con alertas (hoy `licencia` es un texto). | Baja |

---

# 11. CAMBIOS AL MODELO DE DATOS

**Resumen de los 8 cambios (detalle en auditoría):**

1. `clienteId` en facturas, rutas, presupuestos, cotizaciones, prospección → FK real a `cuentas`.
2. `catalogos/planes` en Firestore; `facturas.planId` normalizado.
3. Colección `unidades`; `rutaId`+`unidadId`+`choferId` en todo gasto.
4. Unificar gastos (`viaticos` ∪ `gastosChofer` → modelo único con `origen`).
5. Evidencias: base64 → Storage URL.
6. Colección `pagos` (facturaId, monto, fecha, método) → cash flow.
7. Colección `agregados` (KPIs precalculados por día/mes).
8. Eliminar: colección `entregas` huérfana, `alerts` duplicada, campos dinámicos `fotoDanio_<idx>`, campos legacy (`cliente`/`monto` en facturas) tras backfill.

**Todo con backfill no destructivo** — método ya probado en este proyecto (normalización mesOp de 50 facturas, sin downtime).

---

# 12. DASHBOARD EJECUTIVO — mapeo de los 21 KPIs

| KPI del brief | ¿Calculable hoy? | Qué falta |
|---|---|---|
| Ventas día/semana/mes/año | ✅ facturas | Limpieza de plan/mes (F1) |
| Gastos día/semana/mes/año | ⚠️ parcial | Categorización + unificación de gastos |
| Flujo de efectivo | ❌ | Colección `pagos` (F2) |
| Utilidad bruta / margen | ⚠️ sobreestimada | Incluir gastosChofer + categorías |
| Utilidad neta | ❌ | Gastos fijos recurrentes (F2) |
| Cuentas por cobrar / vencida | ✅ | Persistir "Vencida" (QW5) |
| Clientes nuevos / recurrentes | ✅ | clienteId (F1) |
| Ticket promedio | ✅ | — |
| Rentabilidad por cliente | ⚠️ | clienteId + gastos por ruta |
| Rentabilidad por unidad | ❌ | Colección unidades + unidadId en gastos |
| Rentabilidad por operador | ⚠️ | choferId en viáticos (hoy texto libre) |
| Rentabilidad por ruta | ⚠️ | rutaId en gastos + adopción de rutas |
| Rentabilidad por servicio | ✅ | bitacoraServicios ya lo trae |
| Servicios realizados / cancelados | ✅ | — |
| Cumplimiento operativo | ⚠️ | Requiere adopción de rutas/entregas |
| Crecimiento mensual / comparativos | ✅ | Agregados (F3) |

**Conclusión:** 8 KPIs salen ya, 6 requieren la Fase 1 y 7 requieren la Fase 2. Por eso el orden del roadmap es el que es.

---

# 13. AUTOMATIZACIONES

1. **Diarias (Cloud Function programada):** marcar Vencidas, recalcular agregados, backup, alertas de licencias/seguros por vencer.
2. **Por evento (triggers):** factura creada → actualizar agregado del mes; pago registrado → recalcular CxC; gasto de chofer aprobado → sumar al costo de su ruta; chofer cambia teléfono → fan-out a documentos activos.
3. **Semanales:** resumen ejecutivo automático (correo/WhatsApp): ventas de la semana, cobranza crítica, anomalías detectadas.
4. **Bitácora inteligente:** el importador ya clasifica cliente→plan; añadir sugerencia de precio desde tarifario + histórico del mismo servicio.

---

# 14. ESTIMACIÓN DE COMPLEJIDAD

| Fase | Duración | Riesgo técnico | Dependencias |
|---|---|---|---|
| F0 Blindaje | 1–2 sem | Bajo (reglas + config) | Ninguna |
| Quick wins | 1 sem (paralelo a F0) | Trivial | Ninguna |
| F1 Fundación datos | 2–3 sem | Medio (backfills, probado el método) | F0 |
| F2 Núcleo financiero | 3–4 sem | Medio | F1 |
| F3 Dashboard + BI | 2–3 sem | Bajo-medio | F1 (ideal F2) |
| F4 Flujos + UX | 3–4 sem | Medio | F1 |
| F5 Plataforma | continuo | Bajo (mecánico) | — |

**Total a plataforma empresarial: ~3–4 meses** de trabajo enfocado, entregando valor cada semana (no big-bang final).

---

# 15. ORDEN RECOMENDADO DE IMPLEMENTACIÓN

```
Semana 1-2   F0 Blindaje + Quick Wins (QW1-QW10)
Semana 3-5   F1 Fundación de datos  ← el desbloqueador de todo
Semana 6-9   F2 Núcleo financiero
Semana 8-10  F3 Dashboard ejecutivo (solapa con F2)
Semana 11-14 F4 Flujos conectados + UX premium
Continuo     F5 Plataforma (TypeScript, tests, CI)
```

**Regla de oro de toda la evolución:** cada cambio es incremental, con backfill no destructivo y backup previo. El negocio nunca se detiene; los datos históricos nunca se pierden. Ya lo demostramos dos veces en este proyecto (importación de 50 servicios, normalización de meses) — ese es el estándar.

---

## Decisión que te pido

1. **¿Apruebo Fase 0 + Quick Wins para arrancar ya?** (seguridad — no debería esperar)
2. Las 3 facturas viejas de mayo con monto (FAC-ACTNOW-MAY26 $63,800, FAC-2NDF0W $3,480, FAC-W9T0EU $2,900): ¿se quedan o se eliminan? (respaldadas en `operacion-mayo-junio-2026/backup-viejas-may-2026.json`)
3. Datos fiscales de Henry/Walmart cuando los tengas, para cerrar el catálogo.
