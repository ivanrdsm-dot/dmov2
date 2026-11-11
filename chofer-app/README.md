# D Movimiento · App de choferes (Android)

React Native + Expo SDK 58 (New Architecture). La app solo pide; el servidor decide. Identidad, equipo, hora, ubicación, geocerca y cierre de parada se validan en `functions/chofer.js`.

## Qué hace
| Pantalla | Función del servidor | Qué valida el servidor |
| --- | --- | --- |
| Entrar | `choferRegistrarDispositivo` | Cuenta ligada a un chofer activo y a UN solo equipo |
| Inicio de jornada | `choferCheckIn` | Selfie y fotos subidas desde la app, placas, kilometraje, gasolina; hora del servidor; uno por día |
| Mi ruta | `choferIniciarRuta` | Check-in de hoy y servicio asignado a ese chofer |
| Rastreo | `choferSubirPosiciones` | Ubicación simulada, saltos imposibles, reloj adelantado |
| Parada | `choferCerrarParada` | Foto, nombre de quien recibe y ubicación confiable dentro de la geocerca |
| SOS | `choferSOS` | Siempre pasa: no exige check-in ni servicio |

- **Rastreo en segundo plano** con `react-native-background-geolocation`: sigue con la app cerrada, arranca al encender el equipo y no tiene botón para apagarse. Se detiene cuando el servidor confirma que no quedan paradas.
- **Sin señal**: fotos, posiciones y cierres se guardan en el teléfono en orden (`src/cola.ts`) y se envían solos al volver la red. Un cierre hecho sin señal se valida contra la posición de ese momento.
- **Fotos** solo desde la cámara de la app, reducidas a 1600 px antes de subir.

## Compilar
Requiere un *development build*; no funciona en Expo Go.

```bash
cd chofer-app
npm install
cp .env.example .env        # poner la API key y el App ID de Firebase (los mismos del panel web)
npx expo prebuild --platform android
npx eas build --profile development --platform android
```

## Estado de verificación
| Qué | Estado |
| --- | --- |
| `npx tsc --noEmit` | Pasa sin errores |
| `npx expo prebuild --platform android` | Pasa: genera el proyecto nativo con los permisos de ubicación en segundo plano y servicio en primer plano |
| Compilar APK | NO hecho: requiere cuenta de Expo (EAS) o Android SDK local |
| Prueba en teléfono físico | NO hecha: rastreo en segundo plano, cámara, cola sin señal y consumo de batería se validan en el piloto |
| Funciones del servidor | Lógica con pruebas unitarias; reglas con pruebas en emulador; sin prueba de punta a punta todavía |

## Pendiente
- **Licencia Transistorsoft**: en modo debug funciona sin licencia. Para la versión de piloto se compra y se pone en `app.json` → plugin `react-native-background-geolocation` → `license`.
- **Firma de quien recibe**: hoy se captura nombre y foto. La firma en pantalla es el siguiente incremento.
- **Comparación facial y prueba de vida**: apagadas hasta la revisión legal. El check-in guarda `verificacionFacial: "no_aplicada"`.
- **Play Integrity y App Check**: requieren módulos nativos de Firebase; se agregan antes del piloto.
- **Kiosco**: se configura en el administrador de equipos, fuera de la app.
