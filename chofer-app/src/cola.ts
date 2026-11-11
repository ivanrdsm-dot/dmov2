/* Cola offline: todo lo que el chofer hace se guarda primero en el equipo con su hora real
   y se envía cuando hay señal. La interfaz nunca espera a la red. */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Tarea =
  | { tipo: "foto"; uri: string; ruta: string }
  | { tipo: "posiciones"; servicioId: string; posiciones: unknown[] }
  | { tipo: "llamada"; funcion: string; datos: Record<string, unknown> };
export interface EnCola { id: string; creadaMs: number; intentos: number; tarea: Tarea; }

const CLAVE = "dmov_cola_v1";
let enProceso = false;
const escuchas = new Set<(n: number) => void>();
const avisar = (n: number) => escuchas.forEach(f => f(n));
export const alCambiarCola = (f: (n: number) => void) => { escuchas.add(f); return () => { escuchas.delete(f); }; };

async function leer(): Promise<EnCola[]> { try { return JSON.parse((await AsyncStorage.getItem(CLAVE)) ?? "[]"); } catch { return []; } }
async function guardar(c: EnCola[]) { await AsyncStorage.setItem(CLAVE, JSON.stringify(c)); avisar(c.length); }
export const pendientes = async (): Promise<number> => (await leer()).length;

export async function encolar(tarea: Tarea): Promise<void> {
  const c = await leer();
  c.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), creadaMs: Date.now(), intentos: 0, tarea });
  await guardar(c);
}

/** Envía en orden. Se detiene en la primera falla de red; un rechazo definitivo del servidor se descarta y se reporta. */
export async function procesarCola(ejecutar: (t: Tarea) => Promise<void>, esRed: (e: unknown) => boolean, alRechazar: (t: Tarea, e: unknown) => void): Promise<void> {
  if(enProceso) return;
  enProceso = true;
  try {
    for(;;){
      const c = await leer();
      const sig = c[0];
      if(!sig) break;
      try { await ejecutar(sig.tarea); await guardar((await leer()).filter(x => x.id !== sig.id)); }
      catch(e){
        if(esRed(e)){ sig.intentos++; await guardar([sig, ...(await leer()).filter(x => x.id !== sig.id)]); break; }
        alRechazar(sig.tarea, e);
        await guardar((await leer()).filter(x => x.id !== sig.id));
      }
    }
  } finally { enProceso = false; }
}
