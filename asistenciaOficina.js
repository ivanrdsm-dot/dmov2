/* Asistencia de hoy de una persona de la oficina (sin cargar la cámara: el resto vive en CheckOficina.jsx). */
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

const fechaCDMX = (ms = Date.now()) => new Date(ms - 6 * 3600000).toISOString().slice(0, 10);
/** undefined = revisando · null = sin entrada hoy · objeto = su registro del día. */
export function useAsistenciaOficina(db, uid, activo){
  const [a, setA] = useState(undefined);
  useEffect(() => {
    if(!uid || !activo){ setA(undefined); return; }
    return onSnapshot(doc(db, "asistencia_oficina", `${uid}_${fechaCDMX()}`), s => setA(s.exists() ? s.data() : null), () => setA(null));
  }, [db, uid, activo]);
  return a;
}

/** Durante la jornada (de su entrada a su salida), manda su ubicación cada 5 min y al volver a abrir el sistema.
 *  Solo mientras el sistema está abierto en su celular (el navegador no permite más). Fuera de la jornada no se manda nada. */
export const CADA_MS_UBICACION_OFICINA = 5 * 60000;
export function useUbicacionJornada(app, activo){
  useEffect(() => {
    if(!activo || !app || typeof navigator === "undefined" || !navigator.geolocation) return;
    let vivo = true, ultima = 0;
    const mandar = async () => {
      if(!vivo || document.visibilityState === "hidden" || Date.now() - ultima < 60000) return;
      ultima = Date.now();
      navigator.geolocation.getCurrentPosition(async p => {
        try {
          const { getFunctions, httpsCallable } = await import("firebase/functions");
          await httpsCallable(getFunctions(app, "us-central1"), "oficinaUbicacion")({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: p.coords.accuracy, tMs: Math.round(p.timestamp || Date.now()) });
        } catch { /* sin señal: se intenta en la siguiente vuelta */ }
      }, () => {}, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    };
    mandar();
    const t = setInterval(mandar, CADA_MS_UBICACION_OFICINA);
    const alVolver = () => { if(document.visibilityState === "visible") mandar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [app, activo]);
}
