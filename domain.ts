/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · MOTOR DE CÁLCULO DE NEGOCIO (F5)
   Funciones puras extraídas de App.jsx para poder testearlas (vitest).
   ⚠️ Estos números son POLÍTICA DE NEGOCIO — cambiarlos altera cotizaciones.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Fecha LOCAL en YYYY-MM-DD. `new Date().toISOString()` entrega la fecha en
   UTC: en México, después de las 18:00 ya es "mañana", y un pago o una factura
   capturados en la tarde quedaban con la fecha del día siguiente. */
export function fechaLocalISO(d: Date = new Date()): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export const KM_DIA = 550;   // km recorribles por día → define días de ruta
export const COMIDA = 700;   // MXN por persona por día
export const HOTEL  = 1100;  // MXN por habitación por noche (1 por unidad)
export const ADIC   = 2000;  // parada/punto extra servicio local
export const AYUD   = 2800;  // ayudante/maniobra foránea
export const IVA_RATE = 0.16;

/* Días de ruta: ida = ceil(km/550); hotel solo si km>300; total = ida y vuelta */
export interface DiasRuta { ida: number; noches: number; total: number; }
export function diasRuta(km: number): DiasRuta {
  if(!km) return {ida:0,noches:0,total:0};
  const ida=Math.ceil(km/KM_DIA);
  return {ida,noches:km>300?ida:0,total:ida*2};
}

/* personas = cuántos van en la(s) unidad(es) (comida se multiplica).
   unidades = habitaciones de hotel (1 por unidad, sin importar 1 o 2 personas).
   diasOv/nochesOv permiten fijar días manualmente desde el cotizador. */
export interface Viaticos { xC: number; xH: number; total: number; dias: number; noches: number; }
export function calcViaticos(km: number, personas: number, comida: number = COMIDA, hotel: number = HOTEL, unidades: number = 1, diasOv: number | null = null, nochesOv: number | null = null): Viaticos {
  const auto=diasRuta(km);
  const dias=diasOv!=null?diasOv:auto.total;
  const noches=nochesOv!=null?nochesOv:auto.noches;
  const xC=comida*personas*dias;
  const xH=hotel*noches*unidades;
  return {xC,xH,total:xC+xH,dias,noches};
}

/* Flota necesaria: vans para cubrir pdv en plazo con capacidad maxDia por van */
export function calcFlota(pdv: number, maxDia: number, plazo: number): { vans: number; dias: number; capDia: number } {
  const vans=Math.max(1,Math.ceil(pdv/(maxDia*plazo)));
  const dias=Math.ceil(pdv/(maxDia*vans));
  return {vans,dias,capDia:maxDia*vans};
}

/* Subtotal → IVA → total. Redondeo a centavos para evitar drift de flotantes. */
export function calcTotales(subtotal: number | string, conIva: boolean = true): { subtotal: number; ivaAmt: number; total: number } {
  const sub=Math.round((Number(subtotal)||0)*100)/100;
  const ivaAmt=conIva?Math.round(sub*IVA_RATE*100)/100:0;
  return {subtotal:sub, ivaAmt, total:Math.round((sub+ivaAmt)*100)/100};
}

/* trackingId criptográfico para URLs públicas /track/:id */
export function genTrackingId(): string {
  const arr=new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>b.toString(36).padStart(2,"0")).join("").slice(0,10).toUpperCase();
}

/* Hash de PIN con salt por usuario (uid). Sin salt = esquema legacy. */
export async function hashPin(pin: string | number, salt: string = ""): Promise<string> {
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(salt)+":"+String(pin).trim()));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOTOR DE ESTADO DE RESULTADOS (CFO) — multi-etapa sobre los buckets
   existentes de CATS_COSTO. NO cambia la clasificación operativa: la eleva
   a estados financieros formales.

   Criterio contable aplicado (documentado, no oculto):
   - COSTOS DIRECTOS: lo que existe porque hubo viajes — Subcontrato (operadores
     RESICO), Transporte (combustible/casetas), Viáticos, Operación (mantto,
     maniobras, refacciones, llantas).
   - GASTOS OPERATIVOS: estructura — Nómina (admin+mixta; se revela en nota),
     Administración, Comunicación, Otro.
   - Fiscal → impuestos · Bancario → gastos financieros.
   - Sin depreciación registrada ⇒ EBITDA = Utilidad Operativa (se revela).
   ═══════════════════════════════════════════════════════════════════════════ */

export const PL_CLASIFICACION = {
  // En logística la nómina operativa ES el servicio (la balanza la registra en
  // 5200 "Costo del Servicio"), por eso Sueldos y Cargas Sociales son directos.
  directos:   ["Sueldos","Cargas Sociales","Subcontrato","Transporte","Viáticos","Operación"],
  operativos: ["Nómina","Administración","Comunicación","Otro"],
  impuestos:  ["Fiscal"],
  financieros:["Bancario"],
};

// Subgrupos legibles dentro de cada etapa → Estado de Resultados con subdivisiones.
export const PL_GRUPOS: Record<string, string> = {
  "Sueldos":"Personal operativo", "Cargas Sociales":"Personal operativo",
  "Subcontrato":"Subcontratación (RESICO / operadores)",
  "Transporte":"Transporte y viáticos", "Viáticos":"Transporte y viáticos",
  "Operación":"Operación y maniobras",
  "Nómina":"Administración y estructura", "Administración":"Administración y estructura",
  "Comunicación":"Administración y estructura", "Otro":"Administración y estructura",
  "Fiscal":"Impuestos y derechos", "Bancario":"Gastos financieros",
};
export function grupoDeBucket(bucket: string): string {
  return PL_GRUPOS[bucket] || "Otros";
}
// Orden de presentación de los subgrupos de costo directo
export const PL_ORDEN_DIRECTOS = [
  "Personal operativo", "Subcontratación (RESICO / operadores)",
  "Transporte y viáticos", "Operación y maniobras",
];

export type EtapaPL = "directos" | "operativos" | "impuestos" | "financieros";
export function etapaDeBucket(bucket: string): EtapaPL {
  if(PL_CLASIFICACION.directos.includes(bucket))   return "directos";
  if(PL_CLASIFICACION.impuestos.includes(bucket))  return "impuestos";
  if(PL_CLASIFICACION.financieros.includes(bucket))return "financieros";
  return "operativos";
}

// Agrupa un detalle {bucket:monto} por subgrupo → {grupo:{total,detalle}}
function agruparPorSubgrupo(detalle: Record<string, number>){
  const out: Record<string, {total:number; detalle:Record<string,number>}> = {};
  for(const [bucket,monto] of Object.entries(detalle)){
    const g=grupoDeBucket(bucket);
    if(!out[g]) out[g]={total:0, detalle:{}};
    out[g].detalle[bucket]=(out[g].detalle[bucket]||0)+monto;
    out[g].total=Math.round((out[g].total+monto)*100)/100;
  }
  return out;
}

/* rows de entrada:
   ingresos: [{subtotal}]  — facturas ya filtradas (sin Canceladas/Solicitadas)
   costos:   [{bucket, monto}] — viáticos+pagos ya clasificados por getCategoria
   Devuelve el Estado de Resultados completo con % sobre ingresos. */
export interface RowIngreso { subtotal: number | string; }
export interface RowCosto { bucket?: string; monto: number | string; }
export function buildEstadoResultados({ingresos=[], costos=[]}: {ingresos?: RowIngreso[]; costos?: RowCosto[]} = {}){
  const r2=(n: number)=>Math.round(n*100)/100;
  const ventas = r2(ingresos.reduce((a,f)=>a+(Number(f.subtotal)||0),0));

  const porEtapa: Record<EtapaPL, Record<string, number>> = {directos:{}, operativos:{}, impuestos:{}, financieros:{}};
  costos.forEach(c=>{
    const et=etapaDeBucket(c.bucket||"Otro");
    const b=c.bucket||"Otro";
    porEtapa[et][b]=r2((porEtapa[et][b]||0)+(Number(c.monto)||0));
  });
  const suma=(o: Record<string, number>)=>r2(Object.values(o).reduce((a,b)=>a+b,0));

  const costosDirectos   = suma(porEtapa.directos);
  const gastosOperativos = suma(porEtapa.operativos);
  const impuestos        = suma(porEtapa.impuestos);
  const financieros      = suma(porEtapa.financieros);

  const utilidadBruta    = r2(ventas - costosDirectos);
  const ebitda           = r2(utilidadBruta - gastosOperativos); // sin D&A registrada
  const utilidadOperativa= ebitda;
  const utilidadNeta     = r2(utilidadOperativa - impuestos - financieros);
  const pct=(n: number)=>ventas>0?r2(n/ventas*100):null;

  return {
    ventas,
    costosDirectos:   {total:costosDirectos,   detalle:porEtapa.directos,   subgrupos:agruparPorSubgrupo(porEtapa.directos),   pct:pct(costosDirectos)},
    utilidadBruta:    {total:utilidadBruta,    pct:pct(utilidadBruta)},
    gastosOperativos: {total:gastosOperativos, detalle:porEtapa.operativos, subgrupos:agruparPorSubgrupo(porEtapa.operativos), pct:pct(gastosOperativos)},
    ebitda:           {total:ebitda,           pct:pct(ebitda)},
    utilidadOperativa:{total:utilidadOperativa,pct:pct(utilidadOperativa)},
    impuestos:        {total:impuestos,        pct:pct(impuestos)},
    financieros:      {total:financieros,      pct:pct(financieros)},
    utilidadNeta:     {total:utilidadNeta,     pct:pct(utilidadNeta)},
    notas:[
      "Costo directo incluye la nómina operativa (sueldos + cargas sociales): en logística el personal ES el servicio, y la balanza 5200 la registra como costo del servicio.",
      "EBITDA = Utilidad Operativa: no hay depreciación/amortización registrada en el sistema.",
      "El pago a operadores RESICO (Jonatan, renta de camionetas) viaja en Subcontratación.",
    ],
  };
}

/* ── ANÁLISIS ESCRITO AUTOMÁTICO (voz de CFO) ──────────────────────────────
   Determinístico y accionable: cada conclusión sale de umbrales sobre datos
   reales, con montos. Benchmark margen bruto logística MX: 15–30%. */
export function generarAnalisisCFO(d: any){
  // d: {er, erPrev, periodoLabel, topClientes:[{nombre,total,pctIngresos}],
  //     carteraVencida, ventasMesProm, sinCaptura, topProveedores:[{proveedor,total,n}],
  //     topOperadores:[{nombre,ingresos,costos,margen}], mesesConDatos}
  const f=(n: number)=>"$"+Math.abs(Math.round(n)).toLocaleString("es-MX");
  const out: Array<{tipo: string; texto?: string; lista?: string[]}> = [];
  const er=d.er;
  const mb=er.utilidadBruta.pct, mn=er.utilidadNeta.pct;

  // 1. Resumen del periodo
  out.push({tipo:"resumen", texto:
    `En ${d.periodoLabel} la compañía facturó ${f(er.ventas)} (sin IVA), con utilidad bruta de ${f(er.utilidadBruta.total)} (${mb??"—"}%) y utilidad neta de ${f(er.utilidadNeta.total)} (${mn??"—"}%).`});

  // 2. Salud del margen vs banda logística
  if(mb!=null){
    if(mb<15) out.push({tipo:"riesgo", texto:
      `El margen bruto de ${mb}% está POR DEBAJO de la banda sana del sector logístico (15–30%). Cada $100 facturados dejan solo ${f(mb)} antes de estructura: revisar tarifario o costos directos (los dominantes: ${Object.entries(er.costosDirectos.detalle as Record<string, number>).sort((a: [string, number], b: [string, number])=>b[1]-a[1]).slice(0,2).map(([k,v]: [string, number])=>k+" "+f(v)).join(", ")}).`});
    else if(mb>30) out.push({tipo:"fortaleza", texto:
      `Margen bruto de ${mb}% por encima de la banda del sector (15–30%): el tarifario tiene poder de precio. Es momento de crecer volumen sin sacrificar tarifa.`});
    else out.push({tipo:"ok", texto:
      `Margen bruto de ${mb}% dentro de la banda sana del sector (15–30%).`});
  }

  // 3. Variación vs periodo anterior
  if(d.erPrev&&d.erPrev.ventas>0){
    const dv=(er.ventas-d.erPrev.ventas)/d.erPrev.ventas*100;
    const dirTxt=dv>=0?"creció":"cayó";
    out.push({tipo:Math.abs(dv)>25?"atencion":"ok", texto:
      `La facturación ${dirTxt} ${Math.abs(dv).toFixed(1)}% vs el periodo anterior (${f(d.erPrev.ventas)} → ${f(er.ventas)}).`+(dv<-25?" Una caída de esta magnitud exige explicación comercial: ¿estacionalidad, cliente perdido o servicios sin capturar?":"")});
  }

  // 4. Concentración de clientes (riesgo)
  const top=d.topClientes?.[0];
  if(top&&top.pctIngresos>=35) out.push({tipo:"riesgo", texto:
    `Concentración: ${top.nombre} representa ${top.pctIngresos.toFixed(0)}% del ingreso (${f(top.total)}). Perderlo comprometería la operación — diversificar cartera es prioridad estratégica.`});

  // 5. Cartera vencida
  if(d.carteraVencida>0&&d.ventasMesProm>0){
    const meses=d.carteraVencida/d.ventasMesProm;
    out.push({tipo:meses>1?"riesgo":"atencion", texto:
      `Cartera vencida de ${f(d.carteraVencida)} equivale a ${meses.toFixed(1)} meses de facturación promedio. `+(meses>1?"Prioridad #1 de caja: plan de cobranza esta semana.":"Mantener cobranza activa para que no escale.")});
  }

  // 6. Datos incompletos (calidad del P&L)
  if(d.sinCaptura>0) out.push({tipo:"atencion", texto:
    `${d.sinCaptura} servicios facturables siguen sin monto capturado: el ingreso real del periodo está SUBESTIMADO. Capturarlos cambia todas las métricas de este reporte.`});

  // 7. Proveedores
  const tp=d.topProveedores?.[0];
  if(tp) out.push({tipo:"ok", texto:
    `Mayor gasto en proveedores: ${tp.proveedor} con ${f(tp.total)} (${tp.n} pagos). `+(d.topProveedores[1]?`Le sigue ${d.topProveedores[1].proveedor} con ${f(d.topProveedores[1].total)}.`:"")+" Volumen concentrado = palanca de negociación de tarifas."});

  // 8. Operadores
  const ops=(d.topOperadores||[]).filter((o: any)=>o.ingresos>0);
  if(ops.length>=2){
    const mejor=ops[0], peor=[...ops].sort((a,b)=>(a.margen/a.ingresos)-(b.margen/b.ingresos))[0];
    if(mejor&&peor&&mejor.nombre!==peor.nombre) out.push({tipo:"ok", texto:
      `Productividad: ${mejor.nombre} genera el mayor ingreso atribuido (${f(mejor.ingresos)}); ${peor.nombre} tiene el margen más débil — revisar mezcla de rutas y costos asignados antes de conclusiones de desempeño.`});
  }

  // 9. Recomendaciones accionables
  const recs: string[] = [];
  if(mb!=null&&mb<15) recs.push("Repreciar los 3 servicios de menor margen o renegociar costos directos dominantes.");
  if(d.carteraVencida>0) recs.push(`Recuperar ${f(Math.min(d.carteraVencida,d.ventasMesProm))} de cartera vencida este mes (llamada + convenio de pago).`);
  if(top&&top.pctIngresos>=35) recs.push("Abrir 2 cuentas nuevas del pipeline de prospección para bajar la concentración.");
  if(d.sinCaptura>0) recs.push("Cerrar la captura de montos pendientes antes del corte mensual.");
  if(recs.length) out.push({tipo:"recomendaciones", lista:recs});

  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURACIÓN · CATÁLOGO CERRADO DE PLANES + NORMALIZACIÓN + ETAPAS
   El campo `plan` de `facturas` es texto libre con ~35 variantes para pocos
   planes reales. `PLANES` es la fuente única: número de plan → empresa que se
   factura, RFC y director que autoriza en la intranet del grupo (Somos Uno).
   `normalizarPlan` mapea cualquier variante de texto a su número.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DirectorIntranet { nombre: string; id: string; }
export interface PlanCatalogo {
  numero: string;
  nombre: string;
  empresa: string;                      // razón social a la que se factura
  rfc: string;
  clienteId: string;                    // id estable del cliente (colección `cuentas`)
  directorIntranet: DirectorIntranet | null;   // null = por confirmar
  directorGeneralIntranet?: DirectorIntranet;
  vaPorIntranet: boolean;
  alias: string[];                      // palabras clave SIN acentos, en mayúsculas
  nota?: string;
  porConfirmar?: boolean;               // plan heredado de los datos: falta validar director
  activo?: boolean;                     // false = dado de baja desde la app (no se ofrece ni se normaliza a él)
  origen?: "base" | "editado" | "nuevo"; // de dónde sale: código, código corregido en la app, o creado en la app
}

const _MAP  = { empresa:"MARKETING & PROMOTION SAPI DE CV",            rfc:"MPR930115NN0" };
const _PAL  = { empresa:"PROMOCIONES AMERICA LATINA SAPI DE CV",       rfc:"PAL030731427" };
const _GMAP = { empresa:"G-MAP OPERADORA SA DE CV",                    rfc:"GOP170407FV7" };
const _CCA  = { empresa:"COMPRAS CENTRALES Y ADMINISTRACION SA DE CV", rfc:"CCA080602TM1" };
const _ADAN:   DirectorIntranet = { nombre:"PEREZ MENDEZ ADAN",        id:"135832" };
const _MAGANA: DirectorIntranet = { nombre:"MAGAÑA NAVARRETE RICARDO", id:"149636" };

export const PLANES: PlanCatalogo[] = [
  /* ── Planes vigentes (cierre sep/oct 2026) ── */
  { numero:"10344",  nombre:"MAP SCJ Promotores Operación", ..._MAP,  clienteId:"scj",
    directorIntranet:_ADAN,   vaPorIntranet:true, alias:["SCJ"] },
  { numero:"122721", nombre:"3M CBG Pinturas",              ..._MAP,  clienteId:"3m",
    directorIntranet:_ADAN,   vaPorIntranet:true, alias:["3M","CBG","PINTURAS"] },
  { numero:"210212", nombre:"Actnow Campari Summit",        ..._PAL,  clienteId:"actnow",
    directorIntranet:_MAGANA, vaPorIntranet:true, alias:["CAMPARI SUMMIT","SUMMIT"] },
  { numero:"22845",  nombre:"Actnow Varios 2014",           ..._PAL,  clienteId:"actnow",
    directorIntranet:_MAGANA, vaPorIntranet:true, alias:["ACTNOW VARIOS","ACT NOW VARIOS","VARIOS 2014"] },
  { numero:"222829", nombre:"Hersheys",                     ..._PAL,  clienteId:"hersheys",
    directorIntranet:{ nombre:"ROJANO HIDALGO ANA", id:"73357" }, vaPorIntranet:true, alias:["HERSHEY"] },
  { numero:"202003", nombre:"Canon Promotores",             ..._GMAP, clienteId:"canon",
    directorIntranet:{ nombre:"YABER CORONADO KARINA", id:"135851" }, vaPorIntranet:true, alias:["CANON","CANNON"] },
  { numero:"204113", nombre:"Electrolit WM E RDE",          ..._GMAP, clienteId:"electrolit",
    directorIntranet:{ nombre:"JAIMES HERNANDEZ ALFREDO", id:"20240513" }, vaPorIntranet:true,
    alias:["ELECTROLIT","GMAP ELECTROLIT","LP AGENCY","LPAGENCY"],
    nota:"Lo solicita LP Agency (Cecilia Garduño); contabilidad lo llama P-204113 GMAP ELECTROLIT" },
  { numero:"619715", nombre:"Loreal Logística",             ..._CCA,  clienteId:"loreal",
    directorIntranet:{ nombre:"TALAVERA ALCANTARA ARTURO DAVID", id:"122633" },
    directorGeneralIntranet:{ nombre:"SALDAÑO CAROLINA", id:"135876" },
    vaPorIntranet:true, alias:["LOREAL","L OREAL"], nota:"Intercompañía RDE Promociones" },
  { numero:"619716", nombre:"Loreal (plan 2)",              ..._CCA,  clienteId:"loreal",
    directorIntranet:{ nombre:"TALAVERA ALCANTARA ARTURO DAVID", id:"122633" },
    directorGeneralIntranet:{ nombre:"SALDAÑO CAROLINA", id:"135876" },
    vaPorIntranet:true, alias:[], nota:"Segundo plan Loreal que contabilidad carga a CCA junto con 619715 · intercompañía RDE Promociones" },
  { numero:"142804", nombre:"Servicios de Logística", empresa:"TACRE SA DE CV", rfc:"TAC200225LC3", clienteId:"tacre",
    directorIntranet:null, vaPorIntranet:false, alias:["SERVICIOS DE LOGISTICA","MUCHA CHAMBA","TACRE"],
    nota:"No va por intranet: se cobra vía Juanita Buenabad" },
  /* ── Planes heredados (existen en facturas históricas / CLIENTE_PLANES).
        Director de intranet por confirmar con la oficina. ── */
  { numero:"122215", nombre:"Samsung CE Viáticos",  ..._MAP,  clienteId:"samsung",
    directorIntranet:null, vaPorIntranet:true, alias:["SAMSUNG CE"], porConfirmar:true },
  { numero:"122216", nombre:"Samsung IM Viáticos",  ..._MAP,  clienteId:"samsung",
    directorIntranet:null, vaPorIntranet:true, alias:["SAMSUNG IM"], porConfirmar:true },
  { numero:"142805", nombre:"Rentas Logística",     ..._PAL,  clienteId:"actnow",
    directorIntranet:null, vaPorIntranet:true, alias:["RENTAS LOGISTICA","RENTA DE CAMIONETAS"], porConfirmar:true,
    nota:"Renta de camionetas (contabilidad 2026)" },
  { numero:"210201", nombre:"Campari Promotores",   ..._PAL,  clienteId:"actnow",
    directorIntranet:null, vaPorIntranet:true, alias:["CAMPARI PROMOTORES"], porConfirmar:true },
  { numero:"12801",  nombre:"MAP Varios 2011",      ..._MAP,  clienteId:"map_varios",
    directorIntranet:null, vaPorIntranet:true, alias:["MAP VARIOS","VARIOS 2011"], porConfirmar:true },
  { numero:"212802", nombre:"POD Robots", empresa:"PROMOTOR ON DEMAND SA DE CV", rfc:"POD180501C87", clienteId:"robots",
    directorIntranet:null, vaPorIntranet:true, alias:["POD ROBOTS","ROBOTS","PROMOTOR ON DEMAND"], porConfirmar:true },
  { numero:"212801", nombre:"Varios",               ..._CCA,  clienteId:"cca",
    directorIntranet:null, vaPorIntranet:true, alias:[], porConfirmar:true },
  { numero:"203801", nombre:"Activaciones Wyder",   ..._GMAP, clienteId:"wyder",
    directorIntranet:null, vaPorIntranet:true, alias:["WYDER"], porConfirmar:true },
  { numero:"210402", nombre:"Mustella Promotores",  ..._GMAP, clienteId:"mustella",
    directorIntranet:null, vaPorIntranet:true, alias:["MUSTELLA","MUSTELA"], porConfirmar:true },
];

/* ── Catálogo ACTIVO ─────────────────────────────────────────────────────────
   PLANES es la semilla del código. La app puede completarla o corregirla desde
   la colección `planes` de Firestore (alta de planes nuevos, directores, bajas)
   sin tocar código: setCatalogoPlanes(fusionarCatalogoPlanes(PLANES, docs)).
   Todas las funciones de este bloque leen el catálogo activo. */
let _catalogoActivo: PlanCatalogo[] = PLANES;
export function catalogoPlanes(): PlanCatalogo[] { return _catalogoActivo; }
export function setCatalogoPlanes(lista: PlanCatalogo[] | null | undefined): void {
  _catalogoActivo = lista && lista.length ? lista : PLANES;
}
const _dir = (x: unknown): DirectorIntranet | null => {
  if(!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const nombre = String(o.nombre ?? "").trim(), id = String(o.id ?? "").trim();
  return nombre || id ? { nombre, id } : null;
};
/* Doc de la colección `planes` (id = número) → PlanCatalogo. null si no trae número. */
export function planDesdeDoc(d: Record<string, any> | null | undefined): PlanCatalogo | null {
  const numero = String(d?.numero ?? d?.id ?? "").trim();
  if(!numero) return null;
  const alias = (Array.isArray(d!.alias) ? d!.alias : String(d!.alias ?? "").split(","))
    .map((a: unknown) => _planTxt(a)).filter((a: string) => a.length > 0);
  const dg = _dir(d!.directorGeneralIntranet);
  return {
    numero, nombre: String(d!.nombre ?? "").trim(), empresa: String(d!.empresa ?? "").trim().toUpperCase(),
    rfc: String(d!.rfc ?? "").trim().toUpperCase(), clienteId: String(d!.clienteId ?? "").trim(),
    directorIntranet: _dir(d!.directorIntranet), ...(dg ? { directorGeneralIntranet: dg } : {}),
    vaPorIntranet: d!.vaPorIntranet !== false, alias,
    ...(d!.nota ? { nota: String(d!.nota) } : {}), porConfirmar: d!.porConfirmar === true, activo: d!.activo !== false,
  };
}
/* Semilla + docs de Firestore. Un doc con el mismo número corrige la semilla
   (solo con lo que trae capturado; los alias se suman); un número nuevo se
   agrega; activo:false lo saca del catálogo. */
export function fusionarCatalogoPlanes(base: PlanCatalogo[], docs: Record<string, any>[] | null | undefined): PlanCatalogo[] {
  const out: PlanCatalogo[] = base.map(p => ({ ...p, alias: [...p.alias], origen: "base" as const }));
  for(const d of docs || []){
    const p = planDesdeDoc(d);
    if(!p) continue;
    const i = out.findIndex(x => x.numero === p.numero);
    if(i >= 0){
      const b = out[i];
      out[i] = { ...b,
        nombre: p.nombre || b.nombre, empresa: p.empresa || b.empresa, rfc: p.rfc || b.rfc, clienteId: p.clienteId || b.clienteId,
        directorIntranet: p.directorIntranet ?? b.directorIntranet,
        ...(p.directorGeneralIntranet ? { directorGeneralIntranet: p.directorGeneralIntranet } : {}),
        vaPorIntranet: d.vaPorIntranet === undefined ? b.vaPorIntranet : p.vaPorIntranet,
        alias: [...new Set([...b.alias, ...p.alias])], nota: p.nota ?? b.nota,
        porConfirmar: d.porConfirmar === undefined ? b.porConfirmar : p.porConfirmar,
        activo: p.activo, origen: "editado" };
    } else {
      out.push({ ...p, origen: "nuevo" });
    }
  }
  return out.filter(p => p.activo !== false);
}

/* 142804 es el plan PROPIO de DMOV dentro del grupo: aparece en todas las
   solicitudes y en registros viejos antecede al nombre del plan del cliente
   ("142804 SCJ Promotores"). Por eso su número, solo, no decide el plan. */
export const PLAN_PROPIO_DMOV = "142804";

export function planPorNumero(numero: unknown): PlanCatalogo | null {
  const n = String(numero ?? "").trim();
  return n ? (catalogoPlanes().find(p => p.numero === n) || null) : null;
}
/* Etiqueta canónica que se guarda en `plan` y se muestra en la UI */
export function etiquetaPlan(p: PlanCatalogo): string {
  return p.numero + " → " + p.nombre;
}

const _planTxt = (s: unknown): string =>
  String(s ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ").trim();

/* Texto libre → número de plan del catálogo, o null si no se puede decidir.
   1) Un número de plan del catálogo en el texto manda (salvo 142804, ver arriba).
   2) Si no, palabras clave del nombre — solo si apuntan a UN plan.
   3) "142804" + texto que no reconoce ⇒ null (no adivinar: revisar a mano). */
export function normalizarPlan(texto: unknown): string | null {
  const t = _planTxt(texto);
  if(!t) return null;
  const nums: string[] = t.match(/\d+/g) || [];
  const cat = catalogoPlanes();
  const delCatalogo = nums.filter(n => cat.some(p => p.numero === n));
  const directo = delCatalogo.find(n => n !== PLAN_PROPIO_DMOV);
  if(directo) return directo;

  const hay = " " + t + " ";
  const porAlias = cat.filter(p => p.alias.some(a => hay.includes(" " + a)));
  if(porAlias.length === 1) return porAlias[0].numero;
  if(porAlias.length > 1) return null;                 // ambiguo

  if(delCatalogo.includes(PLAN_PROPIO_DMOV)){
    // Solo el número (con prefijos tipo "P-" / "PLAN") ⇒ es el plan de TACRE
    const resto = t.split(" ").filter(w => w !== PLAN_PROPIO_DMOV && !["P","PL","PLAN"].includes(w));
    return resto.length === 0 ? PLAN_PROPIO_DMOV : null;
  }
  return null;
}

type FacturaLike = Record<string, any>;

/* ¿El texto nombra a este alias de cliente? Solo por PALABRAS COMPLETAS:
   "G-MAP Operadora" no es "MAP", "Abbott" no es "BOT", "SC" no es "SCJ".
   `prefijo` (captura interactiva): acepta además lo que el usuario va
   escribiendo si son 3+ letras y el alias empieza así ("can" → CANON). */
const _aliasTxt = (s: unknown): string =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b([a-z])-(?=[a-z])/g, "$1")          // "g-map" es una sola palabra ("gmap"), no "g" + "map"
    .replace(/[^a-z0-9]+/g, " ").trim();
export function coincideAlias(texto: unknown, alias: unknown, opts: { prefijo?: boolean } = {}): boolean {
  const q = _aliasTxt(texto), a = _aliasTxt(alias);
  if(!q || !a) return false;
  if(q === a || (" " + q + " ").includes(" " + a + " ")) return true;
  return !!opts.prefijo && q.length >= 3 && a.startsWith(q);
}

/* ¿Misma razón social? Tolera "AND"/"&", guiones y el sufijo societario
   ("MARKETING AND PROMOTION" ≡ "MARKETING & PROMOTION SAPI DE CV"). */
const _empTxt = (s: unknown): string => _planTxt(s).replace(/\bAND\b/g, " ").replace(/\s+/g, "");
export function mismaEmpresa(a: unknown, b: unknown): boolean {
  const x = _empTxt(a), y = _empTxt(b);
  return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x));
}

/* Plan efectivo de una factura: el texto manda (plan, luego planOverride).
   Si el texto no se puede leer, un planNumero ya guardado solo cuenta cuando es
   de la MISMA empresa que la factura: el backfill histórico (F1) dejó números
   adivinados que a veces son de otra razón social. */
export function planDeFactura(f: FacturaLike | null | undefined): string | null {
  if(!f) return null;
  const porTexto = normalizarPlan(f.plan) || normalizarPlan(f.planOverride);
  if(porTexto) return porTexto;
  const guardado = planPorNumero(f.planNumero);
  return guardado && mismaEmpresa(f.empresa || f.cliente, guardado.empresa) ? guardado.numero : null;
}

/* Plan de la acción "Normalizar planes": qué facturas cambiarían de planNumero.
   NO toca `plan` (texto original). Las que no se pueden leer quedan en
   sinResolver y conservan el planNumero que tengan. */
export interface CambioPlan {
  id: string; folio: string; empresa: string; plan: string;
  de: string; a: string;                    // planNumero actual → normalizado
  clienteDe: string; clienteA: string;      // clienteId actual → corregido
  cambiaPlan: boolean; cambiaCliente: boolean;
}
/* clienteId que le corresponde a una factura:
   - plan legible y de la MISMA empresa que la factura → el cliente de ese plan;
   - clienteId guardado que pertenece a OTRA razón social (backfill histórico:
     "142804 SCJ…" quedó como tacre, "Standard" de G-MAP como map_varios) → se
     vacía, para que la venta se agrupe por su empresa y no bajo un cliente ajeno;
   - en cualquier otro caso se deja como está. */
export function clienteIdCorrecto(f: FacturaLike, planNum: string | null): string {
  const actual = String(f.clienteId ?? "").trim();
  const empresa = f.empresa || f.cliente || "";
  if(!empresa) return actual;
  const plan = planPorNumero(planNum);
  if(plan && mismaEmpresa(empresa, plan.empresa)) return plan.clienteId;
  const empresasDelCliente = catalogoPlanes().filter(p => p.clienteId === actual).map(p => p.empresa);
  if(actual && empresasDelCliente.length && !empresasDelCliente.some(e => mismaEmpresa(empresa, e))) return "";
  return actual;
}
export function planearNormalizacionPlanes(facturas: FacturaLike[]): { cambios: CambioPlan[]; sinResolver: CambioPlan[]; yaNormalizadas: number; sinPlan: number } {
  const cambios: CambioPlan[] = [], sinResolver: CambioPlan[] = [];
  let yaNormalizadas = 0, sinPlan = 0;
  for(const f of facturas || []){
    // Cliente externo sin plan de intranet, confirmado a mano: no hay nada que normalizar
    if(f.sinPlan === true){ sinPlan++; continue; }
    const a = normalizarPlan(f.plan) || normalizarPlan(f.planOverride);
    const de = String(f.planNumero ?? "").trim();
    const clienteDe = String(f.clienteId ?? "").trim(), clienteA = clienteIdCorrecto(f, a);
    const cambiaPlan = !!a && a !== de, cambiaCliente = clienteA !== clienteDe;
    const row: CambioPlan = { id:f.id, folio:f.folio||"", empresa:f.empresa||f.cliente||"", plan:f.plan||f.planOverride||"",
      de, a:a||"", clienteDe, clienteA, cambiaPlan, cambiaCliente };
    if(!a) sinResolver.push(row);
    if(cambiaPlan || cambiaCliente) cambios.push(row);
    else if(a) yaNormalizadas++;
  }
  return { cambios, sinResolver, yaNormalizadas, sinPlan };
}

/* ── Semáforo de etapa de una factura ────────────────────────────────────────
   Solicitada (a Katia) → Emitida (hay CFDI, aún no en intranet) → En intranet
   (subestado Director / Tesorería según intranetEstatus) → Pagada.
   Cancelada y Vencida salen del status. */
export type EtapaFactura = "Solicitada" | "Emitida" | "En intranet" | "Pagada" | "Vencida" | "Cancelada";
export const ETAPAS_FACTURA: EtapaFactura[] = ["Solicitada","Emitida","En intranet","Pagada","Vencida","Cancelada"];
export interface EtapaInfo { etapa: EtapaFactura; subestado: "" | "Director" | "Tesorería"; detalle: string; }

export function etapaFactura(f: FacturaLike | null | undefined): EtapaInfo {
  const st = String(f?.status ?? "").trim();
  const tiene = (v: unknown) => String(v ?? "").trim() !== "";
  const detalle = String(f?.intranetEstatus ?? "").trim();
  const base = { subestado:"" as EtapaInfo["subestado"], detalle };
  if(st === "Pagada")    return { etapa:"Pagada",    ...base };
  if(st === "Cancelada") return { etapa:"Cancelada", ...base };
  if(st === "Vencida")   return { etapa:"Vencida",   ...base };
  if(tiene(f?.intranetFolio)){
    const e = _planTxt(detalle);
    const subestado = e.includes("TESORER") ? "Tesorería" : e.includes("DIRECTOR") ? "Director" : "";
    return { etapa:"En intranet", subestado, detalle };
  }
  if((st === "Solicitada a Katia" || st === "Solicitud interna" || f?.tipoDocumento === "solicitud_interna") && !tiene(f?.cfdiFolio)) return { etapa:"Solicitada", ...base };
  return { etapa:"Emitida", ...base };
}

/* ── Liga factura ↔ cotización / presupuesto ─────────────────────────────── */
const _folioEq = (a: unknown, b: unknown): boolean => {
  const x = String(a ?? "").trim().toUpperCase(), y = String(b ?? "").trim().toUpperCase();
  return x !== "" && x === y;
};
/* Facturas ligadas a una cotización o presupuesto (por id o por folio).
   Incluye la liga histórica presupuesto→factura (presupuestoOrigenId /
   convertidoAFacturaId). */
export function facturasLigadas(ref: FacturaLike | null | undefined, facturas: FacturaLike[]): FacturaLike[] {
  if(!ref) return [];
  return (facturas || []).filter(f =>
    (ref.id && (f.cotizacionId === ref.id || f.presupuestoOrigenId === ref.id)) ||
    _folioEq(f.cotizacionFolio, ref.folio) || _folioEq(f.presupuestoOrigenFolio, ref.folio) ||
    (ref.convertidoAFacturaId && f.id === ref.convertidoAFacturaId));
}

export interface ResultadoCotizacion { tipo: "cotizacion" | "presupuesto"; id: string; folio: string; cliente: string; total: number; fecha: string; }
/* Buscador del selector: folio o cliente, sin acentos ni mayúsculas. */
export function buscarCotizaciones(q: unknown, cotizaciones: FacturaLike[] = [], presupuestos: FacturaLike[] = [], max: number = 8): ResultadoCotizacion[] {
  const needle = _planTxt(q);
  if(!needle) return [];
  const fecha = (d: FacturaLike): string => {
    if(d.fecha) return String(d.fecha);
    const s = d.createdAt?.seconds;
    return s ? new Date(s * 1000).toISOString().slice(0, 10) : "";
  };
  const fila = (tipo: ResultadoCotizacion["tipo"]) => (d: FacturaLike): ResultadoCotizacion =>
    ({ tipo, id:d.id, folio:d.folio||"", cliente:d.cliente||"", total:Number(d.total)||0, fecha:fecha(d) });
  return [...(cotizaciones || []).map(fila("cotizacion")), ...(presupuestos || []).map(fila("presupuesto"))]
    .filter(r => _planTxt(r.folio).includes(needle) || _planTxt(r.cliente).includes(needle))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, max);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CIERRE CONTABLE (solo lectura) — colección `cierresContables`, un doc por
   mes de cierre (id YYYY-MM). Aquí solo se LEE y se da forma para pantalla:
   ningún número se inventa; lo que no viene en el doc se muestra como "—".
   Los porcentajes se calculan desde los importes (no dependen de si el doc
   guardó 0.62 o 62).
   ═══════════════════════════════════════════════════════════════════════════ */

const _MESES_CORTOS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const _num = (v: unknown): number | null => {
  if(v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const _esAcumulado = (k: string): boolean => /^(ytd|total|acum|acumulado)$/i.test(k.trim());

/* "ene_jun" → [0,5] · "Jul-Ago" → [6,7] · "sep" → [8,8] · "ytd" → null */
const _MESES_LARGOS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export function rangoPeriodo(key: unknown): [number, number] | null {
  // Solo "sep" o "septiembre": una palabra que empieza igual ("marketing") no es un mes.
  const idx = String(key ?? "").toLowerCase().split(/[^a-záéíóú]+/)
    .map(p => p.length === 3 ? _MESES_CORTOS.indexOf(p) : _MESES_LARGOS.indexOf(p)).filter(i => i >= 0);
  return idx.length ? [idx[0], idx[idx.length - 1]] : null;
}
/* "ene_jun" → "Ene–Jun" · "sep" → "Sep" · "ytd" → "Acumulado" */
export function etiquetaPeriodo(key: unknown): string {
  const k = String(key ?? "");
  if(_esAcumulado(k)) return "Acumulado";
  const r = rangoPeriodo(k);
  if(!r) return k;
  const cap = (i: number) => _MESES_CORTOS[i][0].toUpperCase() + _MESES_CORTOS[i].slice(1);
  return r[0] === r[1] ? cap(r[0]) : cap(r[0]) + "–" + cap(r[1]);
}
/* Columnas de periodo presentes en un mapa {fila:{periodo:monto}}, en orden
   de calendario y con el acumulado al final. */
export function columnasPeriodo(mapa: Record<string, any> | null | undefined): string[] {
  const keys: string[] = [];
  for(const fila of Object.values(mapa || {})){
    if(fila && typeof fila === "object") for(const k of Object.keys(fila)) if(!keys.includes(k)) keys.push(k);
  }
  const orden = (k: string) => _esAcumulado(k) ? 1000 : (rangoPeriodo(k)?.[0] ?? 500);
  return keys.map((k, i) => ({ k, i })).sort((a, b) => orden(a.k) - orden(b.k) || a.i - b.i).map(x => x.k);
}

export interface FilaCierre { nombre: string; valores: Record<string, number | null>; ytd: number | null; pctIngresos: number | null; }
/* Filas {nombre:{periodo:monto}} → tabla ordenada por acumulado, con % sobre `base`. */
export function filasPorPeriodo(mapa: Record<string, any> | null | undefined, base: number | null = null): { columnas: string[]; filas: FilaCierre[]; totales: Record<string, number> } {
  const columnas = columnasPeriodo(mapa);
  const colYtd = columnas.find(_esAcumulado);
  const filas: FilaCierre[] = Object.entries(mapa || {}).filter(([, v]) => v && typeof v === "object").map(([nombre, v]) => {
    const valores: Record<string, number | null> = {};
    columnas.forEach(c => { valores[c] = _num(v[c]); });
    const ytd = colYtd ? valores[colYtd] : null;
    return { nombre, valores, ytd, pctIngresos: ytd !== null && base ? ytd / base * 100 : null };
  }).sort((a, b) => Math.abs(b.ytd ?? 0) - Math.abs(a.ytd ?? 0));
  const totales: Record<string, number> = {};
  columnas.forEach(c => { totales[c] = Math.round(filas.reduce((a, f) => a + (f.valores[c] ?? 0), 0) * 100) / 100; });
  return { columnas, filas, totales };
}

/* Ingresos del doc ({Ene..Jun,"Jul-Ago",Sep}) acomodados en las columnas de la
   tabla de costos (ene_jun, jul_ago, sep, ytd). Una columna solo se llena si
   los periodos de ingreso la cubren COMPLETA; si no, queda null ("—"). */
export function ingresosPorColumna(ingresosPorPeriodo: Record<string, any> | null | undefined, columnas: string[], ingresosTotal: unknown = null): Record<string, number | null> {
  const partes = Object.entries(ingresosPorPeriodo || {})
    .map(([k, v]) => ({ r: rangoPeriodo(k), v: _num(v) }))
    .filter((p): p is { r: [number, number]; v: number } => p.r !== null && p.v !== null);
  const out: Record<string, number | null> = {};
  for(const c of columnas){
    if(_esAcumulado(c)){ out[c] = _num(ingresosTotal) ?? (partes.length ? partes.reduce((a, p) => a + p.v, 0) : null); continue; }
    const r = rangoPeriodo(c);
    if(!r){ out[c] = null; continue; }
    const dentro = partes.filter(p => p.r[0] >= r[0] && p.r[1] <= r[1]);
    const cubiertos = new Set<number>();
    dentro.forEach(p => { for(let i = p.r[0]; i <= p.r[1]; i++) cubiertos.add(i); });
    out[c] = cubiertos.size === r[1] - r[0] + 1 ? Math.round(dentro.reduce((a, p) => a + p.v, 0) * 100) / 100 : null;
  }
  return out;
}

/* Porcentaje guardado en el doc: acepta fracción (0.62) o porcentaje (62). */
export function pctGuardado(v: unknown): number | null {
  const n = _num(v);
  if(n === null) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n;
}

export interface KpisCierre {
  ingresos: number | null; costosYGastos: number | null; utilidadNeta: number | null;
  puntoEquilibrioMensual: number | null; ingresoPromedioMensual: number | null; costoPromedioMensual: number | null;
  brechaEquilibrio: number | null;          // ingreso promedio − punto de equilibrio (negativo = por debajo)
  deudaCreski: number | null; capitalContable: number | null; activoTotal: number | null; pasivoTotal: number | null;
  costoLaboral: number | null; costoLaboralPct: number | null; cargaSocialPct: number | null; margenContribucionPct: number | null;
}
export function kpisCierre(c: Record<string, any> | null | undefined): KpisCierre {
  const r = c?.resultados || {}, n = c?.nomina || {}, b = c?.balance || {};
  const ingresos = _num(r.ingresos);
  const pe = _num(r.puntoEquilibrioMensual), prom = _num(r.ingresoPromedioMensual);
  const costoLaboral = _num(n.costoLaboral) ?? ((_num(n.percepciones) !== null && _num(n.cargaSocial) !== null) ? (_num(n.percepciones) as number) + (_num(n.cargaSocial) as number) : null);
  const perc = _num(n.percepciones), carga = _num(n.cargaSocial), cv = _num(r.costosVariables);
  const creski = _num(b.creski);
  return {
    ingresos, costosYGastos: _num(r.costosYGastos), utilidadNeta: _num(r.utilidadNeta),
    puntoEquilibrioMensual: pe, ingresoPromedioMensual: prom, costoPromedioMensual: _num(r.costoPromedioMensual),
    brechaEquilibrio: pe !== null && prom !== null ? prom - pe : null,
    deudaCreski: creski !== null ? Math.abs(creski) : null,
    capitalContable: _num(c?.capitalContable), activoTotal: _num(c?.activoTotal), pasivoTotal: _num(c?.pasivoTotal),
    costoLaboral,
    costoLaboralPct: costoLaboral !== null && ingresos ? costoLaboral / ingresos * 100 : pctGuardado(n.costoLaboralPctIngresos),
    cargaSocialPct: carga !== null && perc ? carga / perc * 100 : pctGuardado(n.cargaPctPercepciones),
    margenContribucionPct: cv !== null && ingresos ? (ingresos - cv) / ingresos * 100 : pctGuardado(r.margenContribucionPct),
  };
}

/* Viáticos marcados `estimado: true` (p.ej. Jul y Ago del cierre de sep-2026:
   el acumulado jul+ago se repartió 50/50 porque falta la balanza mensual). */
export function resumenEstimados(viaticos: Record<string, any>[] | null | undefined): { n: number; monto: number; meses: string[]; porMes: Record<string, { n: number; monto: number }> } {
  const porMes: Record<string, { n: number; monto: number }> = {};
  let n = 0, monto = 0;
  for(const v of viaticos || []){
    if(v?.estimado !== true) continue;
    const m = String(v.mes || "—"), x = Number(v.monto) || 0;
    if(!porMes[m]) porMes[m] = { n: 0, monto: 0 };
    porMes[m].n++; porMes[m].monto += x; n++; monto += x;
  }
  const idx = (m: string) => { const i = _MESES_CORTOS.indexOf(m.toLowerCase().slice(0, 3)); return i < 0 ? 99 : i; };
  return { n, monto, meses: Object.keys(porMes).sort((a, b) => idx(a) - idx(b)), porMes };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONCILIACIÓN CIERRE CONTABLE vs SISTEMA (solo lectura)
   Contabilidad = doc de `cierresContables` (balanza). Sistema = `facturas` y
   `pagos`. Compara ingresos (sin IVA) por periodo y por cliente, y cuentas por
   cobrar (con IVA) por cliente al corte. No corrige nada: solo señala dónde
   las dos fuentes no dicen lo mismo.
   Criterios (los mismos del P&L del sistema): no cuentan facturas Canceladas
   ni las apenas "Solicitada a Katia" (aún no existen en contabilidad).
   ═══════════════════════════════════════════════════════════════════════════ */

/* "2026-09" → {anio:2026, mes:8, corte:"2026-09-30"} (mes 0-11) */
export function periodoDeCierre(id: unknown): { anio: number; mes: number; corte: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(id ?? "").trim());
  if(!m) return null;
  const anio = Number(m[1]), mes = Number(m[2]) - 1;
  if(mes < 0 || mes > 11) return null;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return { anio, mes, corte: m[1] + "-" + m[2] + "-" + String(ultimo).padStart(2, "0") };
}

/* Nombres comerciales que se facturan a una razón social del grupo. El orden
   importa: "G MAP" se revisa antes que "MAP". */
const _EMPRESA_ALIAS: [string, string[]][] = [
  [_GMAP.empresa, ["GMAP","G MAP","CANON","CANNON","ELECTROLIT","WYDER","MUSTELLA"]],
  [_PAL.empresa,  ["ACTNOW","ACT NOW","CAMPARI","APEROL","PROMOLATINA","HERSHEY","HERSHEYS"]],
  [_MAP.empresa,  ["MAP","SCJ","3M","SOFIA TRUEBA"]],
  ["TACRE SA DE CV", ["TACRE","JBL"]],
  [_CCA.empresa,  ["CCA","COMPRAS CENTRALES","LOREAL","L OREAL"]],
  ["PROMOTOR ON DEMAND SA DE CV", ["POD","ROBOTS","BOTMATE"]],
];
/* Cliente tal como lo escribe la balanza o una factura → razón social a la que
   se factura. Así "SCJ", "MARKETING AND PROMOTION" y "MARKETING & PROMOTION
   SAPI DE CV" se comparan como un solo cliente. Lo que no se reconoce se
   devuelve limpio (mayúsculas, sin espacios dobles) y se compara por nombre. */
export function empresaCanonica(nombre: unknown): string {
  const crudo = String(nombre ?? "").trim();
  if(!crudo) return "";
  const empresas = [...new Set(catalogoPlanes().map(p => p.empresa))];
  const directa = empresas.find(e => mismaEmpresa(crudo, e));
  if(directa) return directa;
  const hay = " " + _planTxt(crudo) + " ";
  for(const [empresa, alias] of _EMPRESA_ALIAS){
    if(alias.some(a => hay.includes(" " + a + " "))) return empresa;
  }
  return crudo.toUpperCase().replace(/\s+/g, " ");
}

export type BaseConciliacion = "operacion" | "emision";
const _cuentaComoIngreso = (f: FacturaLike): boolean =>
  f.status !== "Cancelada" && f.status !== "Solicitada a Katia" && f.status !== "Solicitud interna" && f.tipoDocumento !== "solicitud_interna";
const _mesIdx = (m: unknown): number => _MESES_CORTOS.indexOf(String(m ?? "").toLowerCase().slice(0, 3));
/* Año y mes (0-11) en que una factura cuenta: mes de operación (como el P&L
   del sistema) o fecha de emisión del CFDI (como la contabilidad). */
export function periodoDeFactura(f: FacturaLike, base: BaseConciliacion = "operacion"): { anio: number; mes: number; porEmision: boolean } | null {
  if(base === "emision"){
    const m = /^(\d{4})-(\d{2})/.exec(String(f.fechaEmision ?? ""));
    if(m) return { anio: Number(m[1]), mes: Number(m[2]) - 1, porEmision: true };
  }
  const mes = _mesIdx(f.mesOp || f.mes), anio = Number(f.anio);
  return mes >= 0 && Number.isFinite(anio) && anio > 0 ? { anio, mes, porEmision: false } : null;
}

export type EstadoConciliacion = "ok" | "diferencia" | "solo_contable" | "solo_sistema";
const _r2 = (n: number): number => Math.round(n * 100) / 100;
const _estado = (contable: number | null, sistema: number, n: number, tol: number): EstadoConciliacion =>
  contable === null ? "solo_sistema"
  : (n === 0 && Math.abs(contable) > tol) ? "solo_contable"
  : Math.abs(sistema - contable) <= tol ? "ok" : "diferencia";

export interface FilaConciliacion {
  empresa: string;
  nombres: string[];                          // cómo aparece el cliente en la balanza
  contable: number | null;                    // null = no aparece en la balanza
  sistema: number;
  diferencia: number;                         // sistema − contabilidad
  estado: EstadoConciliacion;
  porColumna: { columna: string; contable: number | null; sistema: number; diferencia: number }[];
  facturas: FacturaLike[];
}
export interface ConciliacionIngresos {
  periodo: { anio: number; mes: number; corte: string } | null;
  base: BaseConciliacion;
  tolerancia: number;
  porPeriodo: { periodo: string; contable: number | null; sistema: number; diferencia: number; estado: EstadoConciliacion; n: number }[];
  filas: FilaConciliacion[];
  total: { contable: number | null; sistema: number; diferencia: number; estado: EstadoConciliacion; n: number };
  sinFechaEmision: number;                    // base "emision": facturas que cayeron por mes de operación
  sinPeriodo: number;                         // facturas sin mes/año utilizable (no se pudieron ubicar)
}

export function conciliarIngresos(cierre: FacturaLike | null | undefined, facturas: FacturaLike[] | null | undefined,
  opts: { base?: BaseConciliacion; tolerancia?: number } = {}): ConciliacionIngresos {
  const base = opts.base || "operacion", tol = opts.tolerancia ?? 1;
  const per = periodoDeCierre(cierre?.id);
  const r = cierre?.resultados || {};
  let sinFechaEmision = 0, sinPeriodo = 0;
  // Facturas del año del cierre hasta el mes del cierre
  const delAnio: { f: FacturaLike; mes: number }[] = [];
  for(const f of facturas || []){
    if(!_cuentaComoIngreso(f)) continue;
    const p = periodoDeFactura(f, base);
    if(!p){ sinPeriodo++; continue; }
    if(!per || p.anio !== per.anio || p.mes > per.mes) continue;
    if(base === "emision" && !p.porEmision) sinFechaEmision++;
    delAnio.push({ f, mes: p.mes });
  }
  const sub = (f: FacturaLike) => Number(f.subtotal) || 0;
  const sumaRango = (rows: { f: FacturaLike; mes: number }[], rg: [number, number] | null) =>
    _r2(rows.filter(x => !rg || (x.mes >= rg[0] && x.mes <= rg[1])).reduce((a, x) => a + sub(x.f), 0));

  // 1) Por periodo (claves de resultados.ingresosPorPeriodo)
  const porPeriodo = Object.entries(r.ingresosPorPeriodo || {})
    .map(([periodo, v]) => ({ periodo, rg: rangoPeriodo(periodo), contable: _num(v) }))
    .filter(x => x.rg !== null).sort((a, b) => (a.rg as [number, number])[0] - (b.rg as [number, number])[0])
    .map(x => {
      const rows = delAnio.filter(y => y.mes >= (x.rg as [number, number])[0] && y.mes <= (x.rg as [number, number])[1]);
      const sistema = sumaRango(rows, null);
      return { periodo: x.periodo, contable: x.contable, sistema, diferencia: _r2(sistema - (x.contable ?? 0)), estado: _estado(x.contable, sistema, rows.length, tol), n: rows.length };
    });

  // 2) Por cliente (razón social), acumulado y por columna de periodo
  const columnas = columnasPeriodo(cierre?.clientes);
  const grupos: Record<string, { nombres: string[]; contable: Record<string, number | null> | null; rows: { f: FacturaLike; mes: number }[] }> = {};
  const g = (k: string) => grupos[k] || (grupos[k] = { nombres: [], contable: null, rows: [] });
  for(const [nombre, v] of Object.entries(cierre?.clientes || {})){
    if(!v || typeof v !== "object") continue;
    const grupo = g(empresaCanonica(nombre));
    grupo.nombres.push(nombre);
    if(!grupo.contable) grupo.contable = {};
    for(const c of columnas){
      const n = _num((v as Record<string, unknown>)[c]);
      if(n !== null) grupo.contable[c] = _r2((grupo.contable[c] ?? 0) + n);
      else if(!(c in grupo.contable)) grupo.contable[c] = null;
    }
  }
  for(const x of delAnio) g(empresaCanonica(x.f.empresa || x.f.cliente || "Sin empresa")).rows.push(x);
  const colYtd = columnas.find(_esAcumulado);
  const filas: FilaConciliacion[] = Object.entries(grupos).map(([empresa, gr]) => {
    const sistema = sumaRango(gr.rows, null);
    const contable = gr.contable
      ? (colYtd ? gr.contable[colYtd] ?? null : _r2(columnas.reduce((a, c) => a + (gr.contable?.[c] ?? 0), 0)))
      : null;
    const porColumna = columnas.filter(c => !_esAcumulado(c)).map(c => {
      const s = sumaRango(gr.rows, rangoPeriodo(c)), cont = gr.contable ? gr.contable[c] ?? null : null;
      return { columna: c, contable: cont, sistema: s, diferencia: _r2(s - (cont ?? 0)) };
    });
    return { empresa, nombres: gr.nombres, contable, sistema, diferencia: _r2(sistema - (contable ?? 0)),
      estado: _estado(contable, sistema, gr.rows.length, tol), porColumna, facturas: gr.rows.map(x => x.f) };
  }).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

  const sisTotal = sumaRango(delAnio, null), contTotal = _num(r.ingresos);
  return { periodo: per, base, tolerancia: tol, porPeriodo, filas,
    total: { contable: contTotal, sistema: sisTotal, diferencia: _r2(sisTotal - (contTotal ?? 0)), estado: _estado(contTotal, sisTotal, delAnio.length, tol), n: delAnio.length },
    sinFechaEmision, sinPeriodo };
}

export interface ConciliacionCxC {
  corte: string | null;
  tolerancia: number;
  filas: FilaConciliacion[];                  // facturas[i] lleva _saldoCorte y _pagadoCorte
  total: { contable: number | null; sistema: number; diferencia: number; estado: EstadoConciliacion; n: number };
  pagadasSinFecha: { n: number; monto: number };   // "Pagada" sin fecha ni abonos: no se sabe si se cobró antes del corte
}
/* Saldo por cobrar de cada factura AL CORTE: total con IVA − abonos con fecha
   ≤ corte. Una factura hoy "Pagada" pero cobrada después del corte sí era
   cuenta por cobrar ese día. */
export function conciliarCxC(cierre: FacturaLike | null | undefined, facturas: FacturaLike[] | null | undefined,
  pagos: FacturaLike[] | null | undefined, opts: { tolerancia?: number } = {}): ConciliacionCxC {
  const tol = opts.tolerancia ?? 1;
  const per = periodoDeCierre(cierre?.id);
  const corte = per?.corte || null;
  const abonos: Record<string, { fecha: string; monto: number }[]> = {};
  for(const p of pagos || []){
    if(!p?.facturaId) continue;
    (abonos[p.facturaId] || (abonos[p.facturaId] = [])).push({ fecha: String(p.fecha || ""), monto: Number(p.monto) || 0 });
  }
  const pagadasSinFecha = { n: 0, monto: 0 };
  const grupos: Record<string, { nombres: string[]; contable: number | null; fs: FacturaLike[] }> = {};
  const g = (k: string) => grupos[k] || (grupos[k] = { nombres: [], contable: null, fs: [] });
  for(const [nombre, v] of Object.entries(cierre?.cuentasPorCobrar || {})){
    const n = _num(v);
    if(n === null) continue;
    const grupo = g(empresaCanonica(nombre));
    grupo.nombres.push(nombre);
    grupo.contable = _r2((grupo.contable ?? 0) + n);
  }
  if(per && corte){
    for(const f of facturas || []){
      if(!_cuentaComoIngreso(f)) continue;
      // ¿Ya existía al corte? Por fecha de emisión si la hay; si no, por mes de operación.
      const emi = /^\d{4}-\d{2}-\d{2}/.test(String(f.fechaEmision ?? "")) ? String(f.fechaEmision).slice(0, 10) : "";
      const p = periodoDeFactura(f, "operacion");
      const existia = emi ? emi <= corte : (p ? (p.anio < per.anio || (p.anio === per.anio && p.mes <= per.mes)) : false);
      if(!existia) continue;
      const total = Number(f.total) || 0;
      const lista = abonos[f.id] || [];
      const pagadoCorte = _r2(lista.filter(a => a.fecha && a.fecha <= corte).reduce((a, x) => a + x.monto, 0));
      let saldo: number;
      if(f.status === "Pagada" && lista.length === 0){
        const fp = String(f.fechaPago ?? "").slice(0, 10);
        if(fp) saldo = fp <= corte ? 0 : total;
        else { saldo = 0; pagadasSinFecha.n++; pagadasSinFecha.monto = _r2(pagadasSinFecha.monto + total); }
      } else {
        saldo = Math.max(0, _r2(total - pagadoCorte));
      }
      if(saldo <= 0.5) continue;                      // tolerancia de centavos, igual que el registro de pagos
      g(empresaCanonica(f.empresa || f.cliente || "Sin empresa")).fs.push({ ...f, _saldoCorte: saldo, _pagadoCorte: pagadoCorte });
    }
  }
  const filas: FilaConciliacion[] = Object.entries(grupos).map(([empresa, gr]) => {
    const sistema = _r2(gr.fs.reduce((a, f) => a + f._saldoCorte, 0));
    return { empresa, nombres: gr.nombres, contable: gr.contable, sistema, diferencia: _r2(sistema - (gr.contable ?? 0)),
      estado: _estado(gr.contable, sistema, gr.fs.length, tol), porColumna: [], facturas: gr.fs };
  }).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
  const hayContable = filas.some(f => f.contable !== null);
  const contTotal = hayContable ? _r2(filas.reduce((a, f) => a + (f.contable ?? 0), 0)) : null;
  const sisTotal = _r2(filas.reduce((a, f) => a + f.sistema, 0));
  const n = filas.reduce((a, f) => a + f.facturas.length, 0);
  return { corte, tolerancia: tol, filas,
    total: { contable: contTotal, sistema: sisTotal, diferencia: _r2(sisTotal - (contTotal ?? 0)), estado: _estado(contTotal, sisTotal, n, tol), n },
    pagadasSinFecha };
}
