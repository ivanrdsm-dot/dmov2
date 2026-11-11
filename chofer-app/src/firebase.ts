import { initializeApp } from "firebase/app";
// @ts-expect-error getReactNativePersistence vive en el paquete de React Native de firebase/auth
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FIREBASE, REGION } from "./config";

export const app = initializeApp(FIREBASE);
export const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
export const db = getFirestore(app);
export const storage = getStorage(app);
const funciones = getFunctions(app, REGION);

/** Llama una función del servidor. El mensaje de error del servidor ya viene en español para el chofer. */
export async function llamar<T = { ok: boolean }>(nombre: string, datos: Record<string, unknown>): Promise<T> {
  const r = await httpsCallable(funciones, nombre)(datos);
  return r.data as T;
}
export const mensajeDe = (e: unknown): string => {
  const m = (e as { message?: string })?.message ?? "";
  if(/network|internet|unavailable|deadline/i.test(m)) return "Sin señal. Se guardó y se enviará en cuanto vuelva.";
  return m.replace(/^(functions\/[a-z-]+:?\s*)/i, "") || "No se pudo completar. Intenta de nuevo.";
};
export const esFallaDeRed = (e: unknown): boolean => /network|internet|unavailable|deadline|failed to fetch/i.test((e as { message?: string; code?: string })?.message ?? "") || (e as { code?: string })?.code === "functions/unavailable";
