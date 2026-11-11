import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

/** Reduce la foto a ~1600 px y JPEG al 70 % antes de subir: cuida datos y batería. */
export async function comprimir(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1600 });
  const img = await ctx.renderAsync();
  const r = await img.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return r.uri;
}
/** Sube un archivo local a Storage. Las reglas solo aceptan imágenes nuevas en la carpeta del chofer. */
export async function subir(uri: string, ruta: string): Promise<void> {
  const blob = await (await fetch(uri)).blob();
  await uploadBytes(ref(storage, ruta), blob, { contentType: "image/jpeg" });
}
export const nombreFoto = (prefijo: string): string => `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
