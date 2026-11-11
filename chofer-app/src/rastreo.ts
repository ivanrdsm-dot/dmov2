/* Rastreo en segundo plano. Sigue transmitiendo con la app cerrada o el equipo bloqueado,
   y arranca solo al encender el teléfono. La app no ofrece botón para apagarlo:
   se detiene únicamente cuando el servidor confirma que la ruta terminó. */
import BackgroundGeolocation, { Location } from "react-native-background-geolocation";
import { encolar } from "./cola";
import { RASTREO } from "./config";

interface Punto { lat: number; lng: number; tMs: number; precisionM: number; velocidadMs: number; bateria: number; simulada: boolean; }
let bufer: Punto[] = [];
let servicioActivo: string | null = null;
let ultima: Punto | null = null;
let temporizador: ReturnType<typeof setInterval> | null = null;

const aPunto = (l: Location): Punto => ({
  lat: l.coords.latitude, lng: l.coords.longitude, tMs: new Date(l.timestamp).getTime(),
  precisionM: l.coords.accuracy ?? -1, velocidadMs: Math.max(0, l.coords.speed ?? 0),
  bateria: Math.round((l.battery?.level ?? -1) * 100), simulada: l.mock === true,
});

async function vaciar(): Promise<void> {
  if(!servicioActivo || bufer.length === 0) return;
  const posiciones = bufer; bufer = [];
  await encolar({ tipo: "posiciones", servicioId: servicioActivo, posiciones });
}
export const ultimaPosicion = (): Punto | null => ultima;

export async function iniciarRastreo(servicioId: string, alEncolar: () => void): Promise<void> {
  servicioActivo = servicioId;
  BackgroundGeolocation.onLocation(l => {
    const p = aPunto(l); ultima = p; bufer.push(p);
    if(bufer.length >= RASTREO.lote) vaciar().then(alEncolar);
  }, () => { /* sin lectura: el servidor detecta el silencio por la falta de posiciones */ });
  await BackgroundGeolocation.ready({
    geolocation: { desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High, distanceFilter: RASTREO.distanciaM, locationAuthorizationRequest: "Always" },
    app: {
      stopOnTerminate: false, startOnBoot: true, enableHeadless: true, heartbeatInterval: RASTREO.latidoSeg,
      notification: { title: "D Movimiento", text: "Ruta en curso: tu ubicación se está compartiendo con operaciones" },
      backgroundPermissionRationale: { title: "Permite la ubicación todo el tiempo", message: "Operaciones necesita ver tu ruta aunque la app esté cerrada.", positiveAction: "Permitir siempre" },
    },
  });
  await BackgroundGeolocation.start();
  if(temporizador) clearInterval(temporizador);
  temporizador = setInterval(() => { vaciar().then(alEncolar); }, RASTREO.envioSeg * 1000);
}

/** Lectura puntual de buena precisión, para check-in, llegada y cierre. */
export async function posicionAhora(): Promise<Punto | null> {
  try { const l = await BackgroundGeolocation.getCurrentPosition({ timeout: 20, samples: 2, persist: false, desiredAccuracy: 25 }); const p = aPunto(l); ultima = p; if(servicioActivo) bufer.push(p); return p; }
  catch { return null; }
}
/** Manda de inmediato lo acumulado (antes de cerrar una parada). */
export const enviarAhora = vaciar;

/** Solo se llama cuando el servidor reporta que ya no quedan paradas. */
export async function detenerRastreo(): Promise<void> {
  await vaciar();
  if(temporizador){ clearInterval(temporizador); temporizador = null; }
  servicioActivo = null;
  await BackgroundGeolocation.stop();
  BackgroundGeolocation.removeListeners();
}
