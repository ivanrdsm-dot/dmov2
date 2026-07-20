/* ═══════════════════════════════════════════════════════════════════════════
   DMOV · MOTOR DE CÁLCULO DE NEGOCIO (F5)
   Funciones puras extraídas de App.jsx para poder testearlas (vitest).
   ⚠️ Estos números son POLÍTICA DE NEGOCIO — cambiarlos altera cotizaciones.
   ═══════════════════════════════════════════════════════════════════════════ */

export const KM_DIA = 550;   // km recorribles por día → define días de ruta
export const COMIDA = 700;   // MXN por persona por día
export const HOTEL  = 1100;  // MXN por habitación por noche (1 por unidad)
export const ADIC   = 2000;  // parada/punto extra servicio local
export const AYUD   = 2800;  // ayudante/maniobra foránea
export const IVA_RATE = 0.16;

/* Días de ruta: ida = ceil(km/550); hotel solo si km>300; total = ida y vuelta */
export function diasRuta(km){
  if(!km) return {ida:0,noches:0,total:0};
  const ida=Math.ceil(km/KM_DIA);
  return {ida,noches:km>300?ida:0,total:ida*2};
}

/* personas = cuántos van en la(s) unidad(es) (comida se multiplica).
   unidades = habitaciones de hotel (1 por unidad, sin importar 1 o 2 personas).
   diasOv/nochesOv permiten fijar días manualmente desde el cotizador. */
export function calcViaticos(km,personas,comida=COMIDA,hotel=HOTEL,unidades=1,diasOv=null,nochesOv=null){
  const auto=diasRuta(km);
  const dias=diasOv!=null?diasOv:auto.total;
  const noches=nochesOv!=null?nochesOv:auto.noches;
  const xC=comida*personas*dias;
  const xH=hotel*noches*unidades;
  return {xC,xH,total:xC+xH,dias,noches};
}

/* Flota necesaria: vans para cubrir pdv en plazo con capacidad maxDia por van */
export function calcFlota(pdv,maxDia,plazo){
  const vans=Math.max(1,Math.ceil(pdv/(maxDia*plazo)));
  const dias=Math.ceil(pdv/(maxDia*vans));
  return {vans,dias,capDia:maxDia*vans};
}

/* Subtotal → IVA → total. Redondeo a centavos para evitar drift de flotantes. */
export function calcTotales(subtotal, conIva=true){
  const sub=Math.round((Number(subtotal)||0)*100)/100;
  const ivaAmt=conIva?Math.round(sub*IVA_RATE*100)/100:0;
  return {subtotal:sub, ivaAmt, total:Math.round((sub+ivaAmt)*100)/100};
}

/* trackingId criptográfico para URLs públicas /track/:id */
export function genTrackingId(){
  const arr=new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>b.toString(36).padStart(2,"0")).join("").slice(0,10).toUpperCase();
}

/* Hash de PIN con salt por usuario (uid). Sin salt = esquema legacy. */
export async function hashPin(pin, salt=""){
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
  directos:   ["Subcontrato","Transporte","Viáticos","Operación"],
  operativos: ["Nómina","Administración","Comunicación","Otro"],
  impuestos:  ["Fiscal"],
  financieros:["Bancario"],
};

export function etapaDeBucket(bucket){
  if(PL_CLASIFICACION.directos.includes(bucket))   return "directos";
  if(PL_CLASIFICACION.impuestos.includes(bucket))  return "impuestos";
  if(PL_CLASIFICACION.financieros.includes(bucket))return "financieros";
  return "operativos";
}

/* rows de entrada:
   ingresos: [{subtotal}]  — facturas ya filtradas (sin Canceladas/Solicitadas)
   costos:   [{bucket, monto}] — viáticos+pagos ya clasificados por getCategoria
   Devuelve el Estado de Resultados completo con % sobre ingresos. */
export function buildEstadoResultados({ingresos=[], costos=[]}={}){
  const r2=(n)=>Math.round(n*100)/100;
  const ventas = r2(ingresos.reduce((a,f)=>a+(Number(f.subtotal)||0),0));

  const porEtapa = {directos:{}, operativos:{}, impuestos:{}, financieros:{}};
  costos.forEach(c=>{
    const et=etapaDeBucket(c.bucket||"Otro");
    const b=c.bucket||"Otro";
    porEtapa[et][b]=r2((porEtapa[et][b]||0)+(Number(c.monto)||0));
  });
  const suma=(o)=>r2(Object.values(o).reduce((a,b)=>a+b,0));

  const costosDirectos   = suma(porEtapa.directos);
  const gastosOperativos = suma(porEtapa.operativos);
  const impuestos        = suma(porEtapa.impuestos);
  const financieros      = suma(porEtapa.financieros);

  const utilidadBruta    = r2(ventas - costosDirectos);
  const ebitda           = r2(utilidadBruta - gastosOperativos); // sin D&A registrada
  const utilidadOperativa= ebitda;
  const utilidadNeta     = r2(utilidadOperativa - impuestos - financieros);
  const pct=(n)=>ventas>0?r2(n/ventas*100):null;

  return {
    ventas,
    costosDirectos:   {total:costosDirectos,   detalle:porEtapa.directos,   pct:pct(costosDirectos)},
    utilidadBruta:    {total:utilidadBruta,    pct:pct(utilidadBruta)},
    gastosOperativos: {total:gastosOperativos, detalle:porEtapa.operativos, pct:pct(gastosOperativos)},
    ebitda:           {total:ebitda,           pct:pct(ebitda)},
    utilidadOperativa:{total:utilidadOperativa,pct:pct(utilidadOperativa)},
    impuestos:        {total:impuestos,        pct:pct(impuestos)},
    financieros:      {total:financieros,      pct:pct(financieros)},
    utilidadNeta:     {total:utilidadNeta,     pct:pct(utilidadNeta)},
    notas:[
      "EBITDA = Utilidad Operativa: no hay depreciación/amortización registrada en el sistema.",
      "Nómina se clasifica como gasto operativo (mezcla admin/operación en balanza); el pago a operadores RESICO viaja en Subcontrato (costo directo).",
    ],
  };
}

/* ── ANÁLISIS ESCRITO AUTOMÁTICO (voz de CFO) ──────────────────────────────
   Determinístico y accionable: cada conclusión sale de umbrales sobre datos
   reales, con montos. Benchmark margen bruto logística MX: 15–30%. */
export function generarAnalisisCFO(d){
  // d: {er, erPrev, periodoLabel, topClientes:[{nombre,total,pctIngresos}],
  //     carteraVencida, ventasMesProm, sinCaptura, topProveedores:[{proveedor,total,n}],
  //     topOperadores:[{nombre,ingresos,costos,margen}], mesesConDatos}
  const f=(n)=>"$"+Math.abs(Math.round(n)).toLocaleString("es-MX");
  const out=[];
  const er=d.er;
  const mb=er.utilidadBruta.pct, mn=er.utilidadNeta.pct;

  // 1. Resumen del periodo
  out.push({tipo:"resumen", texto:
    `En ${d.periodoLabel} la compañía facturó ${f(er.ventas)} (sin IVA), con utilidad bruta de ${f(er.utilidadBruta.total)} (${mb??"—"}%) y utilidad neta de ${f(er.utilidadNeta.total)} (${mn??"—"}%).`});

  // 2. Salud del margen vs banda logística
  if(mb!=null){
    if(mb<15) out.push({tipo:"riesgo", texto:
      `El margen bruto de ${mb}% está POR DEBAJO de la banda sana del sector logístico (15–30%). Cada $100 facturados dejan solo ${f(mb)} antes de estructura: revisar tarifario o costos directos (los dominantes: ${Object.entries(er.costosDirectos.detalle).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>k+" "+f(v)).join(", ")}).`});
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
  const ops=(d.topOperadores||[]).filter(o=>o.ingresos>0);
  if(ops.length>=2){
    const mejor=ops[0], peor=[...ops].sort((a,b)=>(a.margen/a.ingresos)-(b.margen/b.ingresos))[0];
    if(mejor&&peor&&mejor.nombre!==peor.nombre) out.push({tipo:"ok", texto:
      `Productividad: ${mejor.nombre} genera el mayor ingreso atribuido (${f(mejor.ingresos)}); ${peor.nombre} tiene el margen más débil — revisar mezcla de rutas y costos asignados antes de conclusiones de desempeño.`});
  }

  // 9. Recomendaciones accionables
  const recs=[];
  if(mb!=null&&mb<15) recs.push("Repreciar los 3 servicios de menor margen o renegociar costos directos dominantes.");
  if(d.carteraVencida>0) recs.push(`Recuperar ${f(Math.min(d.carteraVencida,d.ventasMesProm))} de cartera vencida este mes (llamada + convenio de pago).`);
  if(top&&top.pctIngresos>=35) recs.push("Abrir 2 cuentas nuevas del pipeline de prospección para bajar la concentración.");
  if(d.sinCaptura>0) recs.push("Cerrar la captura de montos pendientes antes del corte mensual.");
  if(recs.length) out.push({tipo:"recomendaciones", lista:recs});

  return out;
}
