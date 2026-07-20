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
