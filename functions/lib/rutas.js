/* ORDEN DE LA RUTA · ordena las entregas para no dar vueltas de más.
   - Las cargas (orígenes) van primero y en el orden capturado.
   - Las entregas se ordenan por cercanía desde la última carga (vecino más
     cercano) y luego se mejora con 2-opt (quita cruces).
   Es distancia en línea recta: sirve para decidir el orden, no para cobrar.
   Lógica pura; probada en rutas.test.js. */
import { distanciaM } from "./geo.js";

const d = (a, b) => distanciaM(a, b);
export const kmRecorrido = puntos => Math.round(puntos.slice(1).reduce((s, p, i) => s + d(puntos[i], p), 0) / 100) / 10;

function vecinoMasCercano(inicio, resto){
  const out = [], pend = [...resto];
  let actual = inicio;
  while(pend.length){
    let k = 0;
    for(let i = 1; i < pend.length; i++) if(d(actual, pend[i]) < d(actual, pend[k])) k = i;
    actual = pend.splice(k, 1)[0]; out.push(actual);
  }
  return out;
}
/* 2-opt sobre las entregas (camino abierto que empieza en `inicio`). */
function dosOpt(inicio, ruta){
  const r = [...ruta];
  let mejoro = true, vueltas = 0;
  while(mejoro && vueltas++ < 50){
    mejoro = false;
    for(let i = 0; i < r.length - 1; i++) for(let j = i + 1; j < r.length; j++){
      const a = i === 0 ? inicio : r[i - 1], b = r[i], c = r[j], e = r[j + 1];
      const antes = d(a, b) + (e ? d(c, e) : 0), despues = d(a, c) + (e ? d(b, e) : 0);
      if(despues + 1 < antes){ r.splice(i, j - i + 1, ...r.slice(i, j + 1).reverse()); mejoro = true; }
    }
  }
  return r;
}

/** Devuelve las paradas en el orden sugerido y los km (línea recta) antes y después. */
export function ordenarParadas(paradas){
  const cargas = paradas.filter(p => p.tipo === "carga"), entregas = paradas.filter(p => p.tipo !== "carga");
  const antes = kmRecorrido(paradas);
  if(entregas.length < 2 || cargas.length === 0){
    const solo = entregas.length >= 2 ? [entregas[0], ...dosOpt(entregas[0], vecinoMasCercano(entregas[0], entregas.slice(1)))] : entregas;
    const orden = [...cargas, ...solo];
    return { paradas: orden, kmAntes: antes, kmDespues: kmRecorrido(orden) };
  }
  const inicio = cargas[cargas.length - 1];
  const orden = [...cargas, ...dosOpt(inicio, vecinoMasCercano(inicio, entregas))];
  const kmDespues = kmRecorrido(orden);
  /* Nunca empeora: si el orden capturado ya era mejor, se respeta. */
  return kmDespues <= antes ? { paradas: orden, kmAntes: antes, kmDespues } : { paradas, kmAntes: antes, kmDespues: antes };
}
