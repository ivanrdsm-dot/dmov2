/* COTIZACIÓN AUTOMÁTICA DE UNA RUTA ASIGNADA · lógica pura (la usa el servidor; probada en cotizarRuta.test.js).
   Cuando operaciones asigna una ruta, el servidor arma la cotización con lo que ya sabe del servicio:
     - la unidad asignada (su tipo en Flota dice qué columna del tarifario aplica),
     - si es local o foránea (lo calcula el servidor al trazar la ruta),
     - cuántas entregas lleva y si va con ayudante.
   Mismas reglas que el Cotizador automático (cotizacionAuto.ts, paso 6):
     - Los precios salen SOLO del tarifario, del bloque "base" (precio de lista, 0 % de ganancia).
     - Lo que falta sale como PENDIENTE; lo que se supone sale en `supuestos`. Nada se inventa.
     - El precio final lo aprueba el director. */

/* Tipo de unidad de Flota → columna del tarifario. La misma tabla que tiposUnidad.ts (lo revisa una prueba). */
export const TARIFA_POR_TIPO_FLOTA = {
  "VW Transporter": "eur", "Eurovan 1T": "eur", "Peugeot Expert": "eur",
  "Camioneta 3.5T": "cam",
  "Mercedes Sprinter": "kra", "VW Crafter": "kra", "Krafter": "kra",
  "Rabón": "rab", "Mudancero": "mud",
};
export const NOMBRE_TARIFA = { eur: "Eurovan (1 t)", cam: "Camión 3.5 t", kra: "Sprinter / Crafter", rab: "Rabón", mud: "Mudancero" };
export const IVA_PCT = 16;

const num = v => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : NaN; };
const r2 = x => Math.round(x * 100) / 100;
const pesos = x => "$" + x.toLocaleString("es-MX", { maximumFractionDigits: 2 });
export const sinAcentos = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const redondearDecenasArriba = n => !Number.isFinite(n) || n <= 0 ? 0 : Math.ceil(Math.round(n * 100) / 100 / 10) * 10;

const vivas = (tarifas, tipo) => (tarifas || []).filter(t => t && t.tipo === tipo && t.activo !== false);
/** Tarifa por nombre exacto (sin acentos ni mayúsculas). */
export const tarifaPorNombre = (tarifas, tipo, nombre) => vivas(tarifas, tipo).find(t => sinAcentos(t.nombre) === sinAcentos(nombre)) || null;

/** Busca en la dirección de un punto el nombre de un destino del tarifario nacional (el nombre más largo que aparezca completo). */
export function destinoEnTarifario(tarifas, direccion){
  const d = " " + sinAcentos(direccion) + " ";
  if(!d.trim()) return null;
  const hallados = vivas(tarifas, "nacional").filter(t => { const k = sinAcentos(t.nombre); return k && d.includes(" " + k + " "); });
  return hallados.sort((a, b) => sinAcentos(b.nombre).length - sinAcentos(a.nombre).length)[0] || null;
}

const distKm = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
/** La entrega más lejos del primer punto de carga (en rutas foráneas es el destino que se cobra). */
export function entregaMasLejana(paradas){
  const entregas = (paradas || []).filter(p => p.tipo !== "carga" && p.estado !== "Quitada");
  const base = (paradas || []).find(p => p.tipo === "carga") || entregas[0];
  if(!base || entregas.length === 0) return null;
  return entregas.reduce((lejos, p) => distKm(base, p) > distKm(base, lejos) ? p : lejos, entregas[0]);
}

/**
 * @param {object} e
 * @param {object} e.servicio   el servicio (empresa, unidadPlaca, foraneo, segundoChoferId, maniobras)
 * @param {object|null} e.unidad la unidad de Flota de la placa asignada (o null)
 * @param {Array} e.paradas     paradas armadas de la ruta
 * @param {Array} e.tarifas     tarifario completo
 */
export function cotizarRuta({ servicio = {}, unidad = null, paradas = [], tarifas = [] }){
  const pendientes = [], supuestos = [], conceptos = [];
  const placa = String(servicio.unidadPlaca || "").trim().toUpperCase();
  const tipoFlota = String(unidad?.tipo || "").trim();
  const u = TARIFA_POR_TIPO_FLOTA[tipoFlota] || null;
  if(!placa) pendientes.push("Unidad: la ruta no tiene placa asignada");
  else if(!unidad) pendientes.push(`La placa ${placa} no está en Flota`);
  else if(!tipoFlota) pendientes.push(`Tipo de la unidad ${placa}: regístralo en Flota (Eurovan, 3.5 t, Sprinter…)`);
  else if(!u) pendientes.push(`El tarifario no tiene precio para "${tipoFlota}": cotizarlo aparte`);
  if(tipoFlota === "Peugeot Expert") supuestos.push("La Peugeot Expert se cobra con la columna Eurovan (1 t) del tarifario.");

  const entregas = Math.max(0, (paradas || []).filter(p => p.tipo !== "carga" && p.estado !== "Quitada").length);
  const maniobraTexto = sinAcentos(servicio.maniobras);
  const pidioAyudante = /^si\b/.test(maniobraTexto) || /ayudante|maniobra/.test(maniobraTexto) && !/^no\b/.test(maniobraTexto);
  const dosChoferes = !!String(servicio.segundoChoferId || "").trim();
  const conAyudante = pidioAyudante || dosChoferes;
  if(dosChoferes && !pidioAyudante) supuestos.push("Va con 2 choferes: se cotizó como viaje con 1 ayudante.");
  if(!conAyudante) supuestos.push("Sin ayudante ni maniobra (no se indicó en el servicio).");
  supuestos.push("Servicio normal, no urgente.");

  const foraneo = servicio.foraneo === true ? true : servicio.foraneo === false ? false : null;
  let tipoRuta = null, destino = "";
  const agregar = (t, nombre, detalle, veces = 1) => {
    if(!u) return;
    const b = num(t?.base?.[u]);
    if(!(b > 0)){ pendientes.push(`No hay tarifa de "${nombre}" para ${NOMBRE_TARIFA[u]}`); return; }
    conceptos.push({ concepto: nombre, monto: r2(b * veces), detalle });
  };
  if(foraneo === null) pendientes.push("Si la ruta es local o foránea (no se pudo trazar la ruta)");
  else if(!foraneo){
    tipoRuta = "local";
    const nombre = conAyudante ? "Viaje local con 1 ayudante y/o maniobra" : "Viaje local";
    agregar(tarifaPorNombre(tarifas, "local", nombre), conAyudante ? "Viaje local con ayudante o maniobra" : "Viaje local", "1 unidad, precio de lista");
    if(entregas > 1 && u){
      const v = num(tarifaPorNombre(tarifas, "local", "Entrega adicional en ruta local")?.valorUnico);
      if(v > 0) conceptos.push({ concepto: "Entregas adicionales en ruta", monto: r2(v * (entregas - 1)), detalle: `${entregas - 1} × ${pesos(v)}` });
      else pendientes.push('No hay tarifa de "Entrega adicional en ruta local"');
    }
  } else {
    tipoRuta = "nacional";
    const lejos = entregaMasLejana(paradas);
    const t = lejos ? destinoEnTarifario(tarifas, lejos.direccion) : null;
    destino = t?.nombre || "";
    if(!lejos) pendientes.push("Destino de la ruta");
    else if(!t) pendientes.push(`El destino "${lejos.nombre || lejos.direccion}" no está en el tarifario nacional`);
    else agregar(t, `Viaje a ${t.nombre}`, `1 unidad, precio de lista · destino más lejano: ${lejos.nombre || lejos.direccion}`);
    if(conAyudante && u){
      const v = num(vivas(tarifas, "regla").find(r => r.clave === "ayudante_foraneo")?.valor);
      if(v > 0) conceptos.push({ concepto: "Ayudante o maniobra en viaje foráneo", monto: r2(v), detalle: "regla del tarifario" });
      else pendientes.push("El tarifario no tiene precio de ayudante en viaje foráneo");
    }
    if(entregas > 1) pendientes.push("El tarifario nacional no tiene precio de entregas adicionales: cotizarlas aparte");
  }

  const subtotalBase = conceptos.length ? r2(conceptos.reduce((a, x) => a + x.monto, 0)) : null;
  const precio = subtotalBase !== null ? redondearDecenasArriba(subtotalBase) : null;
  const iva = precio !== null ? r2(precio * IVA_PCT / 100) : null;
  const unicos = [...new Set(pendientes)];
  return {
    tipoRuta, destino, entregas, conAyudante, unidadPlaca: placa, unidadTipo: tipoFlota,
    resultado: {
      unidadClave: u, unidadNombre: u ? `${NOMBRE_TARIFA[u]} · ${placa}` : (placa || null), unidades: placa ? 1 : 0, conProveedor: false,
      tarimas: null, pesoKg: null, volumenM3: null, maniobra: conAyudante, ayudantes: conAyudante ? 1 : 0,
      motivoUnidad: placa ? `Unidad que asignó operaciones: ${placa}${tipoFlota ? ` (${tipoFlota})` : ""}.` : "",
      conceptos, subtotalBase, gananciaPct: 0, precio, iva, total: precio !== null && iva !== null ? r2(precio + iva) : null,
      supuestos, pendientes: unicos, lista: precio !== null && unicos.length === 0,
    },
  };
}
