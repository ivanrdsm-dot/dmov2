# App nativa de choferes (Android y iPhone)

La app **abre la misma app web de choferes** (`https://salesflow-crm-13c4a.web.app/chofer`) y le agrega lo que el
navegador no puede: **GPS con la pantalla apagada** (solo durante la jornada, del check-in al check-out).

- Todo lo que se mejore en la web (`ChoferWeb.jsx`) aparece solo en la app: no hay que volver a instalarla.
- La app solo se vuelve a compilar si cambian los permisos, el ícono o la parte nativa.
- En la app, `ChoferWeb.jsx` usa el GPS de fondo (`@capacitor-community/background-geolocation`) y manda las posiciones
  por HTTP nativo (Android frena las llamadas de la página después de 5 min en segundo plano). En el navegador todo sigue igual.

## Android (se instala por enlace)

Requisitos en la Mac: Java 21 (`brew install openjdk@21`) y el SDK de Android (`android-commandlinetools`, en `~/Library/Android/sdk`).

```bash
cd app-nativa
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk
npm run android:apk        # → android/app/build/outputs/apk/release/app-release.apk
```

Antes de cada versión nueva sube `versionCode` (y `versionName`) en `android/app/build.gradle`.

**Firma:** `android/dmov-choferes.jks` y `android/keystore.properties` viven SOLO en la Mac del director (no van a GitHub).
**Respáldalos** (USB o bóveda de contraseñas): sin esa misma llave no se pueden instalar actualizaciones encima de la app.

## iPhone (TestFlight)

No se compila en la Mac (Xcode no cabe): se compila en la nube con GitHub Actions → **"App iPhone (TestFlight)"**.
Hace falta la cuenta **Apple Developer** de la empresa y 4 secretos en GitHub (ver `.github/workflows/app-ios.yml`).
Los choferes la instalan con la app **TestFlight** desde la invitación.

## Permisos que pide

- Ubicación: "Permitir todo el tiempo" (Android) / "Siempre" (iPhone). Aviso fijo "D Movimiento · ruta en curso" mientras dura la jornada.
- Cámara: fotos en vivo del check-in, placas, tablero y entregas (no se usa la galería).
- Notificaciones (Android 13+): para el aviso fijo.
