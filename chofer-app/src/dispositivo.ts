import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/* Un chofer, un equipo: el servidor liga este identificador a la cuenta la primera vez. */
let cache: string | null = null;
export async function idDispositivo(): Promise<string> {
  if(cache) return cache;
  let id = Platform.OS === "android" ? Application.getAndroidId() : null;
  if(!id){
    id = await AsyncStorage.getItem("dmov_dispositivo");
    if(!id){ id = "inst-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12); await AsyncStorage.setItem("dmov_dispositivo", id); }
  }
  cache = "and-" + id;
  return cache;
}
export const modeloDispositivo = (): string => `${Platform.OS} ${Platform.Version}`;
