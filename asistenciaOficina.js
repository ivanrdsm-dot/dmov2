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
