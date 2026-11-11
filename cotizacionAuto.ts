/* ═══════════════════════════════════════════════════════════════════════════
   COTIZACIÓN AUTOMÁTICA · de la carga a la unidad y al precio, explicando cada paso.
   Piensa como coordinador de logística:
     1. Cubicaje: peso y volumen totales.
     2. Entarimado: cuántas cajas caben por tarima y cuántas tarimas salen.
     3. Estiba: si las tarimas se pueden apilar dentro de la unidad.
     4. Maniobra: si hace falta ayudante o equipo, y por qué.
     5. Unidad: la más chica que alcanza por peso, volumen y posiciones de piso.
     6. Precio: tarifario + entregas adicionales + resguardo + ganancia.
   Reglas: nada se inventa. Lo que falta sale como PENDIENTE y lo que se supone sale
   en `supuestos`, con el parámetro usado. Los precios salen SOLO del tarifario.
   Lógica pura; probada en cotizacionAuto.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */
import { precioConGanancia, buscarTarifa, redondearDecenasArriba, IVA_PCT } from "./tarifario.ts";
import type { Tarifa, UnidadTarifa } from "./tarifario.ts";

/* Parámetros de operación. Son criterios, no datos del cliente: se muestran en `supuestos` y se pueden ajustar. */
export const PARAMETROS = {
  tarimaLargoM: 1.2, tarimaAnchoM: 1.0, tarimaBaseAltoM: 0.15,   // tarima estándar 1.0 × 1.2 m
  alturaTarimaCargadaM: 1.5,     // altura total habitual de una tarima armada (base + producto)
  pesoMaxTarimaKg: 1000,         // carga habitual por tarima
  factorLlenado: 0.85,           // carga suelta no aprovecha el 100 % del volumen de la caja
  pesoManualMaxKg: 25,           // una persona no carga piezas más pesadas (NOM-036-1-STPS-2018)
  bultosPorHoraPersona: 200,     // ritmo de carga manual de una persona
  minutosManualSinAyudante: 30,  // si la maniobra manual de un punto pasa de esto, conviene ayudante
  holguraEstibaM: 0.10,          // espacio libre mínimo sobre la estiba dentro de la unidad
};
export type Parametros = typeof PARAMETROS;

export interface TipoUnidad {
  clave: string; nombre: string; tarifa: UnidadTarifa | null;      // null = el tarifario no tiene precio para este tipo
  capacidadKg: number; capacidadM3: number; tarimasPiso: number; altoInteriorM: number;
  puertaAltoM?: number;          // alto libre de la puerta por donde entra la tarima, si se conoce
  cajasSueltasMax?: number;      // regla de la casa: tope práctico de cajas a granel
  enFlota: number;               // cuántas hay normalmente en la flota propia (0 = solo con proveedor)
  fuente: string; confirmada: boolean;
}
export interface CargaSolicitada {
  cajas?: number | string; cajaLargoCm?: number | string; cajaAnchoCm?: number | string; cajaAltoCm?: number | string; cajaPesoKg?: number | string;
  tarimas?: number | string; tarimaAltoM?: number | string; tarimaPesoKg?: number | string;
  pesoKg?: number | string; volumenM3?: number | string;
  entarimada?: boolean;          // true: viaja en tarimas · false: a granel · undefined: no se sabe
  apilable?: boolean;            // ¿se puede poner una tarima sobre otra?
  maxNivelesCaja?: number | string;   // estiba máxima impresa en la caja
  fragil?: boolean; voluminosa?: boolean;      // muebles, exhibidores armados, piezas grandes
}
export interface PuntoOperacion { tieneAnden?: boolean; tieneMontacargas?: boolean; pisoAlto?: boolean; }
export interface SolicitudCotizacion {
  carga: CargaSolicitada;
  tipoRuta: "local" | "nacional"; destino?: string;
  entregas?: number;             // número de puntos de entrega
  diasResguardo?: number; gananciaPct?: number | string;
  origen?: PuntoOperacion; destinoOp?: PuntoOperacion;
}

const n = (v: unknown): number => { const x = Number(String(v ?? "").replace(/[,\s]/g, "")); return Number.isFinite(x) && x > 0 ? x : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10, r2 = (x: number) => Math.round(x * 100) / 100;
const f = (x: number) => x.toLocaleString("es-MX", { maximumFractionDigits: 2 });

export interface Cubicaje {
  pesoKg: number | null; volumenM3: number | null;
  cajasPorCama: number | null; camas: number | null; cajasPorTarima: number | null;
  tarimas: number | null; tarimasCalculadas: boolean; altoTarimaM: number | null; pesoPorTarimaKg: number | null;
  pasos: string[]; supuestos: string[]; pendientes: string[];
}

/** Pasos 1 y 2: peso, volumen y tarimas. Si vienen tarimas, se respetan; si vienen cajas con medidas, se entariman. */
export function cubicar(c: CargaSolicitada, P: Parametros = PARAMETROS): Cubicaje {
  const pasos: string[] = [], supuestos: string[] = [], pendientes: string[] = [];
  const cajas = n(c.cajas), L = n(c.cajaLargoCm) / 100, A = n(c.cajaAnchoCm) / 100, H = n(c.cajaAltoCm) / 100, pc = n(c.cajaPesoKg);
  let peso = n(c.pesoKg) || null, vol = n(c.volumenM3) || null;
  let cajasPorCama: number | null = null, camas: number | null = null, cajasPorTarima: number | null = null;
  let tarimas = n(c.tarimas) || null, tarimasCalculadas = false, alto = n(c.tarimaAltoM) || null, pesoTarima = n(c.tarimaPesoKg) || null;

  if(cajas && pc && !peso){ peso = r1(cajas * pc); pasos.push(`Peso: ${f(cajas)} cajas × ${f(pc)} kg = ${f(peso)} kg.`); }
  if(cajas && L && A && H && !vol){ vol = r2(cajas * L * A * H); pasos.push(`Volumen: ${f(cajas)} cajas de ${f(L * 100)} × ${f(A * 100)} × ${f(H * 100)} cm = ${f(vol)} m³.`); }
  if(tarimas){
    pasos.push(`La solicitud trae ${f(tarimas)} tarima(s).`);
    if(pesoTarima && !peso){ peso = r1(tarimas * pesoTarima); pasos.push(`Peso: ${f(tarimas)} tarimas × ${f(pesoTarima)} kg = ${f(peso)} kg.`); }
    if(!alto){ alto = P.alturaTarimaCargadaM; supuestos.push(`Altura de cada tarima: ${f(alto)} m (no viene en la solicitud).`); }
  } else if(cajas && L && A && H && c.entarimada !== false){
    const cuantas = (lado: number, caja: number) => Math.floor(lado / caja + 1e-9);          // 1.2 / 0.4 no debe dar 2.9999
    const porCama = Math.max(cuantas(P.tarimaLargoM, L) * cuantas(P.tarimaAnchoM, A), cuantas(P.tarimaLargoM, A) * cuantas(P.tarimaAnchoM, L));
    if(porCama < 1){ pendientes.push("La caja no cabe en una tarima estándar: viaja a granel o en tarima especial"); }
    else {
      const altoUtil = P.alturaTarimaCargadaM - P.tarimaBaseAltoM;
      let niveles = Math.max(1, Math.floor(altoUtil / H + 1e-9));
      const tope = n(c.maxNivelesCaja);
      if(tope && tope < niveles){ niveles = tope; pasos.push(`La caja admite ${f(tope)} niveles de estiba.`); }
      let porTarima = porCama * niveles;
      if(pc && porTarima * pc > P.pesoMaxTarimaKg){ porTarima = Math.max(1, Math.floor(P.pesoMaxTarimaKg / pc)); pasos.push(`Por peso, cada tarima lleva ${f(porTarima)} cajas (tope de ${f(P.pesoMaxTarimaKg)} kg).`); }
      cajasPorCama = porCama; camas = Math.ceil(porTarima / porCama); cajasPorTarima = porTarima;
      tarimas = Math.ceil(cajas / porTarima); tarimasCalculadas = true;
      alto = r2(P.tarimaBaseAltoM + Math.min(camas, niveles) * H);
      pesoTarima = pc ? r1(porTarima * pc) : null;
      pasos.push(`Entarimado: ${f(porCama)} cajas por cama × ${f(camas)} camas = ${f(porTarima)} cajas por tarima → ${f(tarimas)} tarima(s) de ${f(alto)} m de alto.`);
      supuestos.push(`Tarima estándar de ${f(P.tarimaAnchoM)} × ${f(P.tarimaLargoM)} m, armada hasta ${f(P.alturaTarimaCargadaM)} m y ${f(P.pesoMaxTarimaKg)} kg; acomodo en rejilla.`);
      if(c.entarimada === undefined) pendientes.push("¿La mercancía viaja en tarimas o a granel? Se calculó en tarimas");
    }
  }
  if(!peso) pendientes.push("Peso total o peso por caja");
  if(!vol && !tarimas) pendientes.push("Medidas de la caja, volumen o número de tarimas");
  return { pesoKg: peso, volumenM3: vol, cajasPorCama, camas, cajasPorTarima, tarimas, tarimasCalculadas, altoTarimaM: alto, pesoPorTarimaKg: pesoTarima, pasos, supuestos, pendientes };
}

export interface Estiba { niveles: number; posicionesPiso: number | null; motivo: string; }
/** Paso 3: ¿se pueden apilar las tarimas dentro de ESTA unidad? Devuelve cuántas posiciones de piso ocupan. */
export function estibar(cub: Cubicaje, c: CargaSolicitada, tipo: Pick<TipoUnidad, "altoInteriorM">, P: Parametros = PARAMETROS): Estiba {
  if(!cub.tarimas) return { niveles: 1, posicionesPiso: null, motivo: "Carga a granel: no ocupa posiciones de tarima." };
  const una = { niveles: 1, posicionesPiso: cub.tarimas };
  if(c.apilable === undefined) return { ...una, motivo: "No se sabe si la mercancía se puede apilar: se cotiza a un nivel." };
  if(c.apilable === false) return { ...una, motivo: "La mercancía no se apila: una tarima por posición." };
  if(c.fragil) return { ...una, motivo: "Mercancía frágil: no se apila aunque el cliente lo permita." };
  const alto = cub.altoTarimaM ?? P.alturaTarimaCargadaM;
  if(!(tipo.altoInteriorM > 0)) return { ...una, motivo: "No está capturada la altura interior de la unidad: se cotiza a un nivel." };
  const niveles = Math.max(1, Math.floor((tipo.altoInteriorM - P.holguraEstibaM) / alto + 1e-9));
  if(niveles < 2) return { ...una, motivo: `Dos tarimas de ${f(alto)} m no caben en ${f(tipo.altoInteriorM)} m de alto interior.` };
  const usar = Math.min(niveles, 2);                                 // en reparto no se apila a más de dos niveles
  return { niveles: usar, posicionesPiso: Math.ceil(cub.tarimas / usar), motivo: `Se apilan a ${usar} niveles: ${f(cub.tarimas)} tarimas ocupan ${f(Math.ceil(cub.tarimas / usar))} posiciones de piso.` };
}

export interface Maniobra { requerida: boolean | null; ayudantes: number; motivos: string[]; pendientes: string[]; }
/** Paso 4: ¿hace falta ayudante o equipo? Cada motivo se explica; lo que no se sabe se pregunta. */
export function evaluarManiobra(s: SolicitudCotizacion, cub: Cubicaje, P: Parametros = PARAMETROS): Maniobra {
  const c = s.carga, motivos: string[] = [], pendientes: string[] = [];
  let ayudantes = 0;
  const pc = n(c.cajaPesoKg), cajas = n(c.cajas), entregas = Math.max(1, n(s.entregas) || 1);
  if(pc > P.pesoManualMaxKg){ motivos.push(`Cada pieza pesa ${f(pc)} kg: pasa de ${f(P.pesoManualMaxKg)} kg, que es el tope para cargar una persona sola.`); ayudantes = Math.max(ayudantes, 1); }
  if(c.voluminosa){ motivos.push("Piezas voluminosas (muebles o exhibidores): se mueven entre dos personas."); ayudantes = Math.max(ayudantes, 1); }
  const enTarimas = !!cub.tarimas && c.entarimada !== false;
  if(enTarimas){
    for(const [nombre, p] of [["origen", s.origen], ["destino", s.destinoOp]] as const){
      if(!p || (p.tieneAnden === undefined && p.tieneMontacargas === undefined)){ pendientes.push(`¿Hay andén o montacargas en el ${nombre}?`); continue; }
      if(!p.tieneAnden && !p.tieneMontacargas){ motivos.push(`En el ${nombre} no hay andén ni montacargas: las tarimas se desarman y se mueven a mano.`); ayudantes = Math.max(ayudantes, 1); }
    }
  } else if(cajas){
    const porPunto = Math.ceil(cajas / entregas), minutos = Math.round(porPunto / P.bultosPorHoraPersona * 60);
    if(minutos > P.minutosManualSinAyudante){ motivos.push(`Carga a granel: ${f(porPunto)} bultos por punto son unos ${minutos} minutos para una sola persona.`); ayudantes = Math.max(ayudantes, 1); }
  }
  if(s.destinoOp?.pisoAlto || s.origen?.pisoAlto){ motivos.push("Entrega o recolección en piso alto."); ayudantes = Math.max(ayudantes, 1); }
  if(ayudantes > 0 && (cub.pesoKg ?? 0) > 1500 && !enTarimas) ayudantes = 2;
  const requerida = motivos.length > 0 ? true : pendientes.length > 0 ? null : false;
  if(requerida === false) motivos.push(enTarimas ? "Tarimas completas con andén o montacargas en ambos extremos: no requiere maniobra manual." : "Carga ligera que una persona maneja en poco tiempo: no requiere ayudante.");
  return { requerida, ayudantes, motivos, pendientes };
}

export interface UnidadElegida { tipo: TipoUnidad; cantidad: number; estiba: Estiba; usoPct: { peso: number | null; volumen: number | null; piso: number | null }; conProveedor: boolean; }
/** Alto libre para meter una tarima armada: lo que mida menos entre el interior y la puerta. */
export const altoLibre = (t: Pick<TipoUnidad, "altoInteriorM" | "puertaAltoM">): number => Math.min(t.altoInteriorM > 0 ? t.altoInteriorM : Infinity, t.puertaAltoM && t.puertaAltoM > 0 ? t.puertaAltoM : Infinity);
const tarimaMuyAlta = (t: TipoUnidad, cub: Cubicaje): boolean => !!cub.tarimas && !!cub.altoTarimaM && cub.altoTarimaM > altoLibre(t) + 1e-9;
const cabe = (t: TipoUnidad, cub: Cubicaje, e: Estiba, c: CargaSolicitada, P: Parametros, unidades = 1): boolean => {
  if(tarimaMuyAlta(t, cub)) return false;                    // una tarima armada que no pasa por la puerta no se sube entera
  if(cub.pesoKg && cub.pesoKg > t.capacidadKg * unidades) return false;
  if(e.posicionesPiso !== null){ if(e.posicionesPiso > t.tarimasPiso * unidades) return false; }
  else {
    if(cub.volumenM3 && cub.volumenM3 > t.capacidadM3 * P.factorLlenado * unidades) return false;
    if(t.cajasSueltasMax && n(c.cajas) > t.cajasSueltasMax * unidades) return false;
  }
  return true;
};
/** Paso 5: la unidad más chica que alcanza. Primero flota propia; si no alcanza, varias; si no, proveedor. */
export function elegirUnidad(cub: Cubicaje, c: CargaSolicitada, tipos: TipoUnidad[], P: Parametros = PARAMETROS): { eleccion: UnidadElegida | null; alternativa: UnidadElegida | null; motivo: string } {
  if(!cub.pesoKg && !cub.volumenM3 && !cub.tarimas) return { eleccion: null, alternativa: null, motivo: "Sin peso, volumen ni tarimas no se puede elegir unidad." };
  const orden = [...tipos].sort((a, b) => a.capacidadM3 - b.capacidadM3 || a.capacidadKg - b.capacidadKg);
  const armar = (t: TipoUnidad, cantidad: number): UnidadElegida => { const e = estibar(cub, c, t, P); return { tipo: t, cantidad, estiba: e, conProveedor: t.enFlota < cantidad,
    usoPct: { peso: cub.pesoKg ? Math.round(cub.pesoKg / (t.capacidadKg * cantidad) * 100) : null,
      volumen: cub.volumenM3 ? Math.round(cub.volumenM3 / (t.capacidadM3 * cantidad) * 100) : null,
      piso: e.posicionesPiso !== null ? Math.round(e.posicionesPiso / (t.tarimasPiso * cantidad) * 100) : null } }; };
  const solas = orden.filter(t => cabe(t, cub, estibar(cub, c, t, P), c, P));
  const altas = orden.filter(t => tarimaMuyAlta(t, cub)).map(t => t.nombre);
  const notaAltura = altas.length ? ` La tarima de ${f(cub.altoTarimaM ?? 0)} m no entra armada en: ${altas.join(", ")}.` : "";
  const propia = solas.find(t => t.enFlota > 0);
  if(propia){ const sig = solas.find(t => t !== propia && t.enFlota > 0) ?? null;
    return { eleccion: armar(propia, 1), alternativa: sig ? armar(sig, 1) : null, motivo: `${propia.nombre} es la unidad propia más chica en la que cabe todo.${notaAltura}` }; }
  /* No cabe en una unidad propia: varias propias del mismo tipo, de la más grande a la más chica */
  for(const t of [...orden].reverse().filter(x => x.enFlota > 1)){
    for(let k = 2; k <= t.enFlota; k++) if(cabe(t, cub, estibar(cub, c, t, P), c, P, k))
      return { eleccion: armar(t, k), alternativa: solas[0] ? armar(solas[0], 1) : null, motivo: `No cabe en una sola unidad propia: se necesitan ${k} ${t.nombre}.${notaAltura}` };
  }
  if(solas[0]) return { eleccion: armar(solas[0], 1), alternativa: null, motivo: `Cabe en ${solas[0].nombre}, que no es de la flota propia: va con proveedor.${notaAltura}` };
  return { eleccion: null, alternativa: null, motivo: "No cabe en ningún tipo de unidad del catálogo: hay que dividir el servicio o cotizar tráiler con proveedor." };
}

export interface ConceptoPrecio { concepto: string; monto: number; detalle: string; }
export interface CotizacionAuto {
  cubicaje: Cubicaje; maniobra: Maniobra; unidad: UnidadElegida | null; alternativa: UnidadElegida | null; motivoUnidad: string;
  conceptos: ConceptoPrecio[]; subtotalBase: number | null; gananciaPct: number; precio: number | null; iva: number | null; total: number | null;
  supuestos: string[]; pendientes: string[]; lista: boolean;
}

/** Paso 6 y resultado completo. `lista` solo es true si no quedó nada pendiente y hay precio. */
export function cotizar(s: SolicitudCotizacion, tipos: TipoUnidad[], tarifas: Tarifa[], P: Parametros = PARAMETROS): CotizacionAuto {
  const cub = cubicar(s.carga, P), man = evaluarManiobra(s, cub, P);
  const { eleccion, alternativa, motivo } = elegirUnidad(cub, s.carga, tipos, P);
  const supuestos = [...cub.supuestos], pendientes = [...cub.pendientes, ...man.pendientes], conceptos: ConceptoPrecio[] = [];
  const g = n(s.gananciaPct);
  if(cub.volumenM3 && !cub.tarimas) supuestos.push(`Carga a granel: se usa el ${Math.round(P.factorLlenado * 100)} % del volumen de la unidad.`);
  if(eleccion && !eleccion.tipo.confirmada) supuestos.push(`Capacidad de ${eleccion.tipo.nombre} tomada de referencia (${eleccion.tipo.fuente}); falta confirmarla con la unidad real.`);
  let subtotal: number | null = null;
  if(eleccion){
    const u = eleccion.tipo.tarifa, k = eleccion.cantidad, entregas = Math.max(1, n(s.entregas) || 1);
    if(!u) pendientes.push(`El tarifario no tiene precio para ${eleccion.tipo.nombre}: cotizar con proveedor`);
    const agrega = (t: Tarifa | null, nombre: string, veces: number, detalle: string) => {
      if(!u) return;
      const p = t ? precioConGanancia(t, u, 0) : null;
      if(!p){ pendientes.push(`No hay tarifa de "${nombre}" para ${eleccion.tipo.nombre}`); return; }
      conceptos.push({ concepto: nombre, monto: r2(p.base * veces), detalle });
    };
    if(s.tipoRuta === "local"){
      const conAyudante = man.requerida === true;
      agrega(buscarTarifa(tarifas, "local", conAyudante ? "Viaje local con 1 ayudante y/o maniobra" : "Viaje local"), conAyudante ? "Viaje local con ayudante o maniobra" : "Viaje local", k, `${k} unidad(es)`);
      if(man.ayudantes > 1) pendientes.push("El tarifario solo tiene precio para 1 ayudante; el segundo se cotiza aparte");
      if(entregas > 1){ const ad = buscarTarifa(tarifas, "local", "Entrega adicional en ruta local"); const v = n(ad?.valorUnico);
        if(v) conceptos.push({ concepto: "Entregas adicionales en ruta", monto: r2(v * (entregas - 1)), detalle: `${entregas - 1} × $${f(v)}` }); else pendientes.push('No hay tarifa de "Entrega adicional en ruta local"'); }
    } else {
      if(!String(s.destino ?? "").trim()) pendientes.push("Destino");
      else agrega(buscarTarifa(tarifas, "nacional", s.destino as string), `Viaje a ${s.destino}`, k, `${k} unidad(es), precio base`);
      if(man.requerida === true) pendientes.push("El tarifario nacional no tiene precio de ayudante o maniobra: cotizarlo aparte");
      if(entregas > 1) pendientes.push("El tarifario nacional no tiene precio de entregas adicionales: cotizarlas aparte");
    }
    const dias = n(s.diasResguardo);
    if(dias && u){ const t = buscarTarifa(tarifas, "local", "Resguardo de materiales x 1 dia"); const p = t ? precioConGanancia(t, u, 0) : null;
      if(p) conceptos.push({ concepto: "Resguardo", monto: r2(p.base * dias * k), detalle: `${dias} día(s) × ${k} unidad(es) × $${f(p.base)}` }); else pendientes.push("No hay tarifa de resguardo para esa unidad"); }
    if(eleccion.conProveedor) pendientes.push(`${eleccion.tipo.nombre} no está en la flota propia en esa cantidad: confirmar costo y disponibilidad con proveedor`);
    if(conceptos.length > 0) subtotal = r2(conceptos.reduce((a, x) => a + x.monto, 0));
  }
  const precio = subtotal !== null ? redondearDecenasArriba(subtotal * (1 + g / 100)) : null;
  const iva = precio !== null ? r2(precio * IVA_PCT / 100) : null;
  const unicos = [...new Set(pendientes)];
  return { cubicaje: cub, maniobra: man, unidad: eleccion, alternativa, motivoUnidad: motivo, conceptos, subtotalBase: subtotal, gananciaPct: g,
    precio, iva, total: precio !== null && iva !== null ? r2(precio + iva) : null, supuestos, pendientes: unicos, lista: precio !== null && unicos.length === 0 };
}
