/* EVIDENCIA · revisión de las fotos de check-in/out en el SERVIDOR y formato del trazo de ruta.
   Lógica pura; probada en evidencia.test.js. */

export const FOTO_MAX_MIN = 15;          // la foto debe haberse SUBIDO hace menos de esto (hora de Google)
export const FOTO_MIN_BYTES = 8 * 1024;  // menos que esto no es una foto real

/** `meta` = metadatos de Cloud Storage (los pone Google, no el celular). */
export function revisarFotoJornada(meta, ahoraMs){
  if(!meta) return { ok: false, motivo: "No se encontró una de las fotos. Vuelve a tomarla." };
  if(!String(meta.contentType || "").startsWith("image/")) return { ok: false, motivo: "Uno de los archivos no es una foto." };
  const bytes = Number(meta.size) || 0;
  if(bytes < FOTO_MIN_BYTES) return { ok: false, motivo: "Una de las fotos salió vacía o muy pequeña. Vuelve a tomarla." };
  const subidaEnMs = Date.parse(meta.timeCreated || "");
  if(!Number.isFinite(subidaEnMs)) return { ok: false, motivo: "No se pudo comprobar la hora de una foto." };
  if(ahoraMs - subidaEnMs > FOTO_MAX_MIN * 60000) return { ok: false, motivo: "Las fotos deben ser de este momento. Tómalas otra vez." };
  /* Sello que pone la app (hora y GPS del celular). Si no coincide con la hora real, se avisa (no se bloquea). */
  const sello = String(meta.metadata?.sello || "");
  const tSello = Number(meta.metadata?.tomadaMs);
  const aviso = !sello ? "foto sin sello de la app"
    : meta.metadata?.enVivo === "no" ? "la foto no se tomó con la cámara en vivo de la app"
    : meta.metadata?.selloImpreso === "no" ? "la foto no lleva impresos el lugar y la hora"
    : Number.isFinite(tSello) && Math.abs(subidaEnMs - tSello) > 10 * 60000 ? "la hora del celular no coincide con la real" : "";
  return { ok: true, md5: String(meta.md5Hash || ""), bytes, subidaEnMs, aviso };
}

/** El trazo se guarda como texto "lng,lat;lng,lat" (Firestore no admite listas dentro de listas). */
export const lineaATexto = linea => (linea || []).map(([lng, lat]) => `${Number(lng).toFixed(5)},${Number(lat).toFixed(5)}`).join(";");
export const lineaDeTexto = t => String(t || "").split(";").map(x => x.split(",").map(Number)).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
