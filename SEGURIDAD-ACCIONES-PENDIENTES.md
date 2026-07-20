# F0 · Acciones de seguridad que requieren TU acceso (15 min total)

> Lo automatizable ya está hecho (reglas desplegadas, backup diario, SOS reparado).
> Estas 4 acciones se hacen en consolas web con tu cuenta — yo no puedo ni debo hacerlas por ti.

## 1. Restringir el token de Mapbox (5 min) — LA MÁS URGENTE

El token `pk.eyJ1IjoiZG1vdi...` está en el bundle público (inevitable: Mapbox funciona así), pero SIN restricción de URL cualquiera puede usarlo y el consumo se factura a tu cuenta.

1. Entra a https://account.mapbox.com/access-tokens/
2. Abre el token que empieza con `pk.eyJ1IjoiZG1vdi`
3. En **URL restrictions** agrega:
   - `https://dmov2-ixgf.vercel.app`
   - `https://*.vercel.app` (o mejor: solo tu dominio final cuando lo tengas)
4. Guarda. Nada se rompe: la app sigue funcionando desde esas URLs.

## 2. Restringir la API key de Firebase (5 min)

1. Entra a https://console.cloud.google.com/apis/credentials?project=salesflow-crm-13c4a
2. Abre la key `AIzaSyB7tuRYUEY471IPJdnOB69DI2yKLCU72T0`
3. En **Application restrictions** elige "Websites" y agrega:
   - `dmov2-ixgf.vercel.app`
   - `*.vercel.app`
   - `localhost` (para desarrollo)
4. Guarda.

> Nota: la API key de Firebase no es un secreto (va en el bundle por diseño), pero restringirla por dominio evita que terceros la usen para autenticarse contra tu proyecto desde sus propios sitios.

## 3. Activar Firebase Storage (2 min) — prepara la F1

Hoy las fotos de evidencia van en base64 DENTRO de Firestore (límite 1 MB/doc — riesgo de fallo).
En F1 las migramos a Storage, pero el producto hay que activarlo a mano:

1. https://console.firebase.google.com/project/salesflow-crm-13c4a/storage
2. Click "Get Started" (plan Spark alcanza para empezar)
3. Avísame y despliego las reglas de Storage que ya están escritas en `storage.rules`.

## 4. Revisar usuarios duplicados (3 min)

En el sistema hay 3 perfiles de Iván (2 inactivos) y ninguno con PIN visiblemente configurado
en el picker ("Sin contraseña"). Recomendación:

1. Panel → Usuarios & Roles
2. Elimina los 2 perfiles "Ivan Cadavieco" inactivos
3. Ponle PIN a tu perfil admin y al de Ilse

---

## Lo que quedó pendiente para Fase 0.5 (requiere desarrollo, ~1 semana)

**RBAC real:** hoy las reglas permiten a cualquier sesión anónima leer/escribir datos
financieros (el login por perfil+PIN es cosmético — solo visual). El arreglo de fondo:
- Oficina entra con **Google Sign-In** (tu cuenta y la de Ilse) con lista blanca
- Choferes siguen con auth anónima pero las reglas les limitan a SU ruta y SUS gastos
- Custom claims de rol en el token

Está especificado en `EVOLUCION-THE-MOVIMIENTO.md` §7 Fase 0. Dame luz verde cuando
quieras y lo implemento — es el único punto de F0 que no se puede hacer sin tocar el
flujo de login en producción.

---

## 5. NUEVO (RBAC v3) · Service account para el backup diario (2 min) — URGENTE

Las reglas v3 bloquean la lectura anónima de datos financieros (correcto), pero eso
también bloquea el **backup diario automatizado**. Para restaurarlo:

1. Entra a https://console.firebase.google.com/project/salesflow-crm-13c4a/settings/serviceaccounts/adminsdk
2. Click **"Generate new private key"** → descarga el JSON
3. Guárdalo EXACTAMENTE como: `SISTEMA DMOV/serviceAccount.json`
4. Listo — el job de las 21:30 vuelve a funcionar solo (ya está en .gitignore, no se sube al repo)

⚠️ Hasta que hagas esto, NO HAY BACKUP DIARIO. El último backup completo es del día del deploy de RBAC.
