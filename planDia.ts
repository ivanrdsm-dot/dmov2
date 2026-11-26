/* PLAN DEL DÍA · al empezar su día, operaciones deja registrado qué hace CADA chofer hoy:
   o tiene su ruta asignada, o se anota por qué no sale (espera pedido, taller, descanso, bodega, otro).
   Mientras falte alguno, no entra al sistema. Lógica pura; probada en planDia.test.ts. */

export const MOTIVOS = [
  { k: "espera_pedido", t: "Espera pedido", sub: "se asigna más tarde (te aviso en 2 h)" },
  { k: "taller", t: "Taller", sub: "mantenimiento de la camioneta" },
  { k: "descanso", t: "Descanso o permiso", sub: "" },
  { k: "bodega", t: "Apoyo en bodega u oficina", sub: "" },
  { k: "otro", t: "Otro", sub: "escribe el motivo" },
] as const;
export const ESPERA_PEDIDO_MIN = 120;      // igual que en el servidor (functions/lib/vigilancia.js)

export type EstadoPlan = "con_ruta" | "justificado" | "vencido" | "pendiente";
export interface FilaPlan { id: string; nombre: string; estado: EstadoPlan; rutas: string[]; motivo: string; nota: string; porNombre: string; }

export function planDelDia({ choferes = [], servicios = [], sinRuta = [], dia, ahoraMs }:
  { choferes: any[]; servicios: any[]; sinRuta: any[]; dia: string; ahoraMs: number }){
  const vivos = choferes.filter(c => !c.baja && c.activo !== false && c.status !== "Inactivo" && !c.prueba);
  const rutasDe = (id: string) => servicios.filter(s => s.estado !== "Cancelada" && !s.historico && (s.fechaServicio === dia || s.estado === "En ruta")
    && (s.choferId === id || s.segundoChoferId === id)).map(s => String(s.folio || s.id)).filter((f, i, xs) => xs.indexOf(f) === i);   // la de hoy que ya va en ruta llega dos veces
  const filas: FilaPlan[] = vivos.map(c => {
    const rutas = rutasDe(c.id), j = sinRuta.find(x => x.choferId === c.id && x.fecha === dia);
    const vencido = !!j && j.motivo === "espera_pedido" && ahoraMs - Number(j.enMs || 0) >= ESPERA_PEDIDO_MIN * 60000;
    const estado: EstadoPlan = rutas.length ? "con_ruta" : !j ? "pendiente" : vencido ? "vencido" : "justificado";
    return { id: c.id, nombre: String(c.nombre || c.id), estado, rutas, motivo: j ? String(j.motivoTexto || j.motivo || "") : "", nota: j ? String(j.nota || "") : "", porNombre: j ? String(j.porNombre || "") : "" };
  });
  const orden: Record<EstadoPlan, number> = { pendiente: 0, vencido: 1, justificado: 2, con_ruta: 3 };
  filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre));
  const faltan = filas.filter(f => f.estado === "pendiente" || f.estado === "vencido").length;
  return { filas, faltan, completo: faltan === 0, conRuta: filas.filter(f => f.estado === "con_ruta").length, sinSalir: filas.filter(f => f.estado === "justificado").length };
}
