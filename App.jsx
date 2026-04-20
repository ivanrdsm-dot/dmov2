import { useState, useRef, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query, where, getDocs, setDoc, getDoc,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import {
  Truck, Package, FileText, LayoutDashboard, DollarSign, Plus,
  Search, X, Check, Minus, MapPin, Clock, CheckCircle, Send,
  Building2, RefreshCw, Trash2, Users,
  Calendar, TrendingUp, Map, Globe,
  ArrowRight, AlertCircle, ChevronDown, ChevronUp, BarChart2,
  Printer, ChevronRight, Navigation, Upload,
  Download, Eye, Target, Zap, FolderOpen, ClipboardList,
  Menu, Bell, ChevronLeft, Activity, Shield, Hash,
  Phone, Camera, LogOut, Play, Square, Radio, Flag,
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ─── FIREBASE ───────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyB7tuRYUEY471IPJdnOB69DI2yKLCU72T0",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "salesflow-crm-13c4a.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "salesflow-crm-13c4a",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "salesflow-crm-13c4a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "525995422237",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:525995422237:web:e69d7e7dd76ac9640c8cf4",
};
const fbApp = initializeApp(firebaseConfig);
// Firestore con offline persistence (IndexedDB) — el chofer puede seguir
// registrando entregas sin señal; al volver conexión se sincroniza solo.
let db;
try{
  db = initializeFirestore(fbApp,{
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()}),
  });
}catch(e){
  // Fallback si el navegador no soporta persistencia (modo incógnito estricto)
  db = getFirestore(fbApp);
}

/* Helper: Comprime imagen en cliente a JPEG pequeño y retorna base64.
   No requiere Firebase Storage ni billing. Se guarda directo en Firestore. */
async function compressImage(file, maxDim=1000, quality=0.75){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = (ev)=>{
      const img = new Image();
      img.onload = ()=>{
        let {width,height} = img;
        if(width>height && width>maxDim){height*=maxDim/width;width=maxDim;}
        else if(height>=width && height>maxDim){width*=maxDim/height;height=maxDim;}
        const canvas = document.createElement("canvas");
        canvas.width=width;canvas.height=height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img,0,0,width,height);
        const dataUrl = canvas.toDataURL("image/jpeg",quality);
        resolve(dataUrl);
      };
      img.onerror=reject;
      img.src = ev.target.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}
// Alias legacy (las llamadas a uploadEvidencia ahora retornan base64)
async function uploadEvidencia(file){
  return await compressImage(file,1000,0.75);
}

/* ─── MAPBOX ─────────────────────────────────────────────────────────────── */
// Mapbox public token — debe configurarse en VITE_MAPBOX_TOKEN (Vercel env vars).
// El token anterior hardcodeado fue revocado; si no configuras uno nuevo, las búsquedas
// de direcciones mostrarán un aviso en pantalla en lugar de fallar en silencio.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";
if(MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;
const MX_CENTER = [-99.1332, 19.4326]; // CDMX default

/* Bboxes de zonas metropolitanas mexicanas [minLng,minLat,maxLng,maxLat]
   Incluyen área metropolitana completa, no solo el municipio central.
   Esto es crítico para CDMX+EdoMex ya que la zona conurbada incluye
   Naucalpan, Ecatepec, Tlalnepantla, Nezahualcóyotl, etc. */
const CITY_BBOX = {
  // ZMVM (Zona Metropolitana del Valle de México) - CDMX + municipios conurbados de Edo Mex
  "Ciudad de México":[-99.55,19.00,-98.75,19.90],
  "CDMX":[-99.55,19.00,-98.75,19.90],
  "Estado de México":[-100.60,18.35,-98.50,20.30],
  "Edo de México":[-100.60,18.35,-98.50,20.30],
  // Zona Metropolitana de Guadalajara (incluye Zapopan, Tlaquepaque, Tonalá, Tlajomulco)
  "Guadalajara":[-103.60,20.45,-103.15,20.85],
  // Zona Metropolitana de Monterrey (incluye San Pedro, San Nicolás, Guadalupe, Apodaca, Escobedo, Santa Catarina)
  "Monterrey":[-100.55,25.50,-100.05,25.90],
  // Zona Metropolitana de Puebla (incluye Cholula, Coronango)
  "Puebla":[-98.40,18.90,-98.05,19.20],
  // Zona Metropolitana de Querétaro (incluye El Marqués, Corregidora)
  "Querétaro":[-100.60,20.45,-100.20,20.75],
  // Zona Metropolitana de Toluca (incluye Metepec, Zinacantepec, Lerma)
  "Toluca":[-99.90,19.10,-99.45,19.45],
  // Zona Metropolitana de Tijuana-Rosarito
  "Tijuana":[-117.20,32.35,-116.65,32.65],
  // Zona Metropolitana de Mérida (incluye Kanasín, Umán)
  "Mérida":[-89.85,20.80,-89.40,21.15],
  // Cancún (amplía a zona hotelera + Puerto Morelos cerca)
  "Cancún":[-87.05,20.95,-86.70,21.30],
  // Zona Metropolitana de Cuernavaca
  "Cuernavaca":[-99.35,18.80,-99.10,19.05],
  // Zona Metropolitana de León-Silao
  "León":[-101.85,20.95,-101.45,21.25],
  "Chihuahua":[-106.30,28.45,-105.85,28.85],
  // Zona Metropolitana de Aguascalientes (incluye Jesús María)
  "Aguascalientes":[-102.45,21.70,-102.10,22.05],
  "Hermosillo":[-111.20,28.85,-110.75,29.25],
  "Culiacán":[-107.60,24.60,-107.20,25.00],
  "Mazatlán":[-106.55,23.05,-106.25,23.40],
  // Zona Metropolitana de Veracruz-Boca del Río
  "Veracruz":[-96.30,19.00,-96.00,19.35],
  "Villahermosa":[-93.10,17.85,-92.75,18.15],
  "Mexicali":[-115.60,32.55,-115.30,32.78],
  // Zona Metropolitana de Saltillo
  "Saltillo":[-101.15,25.25,-100.85,25.55],
  "Pachuca":[-98.90,19.95,-98.55,20.25],
  "Oaxaca":[-96.90,16.95,-96.55,17.20],
  "Morelia":[-101.40,19.55,-101.00,19.85],
  // Zona Metropolitana La Laguna (Torreón, Gómez Palacio, Lerdo)
  "Torreón":[-103.60,25.35,-103.20,25.75],
  "Celaya":[-100.95,20.35,-100.65,20.65],
  "San Luis Potosí":[-101.20,21.95,-100.80,22.30],
  "Tampico":[-98.00,22.05,-97.65,22.45],
  "Apizaco":[-98.30,19.30,-98.05,19.55],
  "Campeche":[-90.70,19.65,-90.35,20.00],
  "Cd. Juárez":[-106.70,31.50,-106.25,31.85],
  "Chetumal":[-88.45,18.35,-88.10,18.65],
  "Chiapas":[-93.40,16.55,-92.80,16.95],
  "Chilpancingo":[-99.70,17.40,-99.40,17.70],
  "Coatzacoalcos":[-94.60,18.05,-94.25,18.30],
  "Colima":[-103.85,19.10,-103.55,19.35],
  "Cozumel":[-87.15,20.35,-86.75,20.70],
  "Durango":[-104.85,23.90,-104.45,24.20],
  "Ensenada":[-116.85,31.70,-116.45,32.00],
  "Guanajuato":[-101.40,20.95,-101.15,21.15],
  "Irapuato":[-101.55,20.55,-101.25,20.80],
  "Jalapa":[-97.05,19.40,-96.80,19.70],
  "Los Cabos":[-110.30,22.75,-109.55,23.20],
  "Manzanillo":[-104.50,18.95,-104.15,19.20],
  "Matamoros":[-97.65,25.75,-97.35,26.00],
  "Minatitlán":[-94.65,17.90,-94.40,18.10],
  "Nogales":[-111.05,31.20,-110.85,31.45],
  "Nuevo Laredo":[-99.65,27.35,-99.35,27.65],
  "Orizaba":[-97.20,18.75,-96.90,19.00],
  "Palenque":[-92.15,17.45,-91.85,17.65],
  "Parral":[-105.85,26.80,-105.55,27.05],
  "Piedras Negras":[-100.65,28.60,-100.40,28.85],
  "Playa del Carmen":[-87.20,20.50,-86.90,20.80],
  "Poza Rica":[-97.65,20.40,-97.30,20.70],
  "Puerto Vallarta":[-105.40,20.50,-105.10,20.85],
  // Zona Metropolitana de Reynosa-Río Bravo
  "Reynosa":[-98.45,25.95,-98.10,26.25],
  "Rosarito":[-117.15,32.20,-116.85,32.50],
  "Salina Cruz":[-95.35,16.05,-95.10,16.30],
  "San Cristóbal":[-92.80,16.60,-92.50,16.85],
  "Tapachula":[-92.45,14.75,-92.10,15.05],
  "Taxco":[-99.80,18.45,-99.50,18.65],
  "Tepic":[-105.05,21.35,-104.70,21.65],
  "Tlaxcala":[-98.40,19.20,-98.10,19.45],
  // Tuxtla Gutiérrez + Chiapa de Corzo
  "Tuxtla":[-93.30,16.60,-92.85,16.90],
  "Valladolid":[-88.35,20.55,-88.05,20.80],
  "Zacatecas":[-102.70,22.65,-102.40,22.95],
  "Zihuatanejo":[-101.70,17.50,-101.40,17.80],
};
/* Geofencing: verifica si punto (lng,lat) está dentro de bbox [minLng,minLat,maxLng,maxLat] */
function dentroBbox(lng,lat,bbox){
  if(!bbox||bbox.length<4) return true;
  return lng>=bbox[0]&&lng<=bbox[2]&&lat>=bbox[1]&&lat<=bbox[3];
}
/* Distancia entre dos puntos (km) - Haversine */
function distKm(lat1,lng1,lat2,lng2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
/* Construye un bbox de tolerancia alrededor de todos los puntos de una ruta, con buffer de N km */
function buildRutaGeofence(ruta, bufferKm=15){
  const puntos=[];
  (ruta.stops||[]).forEach(s=>{
    (s.puntos||[]).forEach(p=>{if(p.lat&&p.lng) puntos.push([p.lng,p.lat]);});
    if(s.cityBbox) puntos.push([s.cityBbox[0],s.cityBbox[1]],[s.cityBbox[2],s.cityBbox[3]]);
  });
  if(puntos.length===0) return null;
  let minLng=180,minLat=90,maxLng=-180,maxLat=-90;
  puntos.forEach(([lng,lat])=>{
    if(lng<minLng) minLng=lng;
    if(lng>maxLng) maxLng=lng;
    if(lat<minLat) minLat=lat;
    if(lat>maxLat) maxLat=lat;
  });
  // Buffer de N km: ~0.009 lat = 1km, ~0.01 lng (aprox Mx)
  const bufLat = bufferKm*0.009;
  const bufLng = bufferKm*0.01;
  return [minLng-bufLng, minLat-bufLat, maxLng+bufLng, maxLat+bufLat];
}

// Geocodifica una ciudad vía Mapbox si no está en el hardcode
async function geocodeCity(cityName){
  const local = CITY_BBOX[cityName];
  if(local) return {bbox:local,center:[(local[0]+local[2])/2,(local[1]+local[3])/2]};
  if(!MAPBOX_TOKEN) return null;
  try{
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cityName+", México")}.json?access_token=${MAPBOX_TOKEN}&country=MX&language=es&limit=1&types=place,locality,region`;
    const res = await fetch(url);
    const d = await res.json();
    const f = d.features?.[0];
    if(!f) return null;
    return {bbox:f.bbox||null,center:f.center};
  }catch(e){return null;}
}

/* ─── DESIGN TOKENS ──────────────────────────────────────────────────────── */
const A      = "#f97316";
const BLUE   = "#2563eb";
const GREEN  = "#059669";
const VIOLET = "#7c3aed";
const ROSE   = "#e11d48";
const AMBER  = "#d97706";
const MUTED  = "#607080";
const TEXT   = "#0c1829";
const BORDER = "#e8eef6";
const BD2    = "#d2dcea";
const SANS   = "'Plus Jakarta Sans',sans-serif";
const MONO   = "'JetBrains Mono',monospace";
const DISP   = "'Bricolage Grotesque',sans-serif";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800;12..96,900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%}
body{background:#f1f4fb;font-family:${SANS};color:${TEXT};-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${BD2};border-radius:8px}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes popIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes spin{to{transform:rotate(360deg)}}
.au{animation:fadeUp .32s cubic-bezier(.22,1,.36,1) both}
.au2{animation:fadeUp .32s .07s cubic-bezier(.22,1,.36,1) both}
.pi{animation:popIn .2s cubic-bezier(.34,1.56,.64,1) both}
.spin{animation:spin 1s linear infinite}
.btn{transition:all .12s;cursor:pointer;border:none;background:transparent;padding:0}
.btn:hover{filter:brightness(1.07);transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.ch{transition:box-shadow .18s,transform .18s}
.ch:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(12,24,41,.11)!important}
.fr{transition:background .1s}
.fr:hover{background:#f6f9ff!important}
input,select,textarea{font-family:${SANS};color:${TEXT};outline:none}
input:focus,select:focus,textarea:focus{border-color:${A}!important;box-shadow:0 0 0 3px ${A}18!important}
button:focus-visible{outline:2px solid ${A};outline-offset:2px;border-radius:8px}
@keyframes slideIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.slide-in{animation:slideIn .25s cubic-bezier(.22,1,.36,1) both}
.skel{background:linear-gradient(90deg,#e8eef6 25%,#f1f4fb 50%,#e8eef6 75%);background-size:200% 100%;animation:shimmer 1.5s ease infinite;border-radius:8px}
.pulse{animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite}
.glass{background:rgba(255,255,255,.82);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%)}
/* Dark mode automatico para app chofer (sistema operativo oscuro = menos fatiga visual de noche + ahorra bateria OLED) */
@media (prefers-color-scheme: dark){
  body.chofer-mode{background:#0a1628!important}
  body.chofer-mode .card-auto{background:#1a2740!important;color:#e8eef6!important;border-color:#2a3a55!important}
  body.chofer-mode input,body.chofer-mode textarea,body.chofer-mode select{background:#1a2740!important;color:#fff!important;border-color:#2a3a55!important}
}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.table-wrap table{min-width:800px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.g2-side{display:grid;grid-template-columns:1fr 340px;gap:16px}
@media(max-width:1024px){
  .g4{grid-template-columns:repeat(2,1fr)}
  .g2-side{grid-template-columns:1fr}
}
@media(max-width:768px){
  .g4,.g3,.g2{grid-template-columns:1fr}
  .g2-side{grid-template-columns:1fr}
  .hide-mobile{display:none!important}
  .btn{min-height:40px}
  .sidebar-desktop{transform:translateX(-100%);position:fixed;z-index:200}
  .sidebar-desktop.open{transform:translateX(0)}
  .mobile-backdrop{display:block!important}
}
@media(max-width:480px){
  .g4,.g3,.g2{gap:8px}
}
@media print{.noprint{display:none!important}body{background:#fff}}
`;

/* ─── TARIFARIO LOCAL 2026 ───────────────────────────────────────────────── */
const LOC = {
  eur:{ normal:2500,ayudante:3000,urgente:2500,urgente_ay:3000,resguardo:1800,renta_dia:1600,renta_chofer:3500,renta_mes:36000 },
  cam:{ normal:3200,ayudante:3700,urgente:3200,urgente_ay:3700,resguardo:3200,renta_dia:2800,renta_chofer:5800,renta_mes:63000 },
  kra:{ normal:3600,ayudante:4100,urgente:3600,urgente_ay:4100,resguardo:3600 },
};
/* Ayudante = +$500 sobre tarifa base en todos los vehículos */
const AYUD_EXTRA = 500;

/* ─── TARIFARIO FORÁNEO 2026 ─────────────────────────────────────────────── */
const TAR = [
  {c:"Ciudad de México",km:0,eur:2500,cam:3200,kra:3600,local:true},
  {c:"Acapulco",km:395,eur:13310,cam:20086,kra:22082},
  {c:"Aguascalientes",km:513,eur:15178,cam:22215,kra:24437},
  {c:"Apizaco",km:145,eur:6899,cam:11540,kra:12858},
  {c:"Campeche",km:1155,eur:29667,cam:40241,kra:44657},
  {c:"Cancún",km:1649,eur:40204,cam:58455,kra:64476},
  {c:"Cd. Juárez",km:1863,eur:47542,cam:60437,kra:67612},
  {c:"Cd. Obregón",km:1671,eur:41119,cam:53952,kra:59347},
  {c:"Cd. Victoria",km:721,eur:20560,cam:28977,kra:31874},
  {c:"Celaya",km:263,eur:8279,cam:12695,kra:13964},
  {c:"Chetumal",km:1345,eur:30356,cam:46225,kra:50847},
  {c:"Chiapas",km:1015,eur:23206,cam:31485,kra:35123},
  {c:"Chihuahua",km:1487,eur:33806,cam:49674,kra:54642},
  {c:"Chilpancingo",km:278,eur:9659,cam:15178,kra:16696},
  {c:"Coatzacoalcos",km:601,eur:17938,cam:24561,kra:27017},
  {c:"Colima",km:744,eur:19732,cam:28839,kra:31723},
  {c:"Cozumel",km:1550,eur:48922,cam:69996,kra:77008},
  {c:"Cuernavaca",km:89,eur:3864,cam:6899,kra:7589},
  {c:"Culiacán",km:1262,eur:29805,cam:46225,kra:50847},
  {c:"Durango",km:915,eur:23043,cam:28977,kra:31874},
  {c:"Ensenada",km:2961,eur:59333,cam:75891,kra:83480},
  {c:"Gómez Palacio",km:985,eur:22767,cam:33116,kra:36428},
  {c:"Guadalajara",km:542,eur:15178,cam:22215,kra:24437},
  {c:"Hermosillo",km:1959,eur:48018,cam:63887,kra:70275},
  {c:"Iguala",km:203,eur:8279,cam:13108,kra:14419},
  {c:"Irapuato",km:323,eur:12419,cam:18628,kra:20491},
  {c:"Jalapa/Xalapa",km:322,eur:12419,cam:18628,kra:20491},
  {c:"La Paz BCS",km:4312,eur:77271,cam:104868,kra:115355},
  {c:"Laredo",km:1117,eur:26493,cam:37394,kra:41133},
  {c:"León",km:387,eur:13798,cam:20823,kra:22893},
  {c:"Los Mochis",km:1442,eur:33806,cam:48984,kra:53883},
  {c:"Matamoros",km:975,eur:23871,cam:34220,kra:37642},
  {c:"Mazatlán",km:1042,eur:26631,cam:37394,kra:41133},
  {c:"Mérida",km:1332,eur:32991,cam:47604,kra:52622},
  {c:"Mexicali",km:2661,eur:56573,cam:73132,kra:80445},
  {c:"Minatitlán",km:579,eur:17938,cam:24561,kra:27017},
  {c:"Monclova",km:1021,eur:26970,cam:38636,kra:42524},
  {c:"Monterrey",km:933,eur:21325,cam:28475,kra:31423},
  {c:"Morelia",km:302,eur:12419,cam:18628,kra:20491},
  {c:"Oaxaca",km:470,eur:12419,cam:18628,kra:20491},
  {c:"Orizaba",km:269,eur:11039,cam:18628,kra:20491},
  {c:"Pachuca",km:95,eur:4390,cam:7777,kra:8655},
  {c:"Piedras Negras",km:1286,eur:34621,cam:51807,kra:58204},
  {c:"Poza Rica",km:273,eur:12419,cam:17938,kra:19732},
  {c:"Puebla",km:123,eur:5080,cam:7727,kra:8718},
  {c:"Puerto Vallarta",km:875,eur:21450,cam:30218,kra:34496},
  {c:"Querétaro",km:211,eur:6899,cam:11917,kra:12143},
  {c:"Reynosa",km:1002,eur:25251,cam:35600,kra:39160},
  {c:"Río Blanco",km:279,eur:11039,cam:18628,kra:20491},
  {c:"Saltillo",km:849,eur:17938,cam:25527,kra:28080},
  {c:"San Juan del Río",km:162,eur:5519,cam:10211,kra:11232},
  {c:"San Luis Potosí",km:415,eur:13108,cam:18628,kra:20491},
  {c:"Tampico",km:486,eur:16558,cam:25251,kra:27776},
  {c:"Tapachula",km:1157,eur:29102,cam:42900,kra:47291},
  {c:"Taxco",km:187,eur:8279,cam:13108,kra:14419},
  {c:"Tepic",km:756,eur:21939,cam:28839,kra:31723},
  {c:"Tijuana",km:2848,eur:63347,cam:81787,kra:90066},
  {c:"Tlaxcala",km:118,eur:5381,cam:9659,kra:10625},
  {c:"Toluca",km:66,eur:3808,cam:6944,kra:7952},
  {c:"Torreón",km:1012,eur:22767,cam:31184,kra:34303},
  {c:"Tuxpan",km:324,eur:13108,cam:20284,kra:22312},
  {c:"Tuxtla Gutiérrez",km:1015,eur:25966,cam:35261,kra:39338},
  {c:"Veracruz",km:402,eur:14676,cam:22705,kra:25025},
  {c:"Villahermosa",km:768,eur:20698,cam:31874,kra:35062},
  {c:"Zacatecas",km:605,eur:19318,cam:26217,kra:28839},
  {c:"Zamora",km:430,eur:13108,cam:18628,kra:20491},
];

const VEHK = [
  {k:"eur",label:"Eurovan 1T",    cap:"8 m³", crew:1,icon:"🚐"},
  {k:"cam",label:"Camioneta 3.5T",cap:"16 m³",crew:1,icon:"🚛"},
  {k:"kra",label:"Krafter",       cap:"20 m³",crew:1,icon:"🚐"},
];

/* ─── UTILS ──────────────────────────────────────────────────────────────── */
const fmt  = n => "$"+Math.round(n).toLocaleString("es-MX");
const fmtK = n => n>=1e6?"$"+(n/1e6).toFixed(2)+"M":n>=1e3?"$"+(n/1e3).toFixed(1)+"k":"$"+Math.round(n);
const uid  = () => Math.random().toString(36).slice(2,8).toUpperCase();
const KM_DIA=550, COMIDA=350, HOTEL=900, ADIC=1200, AYUD=2800;

function diasRuta(km){
  if(!km) return {ida:0,noches:0,total:0};
  const ida=Math.ceil(km/KM_DIA);
  return {ida,noches:km>300?ida:0,total:ida*2};
}
function calcViaticos(km,crew,comida=COMIDA,hotel=HOTEL){
  const {total,noches}=diasRuta(km);
  const xC=comida*crew*total;
  const xH=hotel*crew*noches;
  return {xC,xH,total:xC+xH,dias:total,noches};
}
function calcFlota(pdv,maxDia,plazo){
  const vans=Math.max(1,Math.ceil(pdv/(maxDia*plazo)));
  const dias=Math.ceil(pdv/(maxDia*vans));
  return {vans,dias,capDia:maxDia*vans};
}
function mapsURL(stops){
  if(!stops||stops.length<2) return null;
  const enc=s=>encodeURIComponent(s+", México");
  const o=enc(stops[0]),d=enc(stops[stops.length-1]);
  const wp=stops.slice(1,-1).map(enc);
  return "https://www.google.com/maps/dir/?api=1&origin="+o+"&destination="+d+(wp.length?"&waypoints="+wp.join("|"):"")+("&travelmode=driving");
}

/* ─── PDF: COTIZACIÓN ────────────────────────────────────────────────────── */
function printCotizacion(q){
  const row=(l,v,bold,color)=>`<tr><td style="padding:9px 0;border-bottom:1px solid #eef2f8;font-size:13px;color:#607080">${l}</td><td style="padding:9px 0;border-bottom:1px solid #eef2f8;text-align:right;font-size:${bold?16:13}px;font-weight:700;color:${color||"#0c1829"};font-family:monospace">${v}</td></tr>`;
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Cotización ${q.folio||""}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Plus Jakarta Sans',sans-serif;background:#fff;color:#0c1829;padding:40px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:18px;border-bottom:3px solid #f97316}
.logo{font-size:26px;font-weight:800}.logo span{color:#f97316}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
.lbl{font-size:10px;font-weight:700;color:#607080;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px}
.val{font-size:14px;font-weight:700}
table{width:100%;border-collapse:collapse}
.tot{background:#fff8f3;padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-top:16px}
.tot-lbl{font-size:13px;font-weight:600;color:#607080}.tot-amt{font-size:28px;font-weight:800;color:#f97316;font-family:monospace}
.note{background:#f8fafd;border:1px solid #eef2f8;border-radius:8px;padding:12px;font-size:12px;color:#607080;line-height:1.6;margin-top:20px}
.footer{margin-top:28px;padding-top:14px;border-top:1px solid #eef2f8;display:flex;justify-content:space-between;font-size:11px;color:#9db0c4}
@media print{body{padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>
<body>
<div class="hdr">
  <div><div class="logo">DM<span>vimiento</span></div><div style="font-size:12px;color:#607080;margin-top:4px">Logística Especializada · México 2026</div>
  <div style="margin-top:8px;display:inline-block;background:#f1f4fb;padding:4px 12px;border-radius:20px;font-size:11px;font-family:monospace;color:#607080">FOLIO: ${q.folio||"—"}</div></div>
  <div style="text-align:right"><div style="font-size:11px;color:#607080">Fecha de cotización</div>
  <div style="font-weight:700;margin-top:2px">${new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"})}</div>
  <div style="margin-top:8px;display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#fff4ec;color:#f97316">${q.modoLabel||q.modo||"COTIZACIÓN"}</div></div>
</div>
<div class="grid2">
  <div><span class="lbl">Cliente / Empresa</span><div class="val">${q.cliente||"—"}</div></div>
  <div><span class="lbl">Contacto</span><div class="val">${q.contacto||"—"}</div></div>
  <div><span class="lbl">Destino / Ruta</span><div class="val">${q.destino||"—"}</div></div>
  <div><span class="lbl">Vehículo</span><div class="val">${q.vehiculoLabel||"—"}</div></div>
</div>
${q.stops&&q.stops.length>1?`<div style="font-size:10px;font-weight:700;color:#607080;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Paradas de ruta</div>
${q.stops.map((s,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:13px"><div style="width:20px;height:20px;border-radius:50%;background:#fff4ec;color:#f97316;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div><strong>${s.city||s}</strong>${s.pdv?" — "+s.pdv+" PDVs":""}</div>`).join("")}<div style="margin-bottom:20px"></div>`:""}
<div style="font-size:10px;font-weight:700;color:#607080;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Desglose de costos</div>
<table><tbody>${(q.lines||[]).map(l=>row(l.label,l.value,l.bold,l.color)).join("")}</tbody></table>
<div class="tot"><div class="tot-lbl">TOTAL CON IVA</div><div class="tot-amt">${fmt(q.total||0)}</div></div>
${q.notas?`<div class="note"><strong>Notas:</strong> ${q.notas}</div>`:""}
<div class="note"><strong>Condiciones:</strong> Propuesta válida 15 días. Incluye combustible, casetas y seguro básico. Sujeto a disponibilidad de unidades.</div>
<div class="footer"><div>DMvimiento Logística · México 2026</div><div>Generado ${new Date().toLocaleString("es-MX")}</div></div>
</body></html>`;
  const w=window.open("","_blank","width=900,height=700");
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),600);}
}

/* ─── PDF: FACTURA ───────────────────────────────────────────────────────── */
function printFactura(f){
  const sc={Pagada:"#059669",Pendiente:"#d97706",Vencida:"#e11d48"};
  const bg={Pagada:"#d1fae5",Pendiente:"#fef3c7",Vencida:"#fee2e2"};
  const st=f.status||"Pendiente";
  const sub=Number(f.subtotal||f.monto||0);
  const iva=Number(f.ivaAmt||f.iva||0);
  const tot=Number(f.total||sub+iva||0);
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Factura ${f.folio||""}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Plus Jakarta Sans',sans-serif;color:#0c1829;background:#fff;padding:40px}
.top{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:4px solid #f97316;margin-bottom:28px}
.brand{font-size:28px;font-weight:900;color:#f97316}.brand span{color:#0c1829}
.fnum{font-size:24px;font-weight:800;font-family:monospace}.flbl{font-size:10px;color:#607080;text-transform:uppercase;letter-spacing:.08em}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
.lbl{font-size:10px;font-weight:700;color:#607080;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px}
.val{font-size:15px;font-weight:700}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
thead th{background:#0c1829;color:#fff;padding:10px 14px;text-align:left;font-size:11px;letter-spacing:.04em}
tbody td{padding:10px 14px;border-bottom:1px solid #e8eef6;font-size:13px}
.totbox{max-width:300px;margin-left:auto}
.trow{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #e8eef6}
.trow.grand{font-size:20px;font-weight:800;color:#f97316;border-top:2px solid #f97316;border-bottom:none;padding-top:12px;margin-top:6px}
.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700}
.footer{margin-top:36px;padding-top:16px;border-top:1px solid #e8eef6;display:flex;justify-content:space-between;font-size:11px;color:#9db0c4}
@media print{body{padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>
<body>
<div class="top">
  <div><div class="brand">DM<span>vimiento</span></div><div style="font-size:12px;color:#607080;margin-top:4px">Sistema de Gestión Logística</div></div>
  <div style="text-align:right"><div class="flbl">Factura No.</div><div class="fnum">${f.folio||"—"}</div>
  <div style="margin-top:6px;font-size:12px;color:#607080">${f.mesOp||""} ${f.anio||""}</div></div>
</div>
<div class="g2">
  <div><span class="lbl">Empresa / Cliente</span><div class="val">${f.empresa||f.cliente||"—"}</div>
  ${f.solicitante?`<div style="font-size:12px;color:#607080;margin-top:3px">Atención: ${f.solicitante}</div>`:""}
  </div>
  <div><span class="lbl">Estado de pago</span>
  <span class="badge" style="background:${bg[st]||"#fef3c7"};color:${sc[st]||"#d97706"}">${st}</span>
  ${f.notas?`<div style="font-size:11px;color:#607080;margin-top:8px">${f.notas}</div>`:""}
  </div>
</div>
<table>
<thead><tr><th>Descripción del servicio</th><th>Plan / Cuenta</th><th style="text-align:right">Importe</th></tr></thead>
<tbody>
<tr><td>${f.servicio||"Servicio de logística"}</td><td>${f.plan||"—"}</td><td style="text-align:right;font-weight:700;font-family:monospace">$${sub.toLocaleString("es-MX")}</td></tr>
</tbody></table>
<div class="totbox">
  <div class="trow"><span>Subtotal</span><span style="font-family:monospace">$${sub.toLocaleString("es-MX")}</span></div>
  <div class="trow"><span>IVA 16%</span><span style="font-family:monospace">$${iva.toLocaleString("es-MX")}</span></div>
  <div class="trow grand"><span>TOTAL</span><span style="font-family:monospace">$${tot.toLocaleString("es-MX")}</span></div>
</div>
<div class="footer"><div>DMvimiento Logistics OS</div><div>Generado el ${new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"})}</div></div>
</body></html>`;
  const win=window.open("","_blank","width=820,height=900");
  if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500);}
}

/* ─── EXPORTS REALES: PDF (jsPDF) + XLSX ────────────────────────────────── */
const mxMoney = n => "$" + Number(n||0).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2});
const fechaLarga = () => new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"});
const slug = s => String(s||"doc").replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"").slice(0,40)||"doc";

function pdfHeader(pdf, titulo, folio, badge){
  pdf.setFillColor(249,115,22);
  pdf.rect(0,0,210,4,"F");
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(22);
  pdf.setTextColor(249,115,22);
  pdf.text("DM",14,22);
  pdf.setTextColor(12,24,41);
  pdf.text("vimiento",27,22);
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(9);
  pdf.setTextColor(96,112,128);
  pdf.text("Logística Especializada · México 2026",14,28);
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(14);
  pdf.setTextColor(12,24,41);
  pdf.text(titulo,196,22,{align:"right"});
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(9);
  pdf.setTextColor(96,112,128);
  if(folio) pdf.text("Folio: "+folio,196,28,{align:"right"});
  pdf.text(fechaLarga(),196,33,{align:"right"});
  if(badge){
    pdf.setFillColor(255,244,236);
    pdf.setTextColor(249,115,22);
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(8);
    const w = pdf.getTextWidth(badge)+8;
    pdf.roundedRect(196-w,36,w,6,3,3,"F");
    pdf.text(badge,196-w/2,40.2,{align:"center"});
  }
  pdf.setDrawColor(249,115,22);
  pdf.setLineWidth(0.8);
  pdf.line(14,46,196,46);
}
function pdfFooter(pdf){
  const h = pdf.internal.pageSize.getHeight();
  pdf.setDrawColor(232,238,246);
  pdf.setLineWidth(0.3);
  pdf.line(14,h-14,196,h-14);
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(8);
  pdf.setTextColor(157,176,196);
  pdf.text("DMvimiento Logistics OS",14,h-8);
  pdf.text("Generado "+new Date().toLocaleString("es-MX"),196,h-8,{align:"right"});
}
function pdfLabelValue(pdf,x,y,label,value){
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(7);
  pdf.setTextColor(96,112,128);
  pdf.text(String(label).toUpperCase(),x,y);
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(11);
  pdf.setTextColor(12,24,41);
  pdf.text(String(value||"—"),x,y+5);
}

function downloadCotizacionPDF(q){
  const pdf = new jsPDF({unit:"mm",format:"a4"});
  pdfHeader(pdf,"COTIZACIÓN",q.folio,q.modoLabel||q.modo||"");
  pdfLabelValue(pdf,14,56,"Cliente / Empresa",q.cliente);
  pdfLabelValue(pdf,110,56,"Contacto",q.contacto);
  pdfLabelValue(pdf,14,70,"Destino / Ruta",q.destino);
  pdfLabelValue(pdf,110,70,"Vehículo",q.vehiculoLabel);
  let y = 84;
  if(q.stops && q.stops.length>1){
    pdf.setFont("helvetica","bold");pdf.setFontSize(8);pdf.setTextColor(96,112,128);
    pdf.text("PARADAS DE RUTA",14,y); y+=5;
    pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.setTextColor(12,24,41);
    q.stops.forEach((s,i)=>{
      const t = (i+1)+". "+(s.city||s)+(s.pdv?" — "+s.pdv+" PDVs":"");
      pdf.text(t,18,y); y+=5;
    });
    y+=3;
  }
  autoTable(pdf,{
    startY:y,
    head:[["Concepto","Importe"]],
    body:(q.lines||[]).map(l=>[l.label,l.value]),
    theme:"grid",
    headStyles:{fillColor:[12,24,41],textColor:255,fontSize:9,fontStyle:"bold"},
    bodyStyles:{fontSize:10,textColor:[12,24,41]},
    columnStyles:{1:{halign:"right",fontStyle:"bold"}},
    margin:{left:14,right:14},
  });
  let endY = pdf.lastAutoTable.finalY+6;
  pdf.setFillColor(255,248,243);
  pdf.roundedRect(14,endY,182,16,3,3,"F");
  pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.setTextColor(96,112,128);
  pdf.text("TOTAL CON IVA",20,endY+9);
  pdf.setFont("helvetica","bold");pdf.setFontSize(16);pdf.setTextColor(249,115,22);
  pdf.text(mxMoney(q.total||0),190,endY+10,{align:"right"});
  endY += 22;
  if(q.notas){
    pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.setTextColor(96,112,128);
    pdf.text("Notas: "+q.notas,14,endY,{maxWidth:182});
    endY += 8;
  }
  pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.setTextColor(96,112,128);
  pdf.text("Propuesta válida 15 días. Incluye combustible, casetas y seguro básico. Sujeto a disponibilidad.",14,endY,{maxWidth:182});
  pdfFooter(pdf);
  pdf.save("Cotizacion_"+slug(q.folio||q.cliente)+".pdf");
}

function downloadFacturaPDF(f){
  const pdf = new jsPDF({unit:"mm",format:"a4"});
  const st  = f.status||"Pendiente";
  pdfHeader(pdf,"FACTURA",f.folio,st.toUpperCase());
  pdfLabelValue(pdf,14,56,"Empresa / Cliente",f.empresa||f.cliente);
  pdfLabelValue(pdf,110,56,"Solicitante",f.solicitante);
  pdfLabelValue(pdf,14,70,"Mes / Año",(f.mesOp||"")+" "+(f.anio||""));
  pdfLabelValue(pdf,110,70,"Plan / Cuenta",f.plan);
  const sub = Number(f.subtotal||f.monto||0);
  const iva = Number(f.ivaAmt||f.iva||0);
  const tot = Number(f.total||sub+iva||0);
  autoTable(pdf,{
    startY:84,
    head:[["Descripción del servicio","Plan","Importe"]],
    body:[[f.servicio||"Servicio de logística",f.plan||"—",mxMoney(sub)]],
    theme:"grid",
    headStyles:{fillColor:[12,24,41],textColor:255,fontSize:9,fontStyle:"bold"},
    bodyStyles:{fontSize:10},
    columnStyles:{2:{halign:"right",fontStyle:"bold"}},
    margin:{left:14,right:14},
  });
  let y = pdf.lastAutoTable.finalY+8;
  const totX = 120;
  pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.setTextColor(96,112,128);
  pdf.text("Subtotal",totX,y); pdf.setTextColor(12,24,41);
  pdf.text(mxMoney(sub),196,y,{align:"right"}); y+=6;
  pdf.setTextColor(96,112,128); pdf.text("IVA 16%",totX,y);
  pdf.setTextColor(12,24,41); pdf.text(mxMoney(iva),196,y,{align:"right"}); y+=3;
  pdf.setDrawColor(249,115,22); pdf.setLineWidth(0.6); pdf.line(totX,y,196,y); y+=7;
  pdf.setFont("helvetica","bold");pdf.setFontSize(14);pdf.setTextColor(249,115,22);
  pdf.text("TOTAL",totX,y); pdf.text(mxMoney(tot),196,y,{align:"right"});
  if(f.notas){
    y+=12; pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.setTextColor(96,112,128);
    pdf.text("Notas: "+f.notas,14,y,{maxWidth:182});
  }
  pdfFooter(pdf);
  pdf.save("Factura_"+slug(f.folio||f.empresa)+".pdf");
}

function downloadRutaPDF(r){
  const pdf = new jsPDF({unit:"mm",format:"a4"});
  pdfHeader(pdf,"RUTA",r.folio||r.id,r.status||"Programada");
  pdfLabelValue(pdf,14,56,"Nombre de ruta",r.nombre);
  pdfLabelValue(pdf,110,56,"Cliente",r.cliente);
  pdfLabelValue(pdf,14,70,"Vehículo",r.vehiculoLabel);
  pdfLabelValue(pdf,110,70,"Paradas",String((r.stops||[]).length));
  autoTable(pdf,{
    startY:84,
    head:[["#","Ciudad","PDVs","Km"]],
    body:(r.stops||[]).map((s,i)=>[i+1,s.city||"—",s.pdv||0,(s.km||0).toLocaleString("es-MX")]),
    theme:"striped",
    headStyles:{fillColor:[12,24,41],textColor:255,fontSize:9},
    bodyStyles:{fontSize:9},
    margin:{left:14,right:14},
  });
  let y = pdf.lastAutoTable.finalY+8;
  autoTable(pdf,{
    startY:y,
    head:[["Concepto","Valor"]],
    body:[
      ["Vans",String(r.vans||1)],
      ["Días de operación",String(r.diasOp||"—")],
      ["Personal",String(r.crew||"—")],
      ["Total PDVs",(r.totalPDV||0).toLocaleString("es-MX")],
      ["Kilómetros ~",(r.totalKm||0).toLocaleString("es-MX")],
      ["Tarifa transporte",mxMoney(r.tarifaT||0)],
      ["Viáticos",mxMoney(r.xViat||0)],
      ["Subtotal",mxMoney(r.sub||0)],
      ["IVA 16%",mxMoney(r.iva||0)],
      ["TOTAL",mxMoney(r.total||0)],
    ],
    theme:"grid",
    headStyles:{fillColor:[124,58,237],textColor:255,fontSize:9},
    bodyStyles:{fontSize:10},
    columnStyles:{1:{halign:"right",fontStyle:"bold"}},
    margin:{left:14,right:14},
  });
  pdfFooter(pdf);
  pdf.save("Ruta_"+slug(r.nombre||r.folio)+".pdf");
}

function downloadPresupuestoPDF(p){
  const pdf = new jsPDF({unit:"mm",format:"a4"});
  pdfHeader(pdf,"PRESUPUESTO",p.folio,(p.status||"Borrador").toUpperCase());
  pdfLabelValue(pdf,14,56,"Cliente",p.cliente);
  pdfLabelValue(pdf,110,56,"Contacto",p.contacto);
  pdfLabelValue(pdf,14,70,"Fecha",p.fecha);
  pdfLabelValue(pdf,110,70,"Vigencia",p.vigencia);
  autoTable(pdf,{
    startY:84,
    head:[["#","Concepto","Cant.","P. Unit.","Importe"]],
    body:(p.conceptos||[]).map((c,i)=>[
      i+1, c.desc||"—", c.cant||0, mxMoney(c.precio||0), mxMoney((c.cant||0)*(c.precio||0))
    ]),
    theme:"grid",
    headStyles:{fillColor:[12,24,41],textColor:255,fontSize:9,fontStyle:"bold"},
    bodyStyles:{fontSize:10},
    columnStyles:{0:{halign:"center",cellWidth:10},2:{halign:"center",cellWidth:18},3:{halign:"right",cellWidth:32},4:{halign:"right",fontStyle:"bold",cellWidth:34}},
    margin:{left:14,right:14},
  });
  let y = pdf.lastAutoTable.finalY+8;
  const totX = 120;
  const sub = Number(p.subtotal||0);
  const iva = Number(p.ivaAmt||0);
  const tot = Number(p.total||0);
  pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.setTextColor(96,112,128);
  pdf.text("Subtotal",totX,y); pdf.setTextColor(12,24,41);
  pdf.text(mxMoney(sub),196,y,{align:"right"}); y+=6;
  pdf.setTextColor(96,112,128); pdf.text("IVA 16%",totX,y);
  pdf.setTextColor(12,24,41); pdf.text(mxMoney(iva),196,y,{align:"right"}); y+=3;
  pdf.setDrawColor(249,115,22); pdf.setLineWidth(0.6); pdf.line(totX,y,196,y); y+=7;
  pdf.setFont("helvetica","bold");pdf.setFontSize(14);pdf.setTextColor(249,115,22);
  pdf.text("TOTAL",totX,y); pdf.text(mxMoney(tot),196,y,{align:"right"});
  if(p.notas){
    y+=12; pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.setTextColor(96,112,128);
    pdf.text("Notas: "+p.notas,14,y,{maxWidth:182});
  }
  pdfFooter(pdf);
  pdf.save("Presupuesto_"+slug(p.folio||p.cliente)+".pdf");
}

function exportXLSX(rows, filename, sheetName="Datos"){
  if(!rows || rows.length===0){ alert("No hay datos para exportar"); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const cols = Object.keys(rows[0]||{}).map(k=>({wch: Math.max(k.length+2, 14)}));
  ws["!cols"] = cols;
  XLSX.writeFile(wb, filename);
}

// ───── XLSX helpers: currency format + cell styling ─────
const MONEY_FMT = '"$"#,##0.00';
const INT_FMT = '#,##0';
function setCurrency(ws, addr){
  if(ws[addr]) ws[addr].z = MONEY_FMT;
}
function setRange(ws, cols, startRow, endRow, fmt){
  for(let r=startRow;r<=endRow;r++){
    for(const c of cols){
      const addr = XLSX.utils.encode_cell({r,c});
      if(ws[addr]) ws[addr].z = fmt;
    }
  }
}
// Build a 2D array sheet with totals rows, formatted money columns, proper widths
function buildAOA(header, rows){
  return [header, ...rows];
}

// ═══════ REPORTE EJECUTIVO DE FACTURACIÓN ═══════
// Genera un Excel con 5 hojas: Resumen, Por Mes, Por Cliente, Detalle Completo, Filtros
function exportFacturasXLSX(facts, mesFiltro){
  if(!facts || facts.length===0){alert("No hay facturas para exportar");return;}
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const wb = XLSX.utils.book_new();
  const fechaReporte = new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"});
  const anio = new Date().getFullYear();

  // ──────── HOJA 1: RESUMEN EJECUTIVO ────────
  const totalFact = facts.reduce((a,f)=>a+Number(f.total||0),0);
  const totalSub  = facts.reduce((a,f)=>a+Number(f.subtotal||f.monto||0),0);
  const totalIVA  = facts.reduce((a,f)=>a+Number(f.ivaAmt||f.iva||0),0);
  const cobrado   = facts.filter(f=>f.status==="Pagada").reduce((a,f)=>a+Number(f.total||0),0);
  const pendiente = facts.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+Number(f.total||0),0);
  const vencido   = facts.filter(f=>f.status==="Vencida").reduce((a,f)=>a+Number(f.total||0),0);

  const resumen = [
    ["DMVIMIENTO — REPORTE EJECUTIVO DE FACTURACIÓN"],
    ["Generado: "+fechaReporte+(mesFiltro?"  ·  Mes filtrado: "+mesFiltro:"")],
    [],
    ["INDICADORES GENERALES"],
    ["Total de facturas",       facts.length],
    ["Subtotal acumulado",      totalSub],
    ["IVA acumulado (16%)",     totalIVA],
    ["TOTAL FACTURADO",         totalFact],
    [],
    ["ESTADO DE PAGOS"],
    ["Cobrado (pagadas)",       cobrado],
    ["Por cobrar (pendientes)", pendiente],
    ["Vencido",                 vencido],
    ["% de cobranza",           totalFact>0?Math.round(cobrado/totalFact*100)/100:0],
    [],
    ["FACTURAS POR ESTADO"],
    ["Pagadas",    facts.filter(f=>f.status==="Pagada").length],
    ["Pendientes", facts.filter(f=>f.status==="Pendiente").length],
    ["Vencidas",   facts.filter(f=>f.status==="Vencida").length],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(resumen);
  ws1["!cols"] = [{wch:35},{wch:22}];
  ws1["!merges"] = [{s:{r:0,c:0},e:{r:0,c:1}},{s:{r:1,c:0},e:{r:1,c:1}},{s:{r:3,c:0},e:{r:3,c:1}},{s:{r:9,c:0},e:{r:9,c:1}},{s:{r:15,c:0},e:{r:15,c:1}}];
  // Format money cells
  ["B6","B7","B8","B11","B12","B13"].forEach(a=>setCurrency(ws1,a));
  if(ws1["B14"]) ws1["B14"].z = "0%";
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen");

  // ──────── HOJA 2: POR MES ────────
  const porMesData = [];
  porMesData.push(["Mes","# Facturas","Subtotal","IVA 16%","Total","Cobrado","Pendiente","Vencido","% Cobrado"]);
  let gFac=0,gSub=0,gIva=0,gCob=0,gPen=0,gVen=0,gCount=0;
  MESES.forEach(m=>{
    const its = facts.filter(f=>f.mesOp===m);
    if(its.length===0) return;
    const sub = its.reduce((a,f)=>a+Number(f.subtotal||f.monto||0),0);
    const iva = its.reduce((a,f)=>a+Number(f.ivaAmt||f.iva||0),0);
    const tot = its.reduce((a,f)=>a+Number(f.total||0),0);
    const cob = its.filter(f=>f.status==="Pagada").reduce((a,f)=>a+Number(f.total||0),0);
    const pen = its.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+Number(f.total||0),0);
    const ven = its.filter(f=>f.status==="Vencida").reduce((a,f)=>a+Number(f.total||0),0);
    porMesData.push([m+" "+anio,its.length,sub,iva,tot,cob,pen,ven,tot>0?cob/tot:0]);
    gFac+=tot;gSub+=sub;gIva+=iva;gCob+=cob;gPen+=pen;gVen+=ven;gCount+=its.length;
  });
  porMesData.push([]);
  porMesData.push(["TOTAL ANUAL "+anio,gCount,gSub,gIva,gFac,gCob,gPen,gVen,gFac>0?gCob/gFac:0]);
  const ws2 = XLSX.utils.aoa_to_sheet(porMesData);
  ws2["!cols"] = [{wch:14},{wch:11},{wch:16},{wch:14},{wch:16},{wch:16},{wch:16},{wch:14},{wch:11}];
  const lastRow2 = porMesData.length;
  setRange(ws2,[2,3,4,5,6,7],1,lastRow2-1,MONEY_FMT);
  for(let r=1;r<lastRow2;r++){
    const a = XLSX.utils.encode_cell({r,c:8});
    if(ws2[a]) ws2[a].z = "0.0%";
  }
  ws2["!freeze"] = {xSplit:0,ySplit:1};
  XLSX.utils.book_append_sheet(wb, ws2, "Por Mes");

  // ──────── HOJA 3: POR CLIENTE ────────
  const byClient = {};
  facts.forEach(f=>{
    const k = (f.empresa||f.cliente||"—").trim();
    if(!byClient[k]) byClient[k] = {count:0,sub:0,iva:0,tot:0,cob:0,pen:0};
    byClient[k].count++;
    byClient[k].sub += Number(f.subtotal||f.monto||0);
    byClient[k].iva += Number(f.ivaAmt||f.iva||0);
    byClient[k].tot += Number(f.total||0);
    if(f.status==="Pagada") byClient[k].cob += Number(f.total||0);
    if(f.status==="Pendiente") byClient[k].pen += Number(f.total||0);
  });
  const clientData = [["Cliente","# Facturas","Subtotal","IVA 16%","Total","Cobrado","Pendiente","% Part."]];
  const ordered = Object.entries(byClient).sort((a,b)=>b[1].tot-a[1].tot);
  ordered.forEach(([name,v])=>{
    clientData.push([name,v.count,v.sub,v.iva,v.tot,v.cob,v.pen,gFac>0?v.tot/gFac:0]);
  });
  clientData.push([]);
  clientData.push(["TOTAL GENERAL",gCount,gSub,gIva,gFac,gCob,gPen,1]);
  const ws3 = XLSX.utils.aoa_to_sheet(clientData);
  ws3["!cols"] = [{wch:32},{wch:11},{wch:16},{wch:14},{wch:16},{wch:16},{wch:16},{wch:10}];
  setRange(ws3,[2,3,4,5,6],1,clientData.length-1,MONEY_FMT);
  for(let r=1;r<clientData.length;r++){
    const a = XLSX.utils.encode_cell({r,c:7});
    if(ws3[a]) ws3[a].z = "0.00%";
  }
  ws3["!freeze"] = {xSplit:0,ySplit:1};
  XLSX.utils.book_append_sheet(wb, ws3, "Por Cliente");

  // ──────── HOJA 4: DETALLE POR MES (agrupado) ────────
  const detailGrouped = [["#","Folio","Fecha","Cliente","Solicitante","Plan","Servicio","Subtotal","IVA","Total","Estado","Notas"]];
  let idx = 1;
  MESES.forEach(m=>{
    const its = facts.filter(f=>f.mesOp===m).sort((a,b)=>(a.folio||"").localeCompare(b.folio||""));
    if(its.length===0) return;
    // Section header row
    detailGrouped.push(["▼ "+m.toUpperCase()+" "+anio+" — "+its.length+" factura(s)","","","","","","","","","","",""]);
    let mSub=0,mIva=0,mTot=0;
    its.forEach(f=>{
      const sub = Number(f.subtotal||f.monto||0);
      const iva = Number(f.ivaAmt||f.iva||0);
      const tot = Number(f.total||0);
      mSub+=sub;mIva+=iva;mTot+=tot;
      detailGrouped.push([idx++,f.folio||"",m+" "+(f.anio||anio),f.empresa||f.cliente||"",f.solicitante||"",f.plan||"",f.servicio||"",sub,iva,tot,f.status||"Pendiente",f.notas||""]);
    });
    // Subtotal row
    detailGrouped.push(["","","","Subtotal "+m,"","","",mSub,mIva,mTot,"",""]);
    detailGrouped.push([]);
  });
  // Grand total
  detailGrouped.push(["","","","GRAN TOTAL","","","",gSub,gIva,gFac,"",""]);
  const ws4 = XLSX.utils.aoa_to_sheet(detailGrouped);
  ws4["!cols"] = [{wch:5},{wch:16},{wch:11},{wch:28},{wch:20},{wch:18},{wch:40},{wch:14},{wch:12},{wch:14},{wch:12},{wch:30}];
  setRange(ws4,[7,8,9],1,detailGrouped.length,MONEY_FMT);
  ws4["!freeze"] = {xSplit:0,ySplit:1};
  XLSX.utils.book_append_sheet(wb, ws4, "Detalle por Mes");

  // ──────── HOJA 5: DETALLE COMPLETO (plano, filtrable) ────────
  const flatSorted = [...facts].sort((a,b)=>{
    const mi = MESES.indexOf(a.mesOp||"")-MESES.indexOf(b.mesOp||"");
    return mi!==0?mi:(a.folio||"").localeCompare(b.folio||"");
  });
  const detailFlat = [["Folio","Mes","Año","Cliente","Solicitante","Plan","Servicio","Subtotal","IVA 16%","Total","Estado","Notas"]];
  flatSorted.forEach(f=>{
    detailFlat.push([f.folio||"",f.mesOp||"",f.anio||anio,f.empresa||f.cliente||"",f.solicitante||"",f.plan||"",f.servicio||"",Number(f.subtotal||f.monto||0),Number(f.ivaAmt||f.iva||0),Number(f.total||0),f.status||"Pendiente",f.notas||""]);
  });
  detailFlat.push([]);
  detailFlat.push(["TOTAL","","","","","","",gSub,gIva,gFac,"",""]);
  const ws5 = XLSX.utils.aoa_to_sheet(detailFlat);
  ws5["!cols"] = [{wch:16},{wch:6},{wch:7},{wch:28},{wch:20},{wch:18},{wch:40},{wch:14},{wch:12},{wch:14},{wch:12},{wch:30}];
  setRange(ws5,[7,8,9],1,detailFlat.length,MONEY_FMT);
  ws5["!freeze"] = {xSplit:0,ySplit:1};
  ws5["!autofilter"] = {ref:"A1:L"+(flatSorted.length+1)};
  XLSX.utils.book_append_sheet(wb, ws5, "Detalle Completo");

  // Descargar
  const mesTag = mesFiltro?"_"+mesFiltro:"";
  XLSX.writeFile(wb, `DMOV_Facturacion${mesTag}_${anio}.xlsx`);
}

// Alias para mantener compatibilidad
function exportFinancierosXLSX(facts){
  exportFacturasXLSX(facts, null);
}

function exportRutasXLSX(rutas){
  const rows = rutas.map(r=>({
    Nombre: r.nombre||"",
    Cliente: r.cliente||"",
    Vehículo: r.vehiculoLabel||"",
    Paradas: (r.stops||[]).length,
    "Total PDVs": r.totalPDV||0,
    "Km ~": r.totalKm||0,
    Vans: r.vans||1,
    Días: r.diasOp||0,
    Personal: r.crew||0,
    Viáticos: r.xViat||0,
    Subtotal: r.sub||0,
    IVA: r.iva||0,
    Total: r.total||0,
    Estado: r.status||"Programada",
  }));
  exportXLSX(rows,"Rutas_"+new Date().getFullYear()+".xlsx","Rutas");
}

function exportPresupuestosXLSX(list){
  const rows = list.map(p=>({
    Folio: p.folio||"",
    Cliente: p.cliente||"",
    Contacto: p.contacto||"",
    Fecha: p.fecha||"",
    Vigencia: p.vigencia||"",
    Conceptos: (p.conceptos||[]).length,
    Subtotal: Number(p.subtotal||0),
    IVA: Number(p.ivaAmt||0),
    Total: Number(p.total||0),
    Estado: p.status||"Borrador",
  }));
  exportXLSX(rows,"Presupuestos_"+new Date().getFullYear()+".xlsx","Presupuestos");
}

/* ─── ATOMS ──────────────────────────────────────────────────────────────── */
function Tag({color=A,children,sm}){
  return <span style={{background:color+"16",color,border:"1px solid "+color+"28",borderRadius:20,padding:sm?"2px 8px":"3px 12px",fontSize:sm?10:11,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;
}
function RowItem({l,v,c=TEXT,bold}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid "+BORDER}}>
      <span style={{fontSize:12,color:MUTED}}>{l}</span>
      <span style={{fontFamily:MONO,fontSize:bold?15:13,fontWeight:bold?800:700,color:c}}>{v}</span>
    </div>
  );
}
function KpiCard({icon:Icon,color,label,value,sub,onClick,trend}){
  return(
    <div onClick={onClick} className="ch au" style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:16,padding:"20px 22px",cursor:onClick?"pointer":"default",boxShadow:"0 1px 4px rgba(12,24,41,.05)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div style={{width:38,height:38,borderRadius:11,background:color+"14",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon size={17} color={color}/></div>
        {trend!==undefined&&<span style={{fontSize:11,fontWeight:700,color:trend>=0?GREEN:ROSE}}>{trend>=0?"+":""}{trend}%</span>}
      </div>
      <div style={{fontFamily:MONO,fontSize:26,fontWeight:700,color:TEXT,lineHeight:1,marginBottom:4}}>{value}</div>
      <div style={{fontSize:12,fontWeight:600,color:MUTED}}>{label}</div>
      {sub&&<div style={{fontSize:11,color:MUTED+"90",marginTop:2}}>{sub}</div>}
    </div>
  );
}
function Toast({msg,type,onClose}){
  useEffect(()=>{const t=setTimeout(()=>onClose&&onClose(),3800);return()=>clearTimeout(t);},[]);
  const c=type==="err"?ROSE:type==="warn"?AMBER:GREEN;
  return(
    <div className="pi" style={{position:"fixed",top:20,right:24,zIndex:9999,background:"#fff",border:"1px solid "+c+"38",borderRadius:14,padding:"12px 18px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 8px 40px rgba(0,0,0,.15)",fontSize:13,minWidth:260,maxWidth:400}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0,boxShadow:"0 0 8px "+c}}/>
      <span style={{flex:1}}>{msg}</span>
      <button onClick={onClose} className="btn" style={{color:MUTED,padding:2}}><X size={13}/></button>
    </div>
  );
}
/* BarcodeQuickScan: escanea códigos de barras / QR con la cámara.
   Usa la Barcode Detection API nativa cuando está disponible (Chrome mobile, Edge).
   Fallback: permite input manual del código. */
function BarcodeQuickScan({onScan}){
  const [scanning,setScanning]=useState(false);
  const [code,setCode]=useState("");
  const [manual,setManual]=useState(false);
  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const scanLoopRef=useRef(null);
  const supported = typeof window!=="undefined"&&"BarcodeDetector" in window;

  const start=async()=>{
    if(!supported){setManual(true);return;}
    setScanning(true);
    try{
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      streamRef.current = stream;
      if(videoRef.current){
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({formats:["qr_code","code_128","code_39","ean_13","ean_8","upc_a","upc_e","itf","pdf417"]});
      const tick = async()=>{
        if(!videoRef.current||!streamRef.current) return;
        try{
          const codes = await detector.detect(videoRef.current);
          if(codes&&codes[0]?.rawValue){
            const val = codes[0].rawValue;
            setCode(val);
            onScan(val);
            stop();
            return;
          }
        }catch(e){}
        scanLoopRef.current = requestAnimationFrame(tick);
      };
      scanLoopRef.current = requestAnimationFrame(tick);
    }catch(e){
      setScanning(false);
      setManual(true);
    }
  };
  const stop=()=>{
    if(scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    if(streamRef.current){
      streamRef.current.getTracks().forEach(t=>t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };
  useEffect(()=>()=>stop(),[]);

  if(code){
    return(
      <div style={{background:GREEN+"10",border:"1.5px solid "+GREEN+"40",borderRadius:10,padding:"10px 12px",marginBottom:11,display:"flex",alignItems:"center",gap:10}}>
        <div style={{fontSize:18}}>📦</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9,fontWeight:800,color:GREEN,letterSpacing:"0.05em",textTransform:"uppercase"}}>Código escaneado</div>
          <div style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{code}</div>
        </div>
        <button onClick={()=>{setCode("");setManual(false);}} className="btn" type="button" style={{color:MUTED,padding:4,border:"1px solid "+BD2,borderRadius:6,fontSize:10}}>Otro</button>
      </div>
    );
  }
  if(scanning){
    return(
      <div style={{border:"2px solid "+BLUE+"50",borderRadius:10,overflow:"hidden",marginBottom:11,position:"relative",background:"#000"}}>
        <video ref={videoRef} style={{width:"100%",height:180,objectFit:"cover",display:"block"}} playsInline muted/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
          <div style={{width:"70%",maxWidth:200,height:100,border:"3px solid #fff",borderRadius:10,boxShadow:"0 0 0 9999px rgba(0,0,0,.3)"}}/>
        </div>
        <button onClick={stop} type="button" className="btn" style={{position:"absolute",top:8,right:8,background:"rgba(12,24,41,.75)",color:"#fff",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700}}>Cancelar</button>
        <div style={{position:"absolute",bottom:8,left:0,right:0,textAlign:"center",color:"#fff",fontSize:11,textShadow:"0 1px 4px rgba(0,0,0,.8)"}}>Apunta al código del paquete</div>
      </div>
    );
  }
  if(manual){
    return(
      <div style={{marginBottom:11}}>
        <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Código del paquete (manual)</div>
        <div style={{display:"flex",gap:6}}>
          <input value={code} onChange={e=>setCode(e.target.value)} onBlur={()=>code&&onScan(code)} placeholder="Ej: ABC-12345" style={{flex:1,background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:13,fontFamily:MONO}}/>
          <button type="button" onClick={()=>setManual(false)} className="btn" style={{padding:"0 12px",border:"1px solid "+BD2,borderRadius:8,color:MUTED,fontSize:11}}>✕</button>
        </div>
      </div>
    );
  }
  return(
    <button type="button" onClick={start} className="btn" style={{width:"100%",padding:"10px 0",marginBottom:11,borderRadius:10,background:BLUE+"08",border:"1.5px dashed "+BLUE+"40",color:BLUE,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
      📱 Escanear código de paquete {!supported&&"(manual)"}
    </button>
  );
}

/* SignaturePad: firma digital con canvas (touch + mouse) — retorna dataURL PNG */
function SignaturePad({onChange,height=160,background="#fff",color="#0c1829"}){
  const canvasRef=useRef(null);
  const drawingRef=useRef(false);
  const lastPointRef=useRef(null);
  const hasDrawnRef=useRef(false);
  const [empty,setEmpty]=useState(true);

  useEffect(()=>{
    const c = canvasRef.current;
    if(!c) return;
    // Ajuste retina
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio||1;
    c.width = rect.width*dpr;
    c.height = rect.height*dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr,dpr);
    ctx.fillStyle = background;
    ctx.fillRect(0,0,rect.width,rect.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  },[background,color]);

  const getXY=(e)=>{
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches?.[0]||e.changedTouches?.[0];
    const clientX = touch?touch.clientX:e.clientX;
    const clientY = touch?touch.clientY:e.clientY;
    return {x:clientX-rect.left,y:clientY-rect.top};
  };

  const start=(e)=>{
    e.preventDefault();
    drawingRef.current=true;
    lastPointRef.current=getXY(e);
  };
  const move=(e)=>{
    if(!drawingRef.current) return;
    e.preventDefault();
    const p = getXY(e);
    const l = lastPointRef.current;
    if(!l){lastPointRef.current=p;return;}
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(l.x,l.y);
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
    lastPointRef.current=p;
    if(!hasDrawnRef.current){hasDrawnRef.current=true;setEmpty(false);}
  };
  const end=()=>{
    drawingRef.current=false;
    lastPointRef.current=null;
    if(onChange&&hasDrawnRef.current){
      try{onChange(canvasRef.current.toDataURL("image/png"));}catch(e){}
    }
  };

  const clear=()=>{
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = background;
    ctx.fillRect(0,0,rect.width,rect.height);
    hasDrawnRef.current=false;
    setEmpty(true);
    if(onChange) onChange("");
  };

  return(
    <div>
      <div style={{position:"relative",border:"1.5px solid "+BD2,borderRadius:10,overflow:"hidden",background}}>
        <canvas
          ref={canvasRef}
          style={{width:"100%",height,display:"block",touchAction:"none",cursor:"crosshair"}}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        {empty&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",color:MUTED,fontSize:12,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>✍ Firme aquí con el dedo</div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
        <div style={{fontSize:10,color:MUTED}}>{empty?"Firma requerida para confirmar":"✓ Firma capturada"}</div>
        {!empty&&<button onClick={clear} className="btn" type="button" style={{fontSize:10,color:ROSE,fontWeight:700,padding:"3px 8px",border:"1px solid "+ROSE+"40",borderRadius:6}}>Limpiar</button>}
      </div>
    </div>
  );
}

function Modal({title,onClose,children,wide,icon:Icon,iconColor=A}){
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  return(
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(12,24,41,.45)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div className="pi" style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:wide?760:490,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,.22)"}}>
        <div style={{display:"flex",alignItems:"center",gap:11,padding:"20px 24px",borderBottom:"1px solid "+BORDER,position:"sticky",top:0,background:"#fff",zIndex:10,borderRadius:"20px 20px 0 0"}}>
          {Icon&&<div style={{width:32,height:32,borderRadius:9,background:iconColor+"14",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={15} color={iconColor}/></div>}
          <span style={{fontFamily:DISP,fontWeight:700,fontSize:16,flex:1}}>{title}</span>
          <button onClick={onClose} className="btn" style={{width:28,height:28,borderRadius:"50%",border:"1px solid "+BD2,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED}}><X size={13}/></button>
        </div>
        <div style={{padding:"22px 24px"}}>{children}</div>
      </div>
    </div>
  );
}
function Inp({label,...p}){
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>}
      <input {...p}
        style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:14,transition:"border-color .13s",...p.style}}/>
    </div>
  );
}
function Sel({label,options,value,onChange}){
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>}
      <select value={value} onChange={onChange} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:14,cursor:"pointer"}}>
        {options.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
      </select>
    </div>
  );
}
function Txt({label,...p}){
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>}
      <textarea {...p} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:14,resize:"vertical",minHeight:75,...p.style}}/>
    </div>
  );
}
function Spin({label,value,onChange,min=0,max=9999,step=1}){
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>}
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={()=>onChange(Math.max(min,value-step))} className="btn" style={{width:30,height:30,borderRadius:8,border:"1.5px solid "+BD2,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED}}><Minus size={12}/></button>
        <input type="number" value={value} onChange={e=>onChange(Math.min(max,Math.max(min,Number(e.target.value)||min)))}
          style={{width:68,textAlign:"center",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"5px 0",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
        <button onClick={()=>onChange(Math.min(max,value+step))} className="btn" style={{width:30,height:30,borderRadius:8,border:"1.5px solid "+BD2,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED}}><Plus size={12}/></button>
      </div>
    </div>
  );
}
function Tog({checked,onChange,label,sub,color=A}){
  return(
    <button onClick={()=>onChange(!checked)} className="btn" style={{display:"flex",alignItems:"center",gap:11,padding:"10px 13px",borderRadius:11,border:"1.5px solid "+(checked?color:BD2),background:checked?color+"08":"#fff",cursor:"pointer",width:"100%",textAlign:"left",transition:"all .13s",boxShadow:checked?"0 0 0 3px "+color+"12":"none"}}>
      <div style={{width:19,height:19,borderRadius:"50%",border:"2px solid "+(checked?color:BD2),background:checked?color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .13s"}}>
        {checked&&<Check size={10} color="#fff"/>}
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:600,color:TEXT}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:MUTED,marginTop:1}}>{sub}</div>}
      </div>
    </button>
  );
}
function InfoBox({icon:Icon,color,title,value,sub}){
  return(
    <div style={{background:color+"0a",border:"1px solid "+color+"20",borderRadius:11,padding:"10px 13px",display:"flex",alignItems:"center",gap:9}}>
      <div style={{width:32,height:32,borderRadius:9,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={14} color={color}/></div>
      <div>
        <div style={{fontSize:10,color:MUTED,fontWeight:600}}>{title}</div>
        <div style={{fontFamily:MONO,fontWeight:700,fontSize:16,color,lineHeight:1.1}}>{value}</div>
        {sub&&<div style={{fontSize:10,color:MUTED,marginTop:2}}>{sub}</div>}
      </div>
    </div>
  );
}
// Normaliza texto (quita acentos + lowercase) para búsqueda tolerante
const normTxt = s => (s||"").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
// Aliases comunes que el usuario podría escribir pero no matchean el nombre oficial
const CITY_ALIASES = {
  "Ciudad de México": ["cdmx","df","distrito federal","ciudad mexico","mexico df","ciudad de mexico"],
  "Cd. Juárez":["juarez","ciudad juarez","cd juarez"],
  "Mérida":["merida","yucatan"],
  "León":["leon","leon gto","guanajuato"],
  "Querétaro":["queretaro","qro"],
  "Cancún":["cancun","quintana roo"],
  "San Luis Potosí":["san luis","slp","san luis potosi"],
  "Jalapa/Xalapa":["xalapa","jalapa","veracruz jalapa"],
  "Tuxtla":["tuxtla gutierrez","tuxtla gtz"],
};
function CitySearch({value,onChange,onSelect,veh,exclude=[]}){
  const [open,setOpen]=useState(false);
  const q = normTxt(value);
  // Cities that match the query (without exclude filter) — acentos insensibles + aliases
  const allMatches = TAR.filter(t=>{
    if(!q) return false;
    if(normTxt(t.c).includes(q)) return true;
    const aliases = CITY_ALIASES[t.c]||[];
    return aliases.some(a=>normTxt(a).includes(q));
  });
  const filt = allMatches.filter(t=>!exclude.includes(t.c));
  // Cities that match but are excluded (shown with greyed-out state + hint)
  const excludedMatches = allMatches.filter(t=>exclude.includes(t.c));
  const showDropdown = open && value && (filt.length>0 || excludedMatches.length>0);
  return(
    <div style={{position:"relative"}}>
      <div style={{position:"relative"}}>
        <Search size={13} color={MUTED} style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
        <input value={value} onChange={e=>{onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),200)}
          placeholder={"Busca entre "+TAR.length+" destinos (CDMX, Monterrey, Guadalajara…)"}
          style={{width:"100%",paddingLeft:32,paddingRight:12,paddingTop:10,paddingBottom:10,background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,fontSize:14}}/>
      </div>
      {showDropdown&&(
        <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,right:0,background:"#fff",border:"1.5px solid "+BD2,borderRadius:13,zIndex:300,maxHeight:260,overflowY:"auto",boxShadow:"0 16px 50px rgba(0,0,0,.14)"}}>
          {filt.slice(0,12).map(t=>(
            <button key={t.c} onMouseDown={()=>{onSelect(t);setOpen(false);onChange("");}} className="btn fr"
              style={{width:"100%",display:"flex",alignItems:"center",gap:11,padding:"9px 14px",borderBottom:"1px solid "+BORDER,background:"transparent",cursor:"pointer"}}>
              <MapPin size={11} color={A}/>
              <div style={{flex:1,textAlign:"left"}}>
                <div style={{fontWeight:600,fontSize:13}}>{t.c}</div>
                <div style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{t.km.toLocaleString()} km · {Math.ceil(t.km/KM_DIA)} día(s)</div>
              </div>
              {veh&&<span style={{fontFamily:MONO,fontSize:12,color:A,fontWeight:700}}>{fmt(t[veh])}</span>}
            </button>
          ))}
          {excludedMatches.length>0&&<div style={{padding:"10px 14px",background:AMBER+"08",borderTop:filt.length>0?"1px solid "+AMBER+"30":"none"}}>
            <div style={{fontSize:10,fontWeight:700,color:AMBER,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>⚠ Ya agregada en esta lista</div>
            {excludedMatches.slice(0,3).map(t=>(
              <div key={t.c} style={{fontSize:12,color:MUTED,padding:"3px 0"}}>📍 {t.c} <span style={{color:AMBER,fontSize:10,fontWeight:600}}>· Búscala en la otra sección (destino/origen) para agregarla ahí también</span></div>
            ))}
          </div>}
        </div>
      )}
    </div>
  );
}
function EmptyState({icon:Icon=Package,title="Sin datos",sub="",action,actionLabel="Crear",color=A}){
  return(
    <div className="au" style={{padding:"48px 24px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
      <div style={{width:56,height:56,borderRadius:16,background:color+"10",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}><Icon size={24} color={color}/></div>
      <div style={{fontFamily:DISP,fontWeight:700,fontSize:16,color:TEXT}}>{title}</div>
      {sub&&<div style={{fontSize:13,color:MUTED,maxWidth:300}}>{sub}</div>}
      {action&&<button onClick={action} className="btn" style={{marginTop:4,display:"flex",alignItems:"center",gap:7,background:"linear-gradient(135deg,"+color+","+color+"cc)",color:"#fff",borderRadius:11,padding:"10px 20px",fontWeight:700,fontSize:13,boxShadow:"0 4px 16px "+color+"30"}}><Plus size={14}/>{actionLabel}</button>}
    </div>
  );
}
function Skeleton({w="100%",h=16,r=8}){
  return <div className="skel" style={{width:w,height:h,borderRadius:r}}/>;
}
function SkeletonRows({n=5}){
  return <div style={{display:"flex",flexDirection:"column",gap:10,padding:16}}>{Array.from({length:n}).map((_,i)=><div key={i} style={{display:"flex",gap:12,alignItems:"center"}}><Skeleton w={40} h={40} r={10}/><div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}><Skeleton h={12} w="60%"/><Skeleton h={10} w="40%"/></div><Skeleton w={80} h={14}/></div>)}</div>;
}
function TopBar({view,setView,sidebarOpen,setSidebarOpen,setSearchOpen}){
  const nav=NAV_SECTIONS.flatMap(s=>s.items);
  const cur=nav.find(n=>n.id===view)||{label:"Dashboard",icon:LayoutDashboard};
  const Icon=cur.icon;
  return(
    <div className="glass noprint" style={{position:"sticky",top:0,zIndex:100,height:56,display:"flex",alignItems:"center",gap:14,padding:"0 28px",borderBottom:"1px solid "+BORDER+"80"}}>
      <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="btn" style={{display:"none",width:36,height:36,borderRadius:10,border:"1px solid "+BD2,alignItems:"center",justifyContent:"center",color:MUTED,flexShrink:0}} id="hamburger"><Menu size={18}/></button>
      <div style={{display:"flex",alignItems:"center",gap:9,flex:"0 0 auto"}}>
        <div style={{width:30,height:30,borderRadius:9,background:A+"12",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon size={15} color={A}/></div>
        <span style={{fontFamily:DISP,fontWeight:700,fontSize:15,color:TEXT}}>{cur.label}</span>
      </div>
      <button onClick={()=>setSearchOpen(true)} className="btn" style={{flex:1,maxWidth:420,margin:"0 auto",display:"flex",alignItems:"center",gap:10,padding:"8px 16px",borderRadius:11,border:"1.5px solid "+BD2,background:"#fff",cursor:"pointer"}}>
        <Search size={14} color={MUTED}/>
        <span style={{flex:1,textAlign:"left",fontSize:13,color:MUTED+"90"}}>Buscar en todo el sistema…</span>
        <span style={{fontSize:10,fontFamily:MONO,color:BD2,background:"#f5f7fc",padding:"2px 8px",borderRadius:6,fontWeight:700}}>⌘K</span>
      </button>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button onClick={()=>setView("cotizador")} className="btn hide-mobile" style={{display:"flex",alignItems:"center",gap:6,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:10,padding:"8px 16px",fontSize:12,fontWeight:700,boxShadow:"0 3px 12px "+A+"30"}}><Plus size={13}/>Cotizar</button>
        <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:12,color:"#fff",cursor:"default",flexShrink:0}}>DM</div>
      </div>
    </div>
  );
}
function SearchPalette({cots=[],facts=[],rutas=[],clientes=[],entregas=[],onSelect,onClose}){
  const [q,setQ]=useState("");
  const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  const results=useMemo(()=>{
    if(!q.trim()) return [];
    const lq=q.toLowerCase();
    const r=[];
    cots.filter(c=>(c.cliente||"").toLowerCase().includes(lq)||(c.folio||"").toLowerCase().includes(lq)||(c.destino||"").toLowerCase().includes(lq)).slice(0,4).forEach(c=>r.push({type:"cotizador",icon:DollarSign,label:c.cliente||c.folio,sub:c.destino||c.modoLabel||"",extra:fmt(c.total||0),color:A}));
    facts.filter(f=>(f.empresa||f.cliente||"").toLowerCase().includes(lq)||(f.folio||"").toLowerCase().includes(lq)||(f.servicio||"").toLowerCase().includes(lq)).slice(0,4).forEach(f=>r.push({type:"facturas",icon:FileText,label:f.empresa||f.cliente||f.folio,sub:f.servicio||"",extra:fmt(f.total||0),color:BLUE}));
    rutas.filter(rt=>(rt.nombre||"").toLowerCase().includes(lq)||(rt.cliente||"").toLowerCase().includes(lq)).slice(0,3).forEach(rt=>r.push({type:"rutas",icon:Map,label:rt.nombre,sub:rt.cliente||"",extra:fmt(rt.total||0),color:VIOLET}));
    clientes.filter(cl=>(cl.nombre||"").toLowerCase().includes(lq)||(cl.contacto||"").toLowerCase().includes(lq)||(cl.plan||"").toLowerCase().includes(lq)).slice(0,3).forEach(cl=>r.push({type:"clientes",icon:Building2,label:cl.nombre||"",sub:cl.plan||cl.contacto||"",color:BLUE}));
    entregas.filter(e=>(e.pdv||"").toLowerCase().includes(lq)||(e.dir||"").toLowerCase().includes(lq)).slice(0,3).forEach(e=>r.push({type:"entregas",icon:Package,label:e.pdv||"",sub:e.dir||"",color:GREEN}));
    return r;
  },[q,cots,facts,rutas,clientes,entregas]);
  return(
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(12,24,41,.5)",zIndex:600,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"15vh",backdropFilter:"blur(4px)"}}>
      <div className="pi" style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:540,boxShadow:"0 32px 80px rgba(0,0,0,.28)",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"16px 20px",borderBottom:"1px solid "+BORDER}}>
          <Search size={18} color={A}/>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cotizaciones, facturas, rutas, clientes…" style={{flex:1,border:"none",fontSize:15,fontFamily:SANS,background:"transparent"}}/>
          <button onClick={onClose} className="btn" style={{fontSize:10,fontFamily:MONO,color:MUTED,background:"#f5f7fc",padding:"3px 8px",borderRadius:6,fontWeight:700}}>ESC</button>
        </div>
        <div style={{maxHeight:360,overflowY:"auto"}}>
          {q.trim()&&results.length===0&&<div style={{padding:32,textAlign:"center",color:MUTED,fontSize:13}}>Sin resultados para "{q}"</div>}
          {results.map((r,i)=>(
            <button key={i} onClick={()=>{onSelect(r.type);onClose();}} className="btn fr" style={{width:"100%",display:"flex",alignItems:"center",gap:11,padding:"11px 20px",borderBottom:"1px solid "+BORDER+"60",cursor:"pointer",background:"transparent",textAlign:"left"}}>
              <div style={{width:32,height:32,borderRadius:9,background:r.color+"12",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><r.icon size={14} color={r.color}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
                {r.sub&&<div style={{fontSize:11,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sub}</div>}
              </div>
              {r.extra&&<span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:r.color,flexShrink:0}}>{r.extra}</span>}
              <ChevronRight size={12} color={BD2}/>
            </button>
          ))}
        </div>
        {!q.trim()&&<div style={{padding:"20px 24px",color:MUTED,fontSize:12,textAlign:"center"}}>Escribe para buscar en cotizaciones, facturas, rutas, clientes y entregas</div>}
      </div>
    </div>
  );
}
const ago=s=>{if(!s)return"";const d=Date.now()/1000-s;if(d<60)return"ahora";if(d<3600)return Math.floor(d/60)+"m";if(d<86400)return Math.floor(d/3600)+"h";return Math.floor(d/86400)+"d";};
/* AddressSearch: Mapbox Search Box API v1 (suggest + retrieve)
   — cobertura de POIs enormemente mejor que Geocoding v5 clásico.
   Flujo: user teclea → /suggest (sin coords, retorna mapbox_id) → user clica → /retrieve (coords) */
function AddressSearch({onSelect,placeholder="Buscar dirección, Walmart, etc.",proximity=null,bbox=null,cityHint="",compact=false}){
  const [q,setQ]=useState("");
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const [open,setOpen]=useState(false);
  const [authError,setAuthError]=useState(false);
  const [retrievingId,setRetrievingId]=useState(null);
  const timerRef=useRef(null);
  // session_token vive toda la vida del componente — Mapbox factura 1 request = 1 sesión (múltiples suggest + 1 retrieve)
  const sessionTokRef=useRef(null);
  if(!sessionTokRef.current){
    sessionTokRef.current=(crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
  }

  useEffect(()=>{
    if(!q||q.length<2){setResults([]);return;}
    if(!MAPBOX_TOKEN){console.warn("AddressSearch: MAPBOX_TOKEN ausente");return;}
    if(timerRef.current)clearTimeout(timerRef.current);
    timerRef.current=setTimeout(async()=>{
      setLoading(true);
      const prox = proximity?`&proximity=${proximity[0]},${proximity[1]}`:"";
      const bboxStr = bbox?`&bbox=${bbox.join(",")}`:"";
      const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&access_token=${MAPBOX_TOKEN}&session_token=${sessionTokRef.current}&country=MX&language=es&limit=10${prox}${bboxStr}`;
      try{
        const r = await fetch(url);
        if(!r.ok){
          const body = await r.text();
          console.warn("Mapbox SearchBox HTTP",r.status,body.slice(0,200));
          if(r.status===401||/invalid token/i.test(body)) setAuthError(true);
          setResults([]);setLoading(false);return;
        }
        setAuthError(false);
        const d = await r.json();
        setResults(d.suggestions||[]);
      }catch(e){console.warn("searchbox fetch",e);setResults([]);}
      setLoading(false);
    },220);
    return()=>{if(timerRef.current)clearTimeout(timerRef.current);};
  },[q,proximity,bbox]);

  const handlePick = async (s)=>{
    if(!s.mapbox_id){
      // Fallback si por algún motivo no hay mapbox_id (no debería pasar en v1)
      onSelect({name:s.name||q,address:s.full_address||s.place_formatted||"",lat:0,lng:0,category:s.feature_type||"",id:s.mapbox_id||uid()});
      setQ("");setResults([]);setOpen(false);return;
    }
    setRetrievingId(s.mapbox_id);
    try{
      const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(s.mapbox_id)}?access_token=${MAPBOX_TOKEN}&session_token=${sessionTokRef.current}&language=es`;
      const r = await fetch(url);
      const d = await r.json();
      const f = d.features?.[0];
      if(!f){setRetrievingId(null);return;}
      const [lng,lat] = f.geometry?.coordinates||[0,0];
      const nombre = f.properties?.name || s.name || q;
      const direccion = f.properties?.full_address || f.properties?.place_formatted || s.full_address || s.place_formatted || "";
      onSelect({name:nombre,address:direccion,lat,lng,category:f.properties?.feature_type||s.feature_type||"",id:s.mapbox_id});
      setQ("");setResults([]);setOpen(false);
      // Nueva sesión para la próxima búsqueda (buena práctica Mapbox)
      sessionTokRef.current=(crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
    }catch(e){console.warn("retrieve",e);}
    setRetrievingId(null);
  };

  return(
    <div style={{position:"relative"}}>
      <div style={{position:"relative"}}>
        <Search size={13} color={MUTED} style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
        <input value={q} onChange={e=>{setQ(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} placeholder={placeholder}
          style={{width:"100%",paddingLeft:32,paddingRight:32,paddingTop:compact?8:10,paddingBottom:compact?8:10,background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,fontSize:13}}/>
        {loading&&<div className="spin" style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",width:12,height:12,border:"2px solid "+BD2,borderTop:"2px solid "+A,borderRadius:"50%"}}/>}
        {q&&!loading&&<button onClick={()=>{setQ("");setResults([]);}} className="btn" style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:MUTED,padding:3}}><X size={12}/></button>}
      </div>
      {open&&results.length>0&&(
        <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,right:0,background:"#fff",border:"1.5px solid "+BD2,borderRadius:13,zIndex:300,maxHeight:340,overflowY:"auto",boxShadow:"0 16px 50px rgba(0,0,0,.14)"}}>
          {results.map(s=>{
            const isLoading = retrievingId===s.mapbox_id;
            const nombre = s.name || s.name_preferred || "";
            const direccion = s.full_address || s.place_formatted || s.address || "";
            const ftype = s.feature_type || s.poi_category?.[0] || "";
            return(
              <button key={s.mapbox_id||nombre+direccion} onMouseDown={e=>{e.preventDefault();handlePick(s);}} className="btn fr" disabled={isLoading}
                style={{width:"100%",display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",borderBottom:"1px solid "+BORDER,background:isLoading?"#f6f9ff":"transparent",cursor:isLoading?"wait":"pointer",textAlign:"left",opacity:isLoading?0.7:1}}>
                <MapPin size={13} color={A} style={{flexShrink:0,marginTop:2}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:12,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nombre}</div>
                  <div style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{direccion}</div>
                  {ftype&&ftype!=="address"&&<div style={{fontSize:9,color:VIOLET,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:2}}>{ftype.replace(/_/g," ")}</div>}
                </div>
                {isLoading&&<div className="spin" style={{width:12,height:12,border:"2px solid "+BD2,borderTop:"2px solid "+A,borderRadius:"50%",flexShrink:0,marginTop:2}}/>}
              </button>
            );
          })}
        </div>
      )}
      {open&&q.length>=3&&!loading&&results.length===0&&!authError&&(
        <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,right:0,background:"#fff",border:"1.5px solid "+BD2,borderRadius:13,zIndex:300,padding:14,fontSize:12,color:MUTED,textAlign:"center",boxShadow:"0 16px 50px rgba(0,0,0,.14)"}}>
          Sin resultados para "{q}"
        </div>
      )}
      {authError&&(
        <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,right:0,background:"#fff",border:"1.5px solid "+ROSE+"60",borderRadius:13,zIndex:300,padding:14,fontSize:12,color:ROSE,textAlign:"left",boxShadow:"0 16px 50px rgba(0,0,0,.14)"}}>
          <div style={{fontWeight:800,marginBottom:4}}>⚠ Token de Mapbox inválido</div>
          <div style={{color:MUTED,fontSize:11,lineHeight:1.4}}>La búsqueda de direcciones requiere un token válido. Configura <code style={{fontFamily:MONO,background:"#f5f7fc",padding:"1px 5px",borderRadius:4}}>VITE_MAPBOX_TOKEN</code> en Vercel → Settings → Environment Variables, redeploy, y recarga.</div>
        </div>
      )}
    </div>
  );
}

/* Reverse geocoding: lat/lng → dirección humana (Search Box API /reverse) */
async function reverseGeocode(lng,lat){
  if(!MAPBOX_TOKEN) return null;
  try{
    const url = `https://api.mapbox.com/search/searchbox/v1/reverse?longitude=${lng}&latitude=${lat}&access_token=${MAPBOX_TOKEN}&language=es&limit=1`;
    const r = await fetch(url);
    if(!r.ok) return null;
    const d = await r.json();
    const f = d.features?.[0];
    if(!f) return null;
    return {
      name: f.properties?.name || f.properties?.place_formatted || "Ubicación",
      address: f.properties?.full_address || f.properties?.place_formatted || "",
      lat, lng,
      category: f.properties?.feature_type || "",
      id: f.properties?.mapbox_id || `drop_${Date.now()}`,
    };
  }catch(e){console.warn("reverseGeocode",e);return null;}
}

/* LocationPicker: modal estilo Google Maps — buscador + lista + mapa interactivo
   - Resultados como pins clickeables en el mapa
   - Click en mapa → suelta pin manual con reverse geocoding
   - Drag de pin → actualiza dirección en vivo
   - Confirma y devuelve {name,address,lat,lng} al padre */
function LocationPicker({onClose,onSelect,initialQuery="",proximity=null,bbox=null,cityHint="",title="Agregar ubicación"}){
  const [q,setQ]=useState(initialQuery);
  const [suggestions,setSuggestions]=useState([]);
  const [loading,setLoading]=useState(false);
  const [selected,setSelected]=useState(null); // {name,address,lat,lng,id}
  const [hoverId,setHoverId]=useState(null);
  const [authError,setAuthError]=useState(false);
  const [mapReady,setMapReady]=useState(false);
  const mapCont=useRef(null);
  const mapRef=useRef(null);
  const markersRef=useRef({});
  const pickMarkerRef=useRef(null);
  const sessionTokRef=useRef(null);
  const timerRef=useRef(null);
  if(!sessionTokRef.current) sessionTokRef.current=(crypto?.randomUUID?.()||Date.now().toString(36));

  // Inicializa el mapa
  useEffect(()=>{
    if(!MAPBOX_TOKEN||!mapCont.current||mapRef.current) return;
    const center = proximity||(bbox?[(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2]:MX_CENTER);
    const m = new mapboxgl.Map({
      container: mapCont.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: bbox?10:5,
      attributionControl:false,
    });
    m.addControl(new mapboxgl.NavigationControl({showCompass:false}),"top-right");
    m.addControl(new mapboxgl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:false,showUserHeading:false}),"top-right");
    // Fit bbox if available
    if(bbox) m.fitBounds([[bbox[0],bbox[1]],[bbox[2],bbox[3]]],{padding:40,duration:0});
    // Click to drop pin
    m.on("click",async(e)=>{
      const {lng,lat} = e.lngLat;
      const place = await reverseGeocode(lng,lat) || {name:"Pin en el mapa",address:`${lat.toFixed(5)}, ${lng.toFixed(5)}`,lat,lng,id:`drop_${Date.now()}`};
      setSelected(place);
      setSuggestions([]);
    });
    m.on("load",()=>setMapReady(true));
    mapRef.current=m;
    return()=>{try{m.remove();}catch(e){}mapRef.current=null;};
  },[]);

  // Debounced suggest
  useEffect(()=>{
    if(!q||q.length<2){setSuggestions([]);return;}
    if(!MAPBOX_TOKEN)return;
    if(timerRef.current)clearTimeout(timerRef.current);
    timerRef.current=setTimeout(async()=>{
      setLoading(true);
      const prox = proximity?`&proximity=${proximity[0]},${proximity[1]}`:"";
      const bboxStr = bbox?`&bbox=${bbox.join(",")}`:"";
      const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&access_token=${MAPBOX_TOKEN}&session_token=${sessionTokRef.current}&country=MX&language=es&limit=10${prox}${bboxStr}`;
      try{
        const r = await fetch(url);
        if(!r.ok){
          const body = await r.text();
          if(r.status===401||/invalid token/i.test(body)) setAuthError(true);
          setSuggestions([]);setLoading(false);return;
        }
        setAuthError(false);
        const d = await r.json();
        setSuggestions(d.suggestions||[]);
      }catch(e){console.warn("picker suggest",e);setSuggestions([]);}
      setLoading(false);
    },220);
    return()=>{if(timerRef.current)clearTimeout(timerRef.current);};
  },[q,proximity,bbox]);

  // Cuando hay sugerencias, resolverlas todas en paralelo para ponerles pin en el mapa
  const [resolvedSugs,setResolvedSugs]=useState([]); // [{...sug, lng, lat}]
  useEffect(()=>{
    if(!suggestions.length){setResolvedSugs([]);return;}
    let cancelled=false;
    (async()=>{
      // Resolve up to 8 suggestions (retrieve coords). Mapbox no cobra las resoluciones preview separadamente.
      const resolved = await Promise.all(suggestions.slice(0,8).map(async s=>{
        if(!s.mapbox_id) return null;
        try{
          const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(s.mapbox_id)}?access_token=${MAPBOX_TOKEN}&session_token=${sessionTokRef.current}&language=es`;
          const r = await fetch(url);
          if(!r.ok) return null;
          const d = await r.json();
          const f = d.features?.[0];
          if(!f) return null;
          const [lng,lat] = f.geometry?.coordinates||[0,0];
          return {...s, lng, lat, fullAddr: f.properties?.full_address||f.properties?.place_formatted||s.place_formatted||""};
        }catch(e){return null;}
      }));
      if(!cancelled){
        const good = resolved.filter(Boolean);
        setResolvedSugs(good);
        // Fit bounds al conjunto de resultados
        if(good.length>0 && mapRef.current){
          const bnds = new mapboxgl.LngLatBounds();
          good.forEach(r=>bnds.extend([r.lng,r.lat]));
          try{mapRef.current.fitBounds(bnds,{padding:80,maxZoom:15,duration:600});}catch(e){}
        }
      }
    })();
    return()=>{cancelled=true;};
  },[suggestions]);

  // Renderiza pins de sugerencias
  useEffect(()=>{
    if(!mapReady||!mapRef.current) return;
    // Limpia
    Object.values(markersRef.current).forEach(m=>{try{m.remove();}catch(e){}});
    markersRef.current={};
    resolvedSugs.forEach((r,idx)=>{
      const el = document.createElement("div");
      el.style.cssText = `width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${A};box-shadow:0 4px 14px rgba(0,0,0,.3);border:2.5px solid #fff;cursor:pointer;display:flex;align-items:center;justify-content:center;`;
      el.innerHTML = `<span style="transform:rotate(45deg);color:#fff;font-weight:800;font-size:12px;font-family:${SANS}">${idx+1}</span>`;
      el.onmouseenter=()=>setHoverId(r.mapbox_id);
      el.onmouseleave=()=>setHoverId(null);
      el.onclick=(ev)=>{ev.stopPropagation();setSelected({name:r.name,address:r.fullAddr,lat:r.lat,lng:r.lng,id:r.mapbox_id,category:r.feature_type||""});};
      const m = new mapboxgl.Marker({element:el,anchor:"bottom"}).setLngLat([r.lng,r.lat]).addTo(mapRef.current);
      markersRef.current[r.mapbox_id]=m;
    });
  },[resolvedSugs,mapReady]);

  // Pin de selección (el elegido) - draggeable
  useEffect(()=>{
    if(!mapReady||!mapRef.current) return;
    if(pickMarkerRef.current){try{pickMarkerRef.current.remove();}catch(e){}pickMarkerRef.current=null;}
    if(!selected) return;
    const el = document.createElement("div");
    el.style.cssText = `width:42px;height:42px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${VIOLET};box-shadow:0 6px 20px rgba(0,0,0,.35);border:3px solid #fff;cursor:grab;display:flex;align-items:center;justify-content:center;`;
    el.innerHTML = `<span style="transform:rotate(45deg);color:#fff;font-weight:900;font-size:18px;">✓</span>`;
    const m = new mapboxgl.Marker({element:el,anchor:"bottom",draggable:true}).setLngLat([selected.lng,selected.lat]).addTo(mapRef.current);
    m.on("dragend",async()=>{
      const {lng,lat} = m.getLngLat();
      const place = await reverseGeocode(lng,lat) || {...selected,lat,lng,address:`${lat.toFixed(5)}, ${lng.toFixed(5)}`};
      setSelected(place);
    });
    mapRef.current.flyTo({center:[selected.lng,selected.lat],zoom:Math.max(mapRef.current.getZoom(),14),duration:600});
    pickMarkerRef.current=m;
  },[selected,mapReady]);

  const handleConfirm=()=>{
    if(!selected) return;
    onSelect({name:selected.name,address:selected.address,lat:selected.lat,lng:selected.lng,id:selected.id,category:selected.category||""});
    onClose();
  };

  return(
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(12,24,41,.55)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:24,backdropFilter:"blur(4px)"}}>
      <div className="pi" style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:1100,height:"82vh",maxHeight:720,boxShadow:"0 40px 90px rgba(0,0,0,.32)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 18px",borderBottom:"1px solid "+BORDER,flexShrink:0}}>
          <div style={{width:32,height:32,borderRadius:9,background:A+"14",display:"flex",alignItems:"center",justifyContent:"center"}}><MapPin size={16} color={A}/></div>
          <div style={{flex:1}}>
            <div style={{fontFamily:DISP,fontWeight:800,fontSize:15,color:TEXT}}>{title}</div>
            <div style={{fontSize:11,color:MUTED}}>{cityHint?`Buscar en ${cityHint} · `:""}Click en un pin o en el mapa para soltar un alfiler</div>
          </div>
          <button onClick={onClose} className="btn" style={{width:32,height:32,borderRadius:10,border:"1px solid "+BD2,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED}}><X size={16}/></button>
        </div>
        {/* Body */}
        <div style={{flex:1,display:"flex",minHeight:0}}>
          {/* Left panel: search + results */}
          <div style={{width:360,borderRight:"1px solid "+BORDER,display:"flex",flexDirection:"column",minHeight:0,flexShrink:0}}>
            <div style={{padding:"12px 14px",borderBottom:"1px solid "+BORDER,position:"relative"}}>
              <Search size={14} color={MUTED} style={{position:"absolute",left:24,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Walmart, Estadio, dirección…"
                style={{width:"100%",paddingLeft:34,paddingRight:32,paddingTop:10,paddingBottom:10,background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,fontSize:13}}/>
              {loading&&<div className="spin" style={{position:"absolute",right:22,top:"50%",transform:"translateY(-50%)",width:13,height:13,border:"2px solid "+BD2,borderTop:"2px solid "+A,borderRadius:"50%"}}/>}
            </div>
            <div style={{flex:1,overflowY:"auto",minHeight:0}}>
              {authError&&<div style={{padding:14,margin:12,background:ROSE+"10",border:"1.5px solid "+ROSE+"40",borderRadius:10,color:ROSE,fontSize:12,lineHeight:1.5}}>
                <div style={{fontWeight:800,marginBottom:4}}>⚠ Token inválido</div>
                Configura <code style={{fontFamily:MONO,background:"#fff",padding:"1px 5px",borderRadius:4}}>VITE_MAPBOX_TOKEN</code> en Vercel.
              </div>}
              {!q&&!selected&&<div style={{padding:"28px 20px",textAlign:"center",color:MUTED,fontSize:12,lineHeight:1.5}}>
                <Search size={24} color={BD2} style={{marginBottom:8}}/>
                <div style={{fontWeight:700,fontSize:13,color:TEXT,marginBottom:4}}>Buscar cualquier lugar de México</div>
                Escribe un nombre de negocio, dirección, colonia o punto de interés.
                <div style={{marginTop:14,padding:10,background:BLUE+"08",borderRadius:8,fontSize:11,color:BLUE,textAlign:"left"}}>
                  💡 <strong>Tip:</strong> También puedes hacer click en cualquier punto del mapa para soltar un pin manual.
                </div>
              </div>}
              {resolvedSugs.map((r,idx)=>(
                <button key={r.mapbox_id} onClick={()=>setSelected({name:r.name,address:r.fullAddr,lat:r.lat,lng:r.lng,id:r.mapbox_id,category:r.feature_type||""})} onMouseEnter={()=>setHoverId(r.mapbox_id)} onMouseLeave={()=>setHoverId(null)}
                  className="btn fr"
                  style={{width:"100%",display:"flex",alignItems:"flex-start",gap:10,padding:"11px 14px",borderBottom:"1px solid "+BORDER,background:hoverId===r.mapbox_id?A+"06":"transparent",textAlign:"left",cursor:"pointer"}}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:A,color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{idx+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                    <div style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>{r.fullAddr||r.place_formatted}</div>
                    {r.feature_type&&r.feature_type!=="address"&&<span style={{fontSize:9,color:VIOLET,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3,display:"inline-block"}}>{r.feature_type.replace(/_/g," ")}</span>}
                  </div>
                </button>
              ))}
              {q.length>=2&&!loading&&resolvedSugs.length===0&&!authError&&<div style={{padding:"30px 20px",textAlign:"center",color:MUTED,fontSize:12}}>
                Sin resultados para "{q}".<br/>Prueba otro término o haz click en el mapa.
              </div>}
            </div>
            {/* Selection preview */}
            {selected&&<div style={{padding:"12px 14px",borderTop:"2px solid "+VIOLET+"40",background:VIOLET+"06"}}>
              <div style={{fontSize:9,fontWeight:800,color:VIOLET,letterSpacing:"0.05em",marginBottom:4}}>✓ UBICACIÓN ELEGIDA (arrástrala en el mapa para ajustar)</div>
              <div style={{fontWeight:800,fontSize:13,color:TEXT,marginBottom:2,lineHeight:1.3}}>{selected.name}</div>
              <div style={{fontSize:11,color:MUTED,lineHeight:1.4,marginBottom:6}}>{selected.address}</div>
              <div style={{fontFamily:MONO,fontSize:10,color:MUTED,marginBottom:10}}>{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</div>
              <button onClick={handleConfirm} className="btn" style={{width:"100%",padding:"10px 14px",background:"linear-gradient(135deg,"+VIOLET+",#9d5cff)",color:"#fff",borderRadius:10,fontFamily:SANS,fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 4px 16px "+VIOLET+"40"}}>
                <Check size={14}/>Confirmar y agregar
              </button>
            </div>}
          </div>
          {/* Right panel: map */}
          <div style={{flex:1,position:"relative",minWidth:0}}>
            {!MAPBOX_TOKEN&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#f8f9fc",zIndex:10}}>
              <div style={{textAlign:"center",padding:40,maxWidth:400}}>
                <AlertCircle size={32} color={ROSE}/>
                <div style={{fontSize:14,fontWeight:800,color:ROSE,marginTop:10}}>Mapbox no configurado</div>
                <div style={{fontSize:12,color:MUTED,marginTop:6,lineHeight:1.5}}>Agrega la variable <code style={{fontFamily:MONO,background:"#fff",padding:"1px 5px",borderRadius:4,border:"1px solid "+BD2}}>VITE_MAPBOX_TOKEN</code> en Vercel y redeploy.</div>
              </div>
            </div>}
            <div ref={mapCont} style={{width:"100%",height:"100%"}}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniBar({pct,color=A,h=4}){
  return <div style={{background:BORDER,borderRadius:4,height:h,overflow:"hidden"}}><div style={{background:color,width:Math.min(100,pct)+"%",height:"100%",borderRadius:4,transition:"width .4s"}}/></div>;
}
/* ─── SIDEBAR ────────────────────────────────────────────────────────────── */
const NAV_SECTIONS=[
  {section:"CORE",items:[
    {id:"dashboard",    label:"Dashboard",     icon:LayoutDashboard},
    {id:"cotizador",    label:"Cotizador Pro", icon:DollarSign, badge:"★"},
    {id:"presupuestos", label:"Presupuestos",  icon:ClipboardList},
    {id:"prospeccion",  label:"Prospección",   icon:Target, badge:"NEW"},
  ]},
  {section:"OPERACIONES",items:[
    {id:"tracking", label:"Live Tracking",         icon:Radio, badge:"LIVE"},
    {id:"rutas",    label:"Planificador Rutas",    icon:Map},
    {id:"choferes", label:"Choferes",              icon:Users},
    {id:"nacional", label:"Proyectos Nacionales",  icon:Target},
    {id:"entregas", label:"Entregas",              icon:Package},
  ]},
  {section:"ADMINISTRACIÓN",items:[
    {id:"facturas", label:"Facturación",     icon:FileText},
    {id:"viaticos", label:"Viáticos & Gastos",icon:Zap},
    {id:"clientes", label:"Clientes",        icon:Building2},
  ]},
];
function Sidebar({view,setView,stats,open,setOpen}){
  const w=open?220:64;
  return(
    <aside className={"noprint sidebar-desktop"+(open?" open":"")} style={{width:w,flexShrink:0,background:"#0a1628",display:"flex",flexDirection:"column",minHeight:"100vh",padding:"0 "+(open?"10px":"6px")+" 16px",transition:"width .22s cubic-bezier(.22,1,.36,1),padding .22s",overflow:"hidden"}}>
      <div style={{padding:open?"20px 6px 14px":"20px 0 14px",borderBottom:"1px solid #ffffff14",marginBottom:6,display:"flex",alignItems:"center",gap:10,justifyContent:open?"flex-start":"center"}}>
        <div style={{width:36,height:36,borderRadius:11,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:15,color:"#fff",flexShrink:0}}>DM</div>
        {open&&<div><div style={{fontFamily:DISP,fontWeight:800,fontSize:14,color:"#fff",letterSpacing:"-0.02em",whiteSpace:"nowrap"}}>DMvimiento</div><div style={{fontSize:9,color:"#ffffff60",fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",whiteSpace:"nowrap"}}>LOGISTICS OS v2.1</div></div>}
      </div>
      {open&&<button onClick={()=>setOpen(false)} className="btn" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"1px solid #ffffff14",marginBottom:10,color:"#ffffff60",fontSize:11,whiteSpace:"nowrap"}}><Search size={12}/><span style={{flex:1,textAlign:"left"}}>Buscar… ⌘K</span></button>}
      <nav style={{flex:1,overflowY:"auto"}}>
        {NAV_SECTIONS.map(({section,items})=>(
          <div key={section} style={{marginBottom:8}}>
            {open&&<div style={{fontSize:9,fontWeight:800,color:"#ffffff30",letterSpacing:"0.12em",padding:"6px 10px 4px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{section}</div>}
            {items.map(({id,label,icon:Icon,badge})=>{
              const a=view===id;
              return(
                <button key={id} onClick={()=>setView(id)} className="btn" title={open?"":label} style={{width:"100%",display:"flex",alignItems:"center",gap:open?9:0,padding:open?"8px 10px":"8px 0",borderRadius:9,marginBottom:1,cursor:"pointer",transition:"all .15s",background:a?A+"22":"transparent",justifyContent:open?"flex-start":"center",position:"relative"}}>
                  {a&&<div style={{position:"absolute",left:0,top:"20%",bottom:"20%",width:3,borderRadius:4,background:A,transition:"all .15s"}}/>}
                  <Icon size={15} color={a?A:"#ffffff70"} strokeWidth={a?2.5:2}/>
                  {open&&<span style={{fontSize:12,fontWeight:a?700:500,color:a?A:"#ffffff90",flex:1,textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>}
                  {open&&badge&&<span style={{fontSize:8,fontWeight:800,background:a?A:badge==="NEW"?VIOLET:A,color:"#fff",borderRadius:6,padding:"1px 5px",letterSpacing:"0.05em"}}>{badge}</span>}
                  {!open&&a&&<div style={{position:"absolute",right:-2,width:5,height:5,borderRadius:"50%",background:A}}/>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{borderTop:"1px solid #ffffff14",paddingTop:10,marginTop:4}}>
        {open?<div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
          {[["",GREEN,"En línea",stats.fb],[stats.cot+"","#fff","cots",null],[stats.fac+"","#fff","facts",null]].map(([ic,c,l,blink])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
              {blink!==undefined&&<div className={blink?"pulse":""} style={{width:5,height:5,borderRadius:"50%",background:blink?GREEN:ROSE}}/>}
              <span style={{fontSize:9,color:"#ffffff50",fontFamily:MONO}}>{ic} {l}</span>
            </div>
          ))}
        </div>:<div style={{display:"flex",justifyContent:"center"}}><div className={stats.fb?"pulse":""} style={{width:6,height:6,borderRadius:"50%",background:stats.fb?GREEN:ROSE}}/></div>}
        <button onClick={()=>setOpen(!open)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 0",marginTop:8,borderRadius:8,border:"1px solid #ffffff10",color:"#ffffff50"}}>
          <ChevronLeft size={14} style={{transition:"transform .2s",transform:open?"":"rotate(180deg)"}}/>
          {open&&<span style={{fontSize:10,fontWeight:600}}>Colapsar</span>}
        </button>
      </div>
    </aside>
  );
}
/* ─── DASHBOARD ──────────────────────────────────────────────────────────── */
function Dashboard({setView,cots,facts,rutas,entregas,viat=[],clientes=[],prospectos=[]}){
  const totalFac=facts.reduce((a,f)=>a+(f.total||0),0);
  const cobrado=facts.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0);
  const pendiente=facts.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+(f.total||0),0);
  const pctCob=totalFac>0?Math.round(cobrado/totalFac*100):0;
  const totalGastos=viat.reduce((a,g)=>a+(g.monto||0),0);
  const margen=cobrado-totalGastos;
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const mesActual=MESES[new Date().getMonth()];
  const chartData=MESES.map(m=>{
    const mf=facts.filter(f=>f.mesOp===m);
    return {m,fac:mf.reduce((a,f)=>a+(f.total||0),0),cob:mf.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0)};
  });
  const maxV=Math.max(...chartData.map(d=>d.fac),1);
  const entregados=entregas.filter(e=>e.status==="Entregado").length;
  const rutasActivas=rutas.filter(r=>r.status==="En curso").length;
  const rutasProg=rutas.filter(r=>r.status==="Programada").length;
  const rutasComp=rutas.filter(r=>r.status==="Completada").length;
  const pctEnt=entregas.length>0?Math.round(entregados/entregas.length*100):0;
  const healthScore=Math.round((pctCob*.4)+(pctEnt*.3)+(rutas.length>0?(rutasComp/rutas.length*100*.3):30));
  const healthColor=healthScore>=70?GREEN:healthScore>=40?AMBER:ROSE;
  // Top clients
  const topClients=useMemo(()=>{
    const map={};facts.forEach(f=>{const k=f.empresa||f.cliente||"—";map[k]=(map[k]||0)+(f.total||0);});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
  },[facts]);
  const topMax=topClients[0]?topClients[0][1]:1;
  // Activity feed
  const feed=useMemo(()=>{
    const all=[];
    cots.slice(0,5).forEach(c=>all.push({icon:DollarSign,color:A,label:"Cotización "+((c.folio||"").slice(0,12)),sub:c.cliente||"",t:c.createdAt?.seconds||0,view:"cotizador"}));
    facts.slice(0,5).forEach(f=>all.push({icon:FileText,color:BLUE,label:"Factura "+(f.folio||"").slice(0,14),sub:f.empresa||"",t:f.createdAt?.seconds||0,view:"facturas"}));
    rutas.slice(0,3).forEach(r=>all.push({icon:Map,color:VIOLET,label:r.nombre||"Ruta",sub:r.cliente||"",t:r.createdAt?.seconds||0,view:"rutas"}));
    entregas.slice(0,3).forEach(e=>all.push({icon:Package,color:GREEN,label:e.pdv||"Entrega",sub:e.status||"",t:e.createdAt?.seconds||0,view:"entregas"}));
    return all.sort((a,b)=>b.t-a.t).slice(0,10);
  },[cots,facts,rutas,entregas]);
  const quickActions=[
    {icon:DollarSign,label:"Nueva cotización",color:A,v:"cotizador"},
    {icon:ClipboardList,label:"Nuevo presupuesto",color:VIOLET,v:"presupuestos"},
    {icon:Map,label:"Planificar ruta",color:BLUE,v:"rutas"},
    {icon:FileText,label:"Registrar factura",color:GREEN,v:"facturas"},
  ];

  return(
    <div className="slide-in" style={{flex:1,overflowY:"auto",padding:"24px 28px",background:"#f1f4fb"}}>
      <div className="au" style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <h1 style={{fontFamily:DISP,fontWeight:900,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Dashboard</h1>
            <p style={{color:MUTED,fontSize:13,marginTop:3}}>{new Date().toLocaleDateString("es-MX",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div className="ch" style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:13,padding:"10px 16px",display:"flex",alignItems:"center",gap:8,cursor:"default"}}>
              <div style={{width:36,height:36,borderRadius:10,background:healthColor+"14",display:"flex",alignItems:"center",justifyContent:"center"}}><Shield size={16} color={healthColor}/></div>
              <div><div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>Health Score</div><div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:healthColor,lineHeight:1}}>{healthScore}</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="g4 au2" style={{marginBottom:16}}>
        <KpiCard icon={DollarSign} color={A} label="Cotizaciones" value={cots.length} sub="total generadas" onClick={()=>setView("cotizador")}/>
        <KpiCard icon={TrendingUp} color={GREEN} label="Facturado total" value={fmtK(totalFac)} sub={pctCob+"% cobrado"} onClick={()=>setView("facturas")}/>
        <KpiCard icon={Clock} color={AMBER} label="Por cobrar" value={fmtK(pendiente)} sub={facts.filter(f=>f.status==="Pendiente").length+" facturas"} onClick={()=>setView("facturas")}/>
        <KpiCard icon={Zap} color={ROSE} label="Gastos operativos" value={fmtK(totalGastos)} sub={viat.length+" registros"} onClick={()=>setView("viaticos")}/>
      </div>
      <div className="g4" style={{marginBottom:16}}>
        <KpiCard icon={Package} color={BLUE} label="Entregas completadas" value={entregados+"/"+entregas.length} sub={pctEnt+"% completado"} onClick={()=>setView("entregas")}/>
        <KpiCard icon={Map} color={VIOLET} label="Rutas activas" value={rutasActivas} sub={rutas.length+" totales"} onClick={()=>setView("rutas")}/>
        <KpiCard icon={TrendingUp} color={margen>=0?GREEN:ROSE} label="Margen neto" value={fmtK(margen)} sub="cobrado - gastos"/>
        <KpiCard icon={Building2} color={BLUE} label="Clientes activos" value={clientes.length} sub="en la base" onClick={()=>setView("clientes")}/>
      </div>

      <div className="g2-side" style={{marginBottom:16}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Chart */}
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:16,padding:22}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div>
                <div style={{fontFamily:DISP,fontWeight:700,fontSize:15}}>Facturación mensual {new Date().getFullYear()}</div>
                <div style={{fontSize:11,color:MUTED,marginTop:2}}>Facturado vs cobrado</div>
              </div>
              <div style={{display:"flex",gap:12}}>
                {[[A,"Facturado"],[GREEN,"Cobrado"]].map(([c,l])=><div key={l} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:c}}/><span style={{fontSize:10,color:MUTED}}>{l}</span></div>)}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"flex-end",gap:4,height:130}}>
              {chartData.map(d=>(
                <div key={d.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  {d.fac>0&&<div style={{fontSize:7,fontFamily:MONO,color:d.m===mesActual?A:MUTED,fontWeight:700}}>{fmtK(d.fac)}</div>}
                  <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:95,position:"relative"}}>
                    <div style={{width:"100%",background:d.m===mesActual?A:A+"38",borderRadius:"3px 3px 0 0",height:d.fac>0?Math.max(5,Math.round(d.fac/maxV*100))+"%":"4px",minHeight:3,transition:"height .4s"}}/>
                    {d.cob>0&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:GREEN+"80",borderRadius:"3px 3px 0 0",height:Math.max(2,Math.round(d.cob/maxV*100))+"%"}}/>}
                  </div>
                  <div style={{fontSize:8,fontWeight:d.m===mesActual?800:500,color:d.m===mesActual?A:MUTED}}>{d.m}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Pipeline de rutas */}
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,padding:"16px 18px"}}>
            <div style={{fontFamily:DISP,fontWeight:700,fontSize:14,marginBottom:12}}>Pipeline de rutas</div>
            <div className="g3">
              {[[rutasProg,"Programadas",VIOLET],[rutasActivas,"En curso",BLUE],[rutasComp,"Completadas",GREEN]].map(([n,l,c])=>(
                <div key={l} style={{textAlign:"center",padding:"12px 8px",background:c+"08",borderRadius:11,border:"1px solid "+c+"18"}}>
                  <div style={{fontFamily:MONO,fontSize:24,fontWeight:800,color:c}}>{n}</div>
                  <div style={{fontSize:10,fontWeight:600,color:MUTED,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Top clientes */}
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,padding:"16px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontFamily:DISP,fontWeight:700,fontSize:14}}>Top clientes por facturación</span>
              <button onClick={()=>setView("clientes")} className="btn" style={{fontSize:11,color:A,fontWeight:700}}>Ver todos →</button>
            </div>
            {topClients.length===0?<div style={{padding:16,textAlign:"center",color:MUTED,fontSize:12}}>Sin datos</div>
            :topClients.map(([name,total],i)=>(
              <div key={name} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:22,height:22,borderRadius:7,background:A+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:A,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                  <MiniBar pct={total/topMax*100} color={A} h={3}/>
                </div>
                <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:A,flexShrink:0}}>{fmtK(total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Quick actions */}
          <div style={{fontFamily:DISP,fontWeight:700,fontSize:14,color:TEXT,paddingLeft:2}}>Acceso rápido</div>
          {quickActions.map(({icon:Icon,label,color,v})=>(
            <button key={v} onClick={()=>setView(v)} className="btn ch" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,border:"1px solid "+BORDER,background:"#fff",cursor:"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{width:36,height:36,borderRadius:10,background:color+"14",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={16} color={color}/></div>
              <span style={{fontSize:13,fontWeight:600,color:TEXT}}>{label}</span>
              <ChevronRight size={14} color={MUTED} style={{marginLeft:"auto"}}/>
            </button>
          ))}
          {/* Financial summary */}
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:13,padding:"14px 16px",marginTop:4}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Resumen financiero</div>
            <RowItem l="Facturado" v={fmtK(totalFac)} c={TEXT}/>
            <RowItem l="Cobrado" v={fmtK(cobrado)} c={GREEN}/>
            <RowItem l="Por cobrar" v={fmtK(pendiente)} c={AMBER}/>
            <RowItem l="Gastos" v={fmtK(totalGastos)} c={ROSE}/>
            <RowItem l="Margen neto" v={fmtK(margen)} c={margen>=0?GREEN:ROSE} bold/>
            <div style={{marginTop:8}}><MiniBar pct={pctCob} color={GREEN}/><div style={{fontSize:10,color:MUTED,marginTop:3}}>{pctCob}% cobrado del total facturado</div></div>
          </div>
          {/* Activity feed */}
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:13,padding:"14px 16px"}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Actividad reciente</div>
            {feed.length===0?<div style={{padding:12,textAlign:"center",color:MUTED,fontSize:11}}>Sin actividad</div>
            :feed.map((f,i)=>(
              <button key={i} onClick={()=>setView(f.view)} className="btn fr" style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"7px 4px",borderBottom:i<feed.length-1?"1px solid "+BORDER+"60":"none",cursor:"pointer",background:"transparent",textAlign:"left"}}>
                <div style={{width:28,height:28,borderRadius:8,background:f.color+"12",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><f.icon size={12} color={f.color}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.label}</div>
                  <div style={{fontSize:10,color:MUTED}}>{f.sub}</div>
                </div>
                <span style={{fontSize:9,color:MUTED,fontFamily:MONO,flexShrink:0}}>{ago(f.t)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics Predictivo */}
      {facts.length>=2&&(()=>{
        // Calcula predicción basado en los últimos 3 meses
        const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        const mesIdx = new Date().getMonth();
        const mesActual = MESES[mesIdx];
        const mesAnterior = MESES[mesIdx>0?mesIdx-1:11];
        const mesSiguiente = MESES[mesIdx<11?mesIdx+1:0];
        const totalMesActual = facts.filter(f=>f.mesOp===mesActual).reduce((a,f)=>a+(f.total||0),0);
        const totalMesAnterior = facts.filter(f=>f.mesOp===mesAnterior).reduce((a,f)=>a+(f.total||0),0);
        // Promedio de los 3 meses anteriores
        const ultimos3 = [];
        for(let i=1;i<=3;i++){
          const m = MESES[(mesIdx-i+12)%12];
          const tot = facts.filter(f=>f.mesOp===m).reduce((a,f)=>a+(f.total||0),0);
          if(tot>0) ultimos3.push(tot);
        }
        const promedio3m = ultimos3.length>0?ultimos3.reduce((a,b)=>a+b,0)/ultimos3.length:0;
        const crecimiento = totalMesAnterior>0?((totalMesActual-totalMesAnterior)/totalMesAnterior*100):0;
        const proyNextMes = Math.round(promedio3m*(1+crecimiento/100));
        // Capacidad de choferes
        const rutasHistoricas = rutas.length;
        const rutasPromPorMes = rutasHistoricas>0&&ultimos3.length>0?Math.round(rutasHistoricas/Math.max(ultimos3.length,1)):0;
        const capDiariaChofer = 20;
        const choferesActuales = clientes.length>0?clientes.length:0; // fallback
        const choferesNecesarios = Math.ceil(rutasPromPorMes/22); // ~22 días laborables
        return(
          <div style={{background:"linear-gradient(135deg,#fff,"+VIOLET+"06)",border:"1.5px solid "+VIOLET+"20",borderRadius:16,padding:22,marginTop:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:40,height:40,borderRadius:12,background:VIOLET+"14",display:"flex",alignItems:"center",justifyContent:"center"}}><Zap size={18} color={VIOLET}/></div>
                <div>
                  <div style={{fontFamily:DISP,fontWeight:700,fontSize:15}}>Analytics Predictivo</div>
                  <div style={{fontSize:11,color:MUTED,marginTop:2}}>Proyecciones basadas en tu histórico de facturación y rutas</div>
                </div>
              </div>
              <Tag color={VIOLET}>IA</Tag>
            </div>
            <div className="g4">
              <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em"}}>Proyección {mesSiguiente}</div>
                <div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:VIOLET,marginTop:4}}>{fmtK(proyNextMes)}</div>
                <div style={{fontSize:10,color:MUTED,marginTop:2}}>basado en promedio 3m</div>
              </div>
              <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em"}}>Crecimiento MoM</div>
                <div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:crecimiento>=0?GREEN:ROSE,marginTop:4}}>{crecimiento>=0?"+":""}{crecimiento.toFixed(1)}%</div>
                <div style={{fontSize:10,color:MUTED,marginTop:2}}>{mesAnterior} → {mesActual}</div>
              </div>
              <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em"}}>Rutas estimadas</div>
                <div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:A,marginTop:4}}>{rutasPromPorMes}</div>
                <div style={{fontSize:10,color:MUTED,marginTop:2}}>promedio mensual</div>
              </div>
              <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em"}}>Choferes ideales</div>
                <div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:BLUE,marginTop:4}}>{choferesNecesarios}</div>
                <div style={{fontSize:10,color:MUTED,marginTop:2}}>para ese volumen</div>
              </div>
            </div>
            {/* Recomendaciones */}
            <div style={{marginTop:14,padding:"12px 14px",background:"#fff",borderRadius:11,border:"1px solid "+BORDER}}>
              <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>🎯 Recomendaciones IA</div>
              {crecimiento>20&&<div style={{fontSize:12,color:GREEN,marginBottom:5,display:"flex",alignItems:"center",gap:6}}>📈 <strong>Crecimiento fuerte ({crecimiento.toFixed(0)}%)</strong> — Considera expandir flota o subir tarifas.</div>}
              {crecimiento<-20&&<div style={{fontSize:12,color:ROSE,marginBottom:5,display:"flex",alignItems:"center",gap:6}}>📉 <strong>Caída ({crecimiento.toFixed(0)}%)</strong> — Revisa cuentas perdidas, contacta prospectos.</div>}
              {crecimiento>=-20&&crecimiento<=20&&<div style={{fontSize:12,color:BLUE,marginBottom:5,display:"flex",alignItems:"center",gap:6}}>📊 Facturación estable. Mantén foco en retención y upsell.</div>}
              {proyNextMes>totalMesActual*1.5&&<div style={{fontSize:12,color:AMBER,marginBottom:5,display:"flex",alignItems:"center",gap:6}}>⚠️ Proyección {fmtK(proyNextMes)} vs {fmtK(totalMesActual)} actual — Prepara capacidad extra.</div>}
              {prospectos.filter(p=>p.status==="En negociación").length>0&&<div style={{fontSize:12,color:VIOLET,display:"flex",alignItems:"center",gap:6}}>🎯 {prospectos.filter(p=>p.status==="En negociación").length} prospecto(s) en negociación — valor ponderado: {fmtK(prospectos.filter(p=>p.status!=="Perdido"&&p.status!=="Ganado").reduce((a,p)=>a+((p.total||0)*(p.probabilidad||0)/100),0))}</div>}
            </div>
          </div>
        );
      })()}

      {/* Prospección */}
      {prospectos.length>0&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:16,padding:22,marginTop:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontFamily:DISP,fontWeight:700,fontSize:15}}>Pipeline de Prospección</div>
            <div style={{fontSize:11,color:MUTED,marginTop:2}}>Oportunidades de negocio en seguimiento</div>
          </div>
          <button onClick={()=>setView("prospeccion")} className="btn" style={{fontSize:12,color:VIOLET,fontWeight:700}}>Ver todo →</button>
        </div>
        <div className="g4" style={{marginBottom:14}}>
          {[["Contacto inicial",MUTED],["En negociación",BLUE],["Propuesta enviada",AMBER],["Ganado",GREEN]].map(([s,c])=>{
            const n=prospectos.filter(p=>p.status===s);
            return(
              <div key={s} style={{textAlign:"center",padding:"10px 8px",background:c+"08",borderRadius:10,border:"1px solid "+c+"18"}}>
                <div style={{fontFamily:MONO,fontSize:20,fontWeight:800,color:c}}>{n.length}</div>
                <div style={{fontSize:9,fontWeight:600,color:MUTED,marginTop:2}}>{s}</div>
                <div style={{fontFamily:MONO,fontSize:11,color:c,fontWeight:700,marginTop:3}}>{fmtK(n.reduce((a,p)=>a+(p.total||0),0))}</div>
              </div>
            );
          })}
        </div>
        {prospectos.filter(p=>p.status!=="Perdido").slice(0,5).map(p=>(
          <div key={p.id} className="fr" style={{display:"flex",alignItems:"center",gap:10,padding:"8px 4px",borderBottom:"1px solid "+BORDER+"60",cursor:"pointer"}} onClick={()=>setView("prospeccion")}>
            <div style={{width:32,height:32,borderRadius:9,background:VIOLET+"12",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Target size={14} color={VIOLET}/></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.empresa}</div>
              <div style={{fontSize:10,color:MUTED}}>{p.servicio||"—"}</div>
            </div>
            <Tag color={({"Contacto inicial":MUTED,"En negociación":BLUE,"Propuesta enviada":AMBER,Ganado:GREEN,Perdido:ROSE})[p.status]||MUTED} sm>{p.status}</Tag>
            <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:VIOLET,flexShrink:0}}>{fmtK(p.total||0)}</span>
          </div>
        ))}
      </div>}
    </div>
  );
}
/* ─── COTIZADOR PRO ──────────────────────────────────────────────────────── */
/* Section / SectionHeader — MUST be outside render to avoid remount on keystroke */
function S({children}){return <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>{children}</div>;}
function SH({children}){return <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>{children}</div>;}

function Cotizador({onSaved}){
  // ── shared
  const [modo,setModo]=useState("local");
  const [cliente,setCliente]=useState("");
  const [contacto,setContacto]=useState("");
  const [notas,setNotas]=useState("");
  const [plazo,setPlazo]=useState(3);
  const [toast,setToast]=useState(null);
  const showT=(m,t="ok")=>setToast({msg:m,type:t});

  // ── LOCAL
  const [lVeh,setLVeh]=useState("cam");
  const [lUrg,setLUrg]=useState(false);
  const [lAyud,setLAyud]=useState(false);
  const [lRes,setLRes]=useState(false);
  const [lPuntos,setLPuntos]=useState([{id:uid(),dir:"",ref:""}]);
  const addLPunto=()=>setLPuntos(p=>[...p,{id:uid(),dir:"",ref:""}]);
  const rmLPunto=id=>setLPuntos(p=>p.filter(x=>x.id!==id));
  const updLPunto=(id,k,v)=>setLPuntos(p=>p.map(x=>x.id===id?{...x,[k]:v}:x));

  // ── FORÁNEO
  const [fVeh,setFVeh]=useState("cam");
  const [fCiudades,setFCiudades]=useState([]);
  const [fSearch,setFSearch]=useState("");
  const [fUrg,setFUrg]=useState(false);
  const [fMani,setFMani]=useState(false);
  const [fNumAyud,setFNumAyud]=useState(1);
  const [fRes,setFRes]=useState(false);
  const [fExtra,setFExtra]=useState(0);
  const [fComida,setFComida]=useState(COMIDA);
  const [fHotel,setFHotel]=useState(HOTEL);

  // ── MASIVO
  const [mVeh,setMVeh]=useState("cam");
  const [mMaxDia,setMMaxDia]=useState(20);
  const [mPersonas,setMPersonas]=useState(1);
  const [mAyud,setMAyud]=useState(false);
  const [mUrg,setMUrg]=useState(false);
  const [mComida,setMComida]=useState(COMIDA);
  const [mHotel,setMHotel]=useState(HOTEL);
  const [mCiudades,setMCiudades]=useState([]);
  const [mSearch,setMSearch]=useState("");

  const calcMVans=(pdv,dias,mpd)=>Math.max(1,Math.ceil(pdv/(Math.max(1,mpd)*Math.max(1,dias))));
  const addMCiudad=t=>{
    const vans=calcMVans(20,1,mMaxDia);
    setMCiudades(p=>[...p,{...t,id:uid(),pdv:20,dias:1,paradas:[{id:uid(),dir:"",ref:""}],vans,tarifa:t[mVeh]||0}]);
    setMSearch("");
  };
  const updMCiudad=(id,k,v)=>setMCiudades(p=>p.map(c=>{
    if(c.id!==id) return c;
    const upd={...c,[k]:v};
    upd.vans=calcMVans(upd.pdv,upd.dias,mMaxDia);
    upd.tarifa=upd[mVeh]||0;
    return upd;
  }));
  const addMParada=cid=>setMCiudades(p=>p.map(c=>c.id===cid?{...c,paradas:[...c.paradas,{id:uid(),dir:"",ref:""}]}:c));
  const updMParada=(cid,pid,k,v)=>setMCiudades(p=>p.map(c=>c.id===cid?{...c,paradas:c.paradas.map(pa=>pa.id===pid?{...pa,[k]:v}:pa)}:c));
  const rmMParada=(cid,pid)=>setMCiudades(p=>p.map(c=>c.id===cid?{...c,paradas:c.paradas.filter(pa=>pa.id!==pid)}:c));
  const rmMCiudad=id=>setMCiudades(p=>p.filter(c=>c.id!==id));
  useEffect(()=>{setMCiudades(p=>p.map(c=>({...c,vans:calcMVans(c.pdv,c.dias,mMaxDia),tarifa:c[mVeh]||0})));},[mMaxDia,mVeh]);

  // ── CALC FORÁNEO
  const fVD=VEHK.find(v=>v.k===fVeh);
  const fCrew=(fVD?.crew||1)+fExtra;
  const fMaxKm=fCiudades.length>0?Math.max(...fCiudades.map(c=>c.km)):0;
  const fBaseTotal=fCiudades.reduce((a,c)=>a+(c[fVeh]||0),0);
  const {xC:fXC,xH:fXH,total:fXV,dias:fDias,noches:fNoches}=useMemo(()=>fMaxKm>0?calcViaticos(fMaxKm,fCrew,fComida,fHotel):{xC:0,xH:0,total:0,dias:0,noches:0},[fMaxKm,fCrew,fComida,fHotel]);
  const fXU=fUrg?fBaseTotal*.35:0;
  const fXM=fMani?AYUD*fNumAyud:0;
  const fXR=fRes&&fCiudades.length>0?(LOC[fVeh]?.resguardo||0):0;
  const fSub=fBaseTotal+fXU+fXM+fXR+fXV;
  const fIva=fSub*.16;const fTot=fSub+fIva;

  // ── CALC LOCAL
  const lD=LOC[lVeh]||LOC.cam;
  let lBase=lD.normal;
  if(lUrg&&lAyud) lBase=lD.urgente_ay;
  else if(lAyud)  lBase=lD.ayudante;
  else if(lUrg)   lBase=lD.urgente;
  const lPuntosExtra=Math.max(0,lPuntos.filter(p=>p.dir.trim()).length-1);
  const lXP=lPuntosExtra*ADIC;
  const lXR=lRes?(lD.resguardo||0):0;
  const lSub=lBase+lXP+lXR;const lIva=lSub*.16;const lTot=lSub+lIva;

  // ── CALC MASIVO
  const mTotPDV=mCiudades.reduce((a,c)=>a+c.pdv,0);
  const mTotVans=mCiudades.reduce((a,c)=>a+c.vans,0);
  const mPersonasT=mTotVans*(mPersonas+(mAyud?1:0));
  const mBaseTotal=mCiudades.reduce((a,c)=>a+(c.tarifa||0)*c.vans,0);
  const mXU=mUrg?mBaseTotal*.35:0;
  const mMaxKm=mCiudades.length>0?Math.max(...mCiudades.map(c=>c.km)):0;
  const {xC:mXC,xH:mXH,total:mXV}=useMemo(()=>mMaxKm>0?calcViaticos(mMaxKm,mPersonasT,mComida,mHotel):{xC:0,xH:0,total:0},[mMaxKm,mPersonasT,mComida,mHotel]);
  const mSub=mBaseTotal+mXU+mXV;const mIva=mSub*.16;const mTot=mSub+mIva;

  const total=modo==="foraneo"?fTot:modo==="local"?lTot:mTot;
  const canSave=modo==="foraneo"?fCiudades.length>0:modo==="masivo"?mCiudades.length>0:true;

  const buildQ=()=>{
    const folio="COT-"+uid();
    const base={cliente,contacto,notas,modo,folio,total,plazo};
    if(modo==="foraneo") return{...base,
      destino:fCiudades.map(c=>c.c).join(", "),km:fMaxKm,vehiculoLabel:fVD?.label,modoLabel:"FORÁNEO",
      stops:[{city:"Ciudad de México"},...fCiudades.map(c=>({city:c.c,pdv:c.pdv||0}))],
      lines:[
        ...fCiudades.map(c=>({label:"📍 "+c.c+(c.pdv?" · "+c.pdv+" PDVs":"")+" · "+c.km+"km",value:fmt(c[fVeh]||0)})),
        fCiudades.length>1&&{label:"Total tarifas ("+fCiudades.length+" ciudades)",value:fmt(fBaseTotal)},
        fUrg&&{label:"⚡ Urgente +35%",value:"+"+fmt(fXU),color:ROSE},
        fMani&&{label:"💪 Ayudantes ("+fNumAyud+")",value:"+"+fmt(fXM),color:VIOLET},
        fRes&&{label:"🛡️ Resguardo 1 día",value:"+"+fmt(fXR),color:GREEN},
        fXC>0&&{label:"🍽️ Comidas · "+fCrew+"p × "+fDias+"d",value:"+"+fmt(fXC),color:AMBER},
        fXH>0&&{label:"🏨 Hotel · "+fCrew+"p \u00d7 "+fNoches+"n",value:"+"+fmt(fXH),color:BLUE},
        {label:"Subtotal",value:fmt(fSub)},{label:"IVA 16%",value:fmt(fIva),color:MUTED},
        {label:"TOTAL CON IVA",value:fmt(fTot),bold:true,color:A},
      ].filter(Boolean)};
    if(modo==="local") return{...base,destino:"Ciudad de México",vehiculoLabel:VEHK.find(v=>v.k===lVeh)?.label,modoLabel:"LOCAL CDMX",
      stops:lPuntos.filter(p=>p.dir.trim()).map(p=>({city:p.dir})),
      lines:[
        {label:VEHK.find(v=>v.k===lVeh)?.label+" · "+(lUrg?"Urgente":"Normal")+(lAyud?" + Ayudante":""),value:fmt(lBase)},
        lPuntosExtra>0&&{label:"📦 Paradas extra ("+lPuntosExtra+")",value:"+"+fmt(lXP),color:BLUE},
        lRes&&{label:"🛡️ Resguardo",value:"+"+fmt(lXR),color:GREEN},
        {label:"Subtotal",value:fmt(lSub)},{label:"IVA 16%",value:fmt(lIva),color:MUTED},
        {label:"TOTAL CON IVA",value:fmt(lTot),bold:true,color:A},
      ].filter(Boolean)};
    return{...base,destino:mCiudades.map(c=>c.c).join(", ")||"Masivo",vehiculoLabel:VEHK.find(v=>v.k===mVeh)?.label,modoLabel:"DISTRIBUCIÓN MASIVA",
      totalPDV:mTotPDV,flota:{vans:mTotVans,dias:Math.max(...mCiudades.map(c=>c.dias),1),capDia:mTotVans*mMaxDia},
      stops:[{city:"CDMX"},...mCiudades.map(c=>({city:c.c,pdv:c.pdv}))],
      lines:[
        ...mCiudades.map(c=>({label:"📍 "+c.c+" · "+c.pdv+" PDVs · "+c.vans+" van(s)",value:fmt((c.tarifa||0)*c.vans)})),
        mUrg&&{label:"⚡ Urgente +35%",value:"+"+fmt(mXU),color:ROSE},
        mXC>0&&{label:"🍽️ Comidas personal",value:"+"+fmt(mXC),color:AMBER},
        mXH>0&&{label:"🏨 Hotel personal",value:"+"+fmt(mXH),color:BLUE},
        {label:"Subtotal",value:fmt(mSub)},{label:"IVA 16%",value:fmt(mIva),color:MUTED},
        {label:"TOTAL CON IVA",value:fmt(mTot),bold:true,color:A},
      ].filter(Boolean)};
  };
  const guardar=async()=>{
    if(!cliente.trim()){showT("El nombre del cliente es requerido","err");return;}
    if(!canSave){showT("Agrega al menos un destino","err");return;}
    try{
      const q=buildQ();
      await addDoc(collection(db,"cotizaciones"),{...q,createdAt:serverTimestamp()});
      showT("✓ Cotización guardada — "+q.folio);
      onSaved&&onSaved();
    }catch(e){showT(e.message,"err");}
  };

  return(
    <div style={{flex:1,overflowY:"auto",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {/* Header */}
      <div style={{padding:"22px 34px 0",background:"#fff",borderBottom:"1px solid "+BORDER}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:26,color:TEXT,letterSpacing:"-0.03em"}}>Cotizador Pro</h1>
            <p style={{color:MUTED,fontSize:12,marginTop:2}}>Tarifas 2026 · Viáticos automáticos · PDF profesional</p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",background:"#fff8f3",borderRadius:20,border:"1px solid "+A+"22"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:GREEN,boxShadow:"0 0 6px "+GREEN}}/>
            <span style={{fontSize:10,fontWeight:700,color:A,fontFamily:MONO,letterSpacing:"0.04em"}}>ACTUALIZACIÓN EN VIVO</span>
          </div>
        </div>
        <div style={{display:"flex",background:"#f5f7fc",borderRadius:13,padding:3,width:"fit-content",gap:2}}>
          {[{id:"local",l:"📍 Local CDMX"},{id:"foraneo",l:"🚛 Foráneo"},{id:"masivo",l:"📦 Distribución Masiva"}].map(({id,l})=>(
            <button key={id} onClick={()=>{setModo(id);}} className="btn"
              style={{padding:"9px 18px",borderRadius:10,background:modo===id?"#fff":"transparent",color:modo===id?A:MUTED,fontFamily:SANS,fontSize:13,fontWeight:modo===id?700:500,boxShadow:modo===id?"0 1px 6px rgba(12,24,41,.1)":"none"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 370px",gap:18,padding:"20px 34px",alignItems:"start"}}>
        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Cliente */}
          <S><SH>Información del cliente</SH>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
              <Inp label="Empresa / Cliente *" value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Ej: Walmart México"/>
              <Inp label="Contacto" value={contacto} onChange={e=>setContacto(e.target.value)} placeholder="Nombre del contacto"/>
              <Spin label="Plazo de entrega (días)" value={plazo} onChange={setPlazo} min={1} max={90}/>
            </div>
          </S>

          {/* ══ LOCAL ══ */}
          {modo==="local"&&<>
            <S><SH>Vehículo</SH>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7}}>
                {VEHK.map(v=>(
                  <button key={v.k} onClick={()=>setLVeh(v.k)} className="btn" style={{padding:"10px 6px",borderRadius:11,border:"2px solid "+(lVeh===v.k?A:BD2),background:lVeh===v.k?A+"08":"#fff",cursor:"pointer",textAlign:"center",transition:"all .13s"}}>
                    <div style={{fontSize:18}}>{v.icon}</div>
                    <div style={{fontSize:10,fontWeight:lVeh===v.k?700:500,color:lVeh===v.k?A:MUTED,marginTop:4}}>{v.label.split(" ")[0]}</div>
                    <div style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:lVeh===v.k?A:TEXT,marginTop:2}}>{fmt(lD?.normal||0)}</div>
                  </button>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:13}}>
                <Tog checked={lUrg} onChange={setLUrg} label="⚡ Urgente" sub={fmt(lD?.urgente||0)} color={ROSE}/>
                <Tog checked={lAyud} onChange={setLAyud} label="💪 Ayudante" sub={fmt(lD?.ayudante||0)} color={VIOLET}/>
                <Tog checked={lRes} onChange={setLRes} label={"🛡️ Resguardo"} sub={fmt(lD?.resguardo||0)} color={GREEN}/>
              </div>
            </S>
            <S>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:13}}>
                <SH>Puntos de entrega</SH>
                <Tag color={BLUE}>{lPuntos.filter(p=>p.dir.trim()).length} punto(s){lPuntosExtra>0?" · +"+fmt(lPuntosExtra*ADIC):""}</Tag>
              </div>
              <div style={{fontSize:11,color:MUTED,marginBottom:11}}>Primer punto incluido · Cada adicional: <strong style={{color:A}}>{fmt(ADIC)}</strong></div>
              {lPuntos.map((p,i)=>(
                <div key={p.id} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:i===0?BLUE+"14":A+"14",border:"2px solid "+(i===0?BLUE:A),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:i===0?BLUE:A,flexShrink:0}}>{i+1}</div>
                  <input value={p.dir} onChange={e=>updLPunto(p.id,"dir",e.target.value)} placeholder={i===0?"Punto de recogida / origen":"Dirección de entrega"}
                    style={{flex:1,background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"8px 12px",fontSize:13}}/>
                  <input value={p.ref} onChange={e=>updLPunto(p.id,"ref",e.target.value)} placeholder="Ref" style={{width:90,background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"8px 10px",fontSize:12}}/>
                  {i>0&&<button onClick={()=>rmLPunto(p.id)} className="btn" style={{width:26,height:26,borderRadius:"50%",border:"1px solid "+ROSE+"28",background:ROSE+"08",display:"flex",alignItems:"center",justifyContent:"center",color:ROSE,flexShrink:0}}><X size={11}/></button>}
                </div>
              ))}
              <button onClick={addLPunto} className="btn" style={{display:"flex",alignItems:"center",gap:7,padding:"8px 14px",borderRadius:9,border:"1.5px dashed "+A+"40",background:A+"06",color:A,fontSize:13,fontWeight:600,cursor:"pointer",marginTop:4}}>
                <Plus size={13}/>Agregar punto
              </button>
            </S>
          </>}

          {/* ══ FORÁNEO ══ */}
          {modo==="foraneo"&&<>
            <S>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <SH>Ciudades de destino *</SH>
                {fCiudades.length>0&&<Tag color={A}>{fCiudades.length} ciudad(es) · {fmt(fBaseTotal)}</Tag>}
              </div>
              {fCiudades.map((c,i)=>(
                <div key={c.id} style={{background:A+"05",border:"1.5px solid "+A+"20",borderRadius:12,marginBottom:12,overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 13px",borderBottom:"1px solid "+A+"15"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:A,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{c.c}</div><div style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{c.km.toLocaleString()} km · tarifa: {fmt(c[fVeh]||0)}</div></div>
                    <button onClick={()=>setFCiudades(p=>p.filter(x=>x.id!==c.id))} className="btn" style={{width:22,height:22,borderRadius:"50%",border:"1px solid "+ROSE+"28",background:ROSE+"08",display:"flex",alignItems:"center",justifyContent:"center",color:ROSE}}><X size={10}/></button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"10px 13px"}}>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>PDVs a entregar</div>
                      <input type="number" min="0" value={c.pdv||""} onChange={e=>setFCiudades(p=>p.map(x=>x.id===c.id?{...x,pdv:parseInt(e.target.value)||0}:x))}
                        placeholder="Ej: 17" style={{width:"100%",background:"#fff",border:"1.5px solid "+A+"28",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:15,fontWeight:700,color:A}}/>
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Días en ciudad</div>
                      <input type="number" min="1" value={c.dias||""} onChange={e=>setFCiudades(p=>p.map(x=>x.id===c.id?{...x,dias:parseInt(e.target.value)||1}:x))}
                        placeholder="Ej: 2" style={{width:"100%",background:"#fff",border:"1.5px solid "+BLUE+"28",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:15,fontWeight:700,color:BLUE}}/>
                    </div>
                  </div>
                  {(c.pdv>0||c.dias>0)&&<div style={{padding:"0 13px 10px",display:"flex",gap:12}}>
                    {c.pdv>0&&c.dias>0&&<span style={{fontSize:10,color:MUTED}}>📦 {Math.ceil(c.pdv/c.dias)} PDVs/día</span>}
                    <span style={{fontSize:10,color:MUTED}}>⏱️ {c.dias||1} día(s) en {c.c}</span>
                  </div>}
                </div>
              ))}
              <div style={{padding:"10px 12px",background:A+"04",border:"1.5px dashed "+A+"30",borderRadius:10}}>
                <div style={{fontSize:10,fontWeight:700,color:A,marginBottom:7,letterSpacing:"0.05em"}}>+ AGREGAR CIUDAD</div>
                <CitySearch value={fSearch} onChange={setFSearch} onSelect={t=>{setFCiudades(p=>[...p,{...t,id:uid(),pdv:0,dias:1}]);setFSearch("");}} veh={fVeh} exclude={fCiudades.map(c=>c.c)}/>
              </div>
            </S>
            <S><SH>Vehículo</SH>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7}}>
                {VEHK.map(v=>(
                  <button key={v.k} onClick={()=>setFVeh(v.k)} className="btn" style={{padding:"9px 5px",borderRadius:11,border:"2px solid "+(fVeh===v.k?A:BD2),background:fVeh===v.k?A+"08":"#fff",cursor:"pointer",textAlign:"center",transition:"all .13s"}}>
                    <div style={{fontSize:16}}>{v.icon}</div>
                    <div style={{fontSize:10,fontWeight:fVeh===v.k?700:500,color:fVeh===v.k?A:MUTED,marginTop:3}}>{v.label.split(" ")[0]}</div>
                  </button>
                ))}
              </div>
            </S>
            <S><SH>Extras y viáticos</SH>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:13}}>
                <Spin label="Ayudantes extra" value={fExtra} onChange={setFExtra} min={0} max={4}/>
                <Spin label="Núm. ayudantes" value={fNumAyud} onChange={setFNumAyud} min={1} max={10}/>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Comida/persona/día</div>
                  <input type="number" value={fComida} onChange={e=>setFComida(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Hotel/persona/noche</div>
                  <input type="number" value={fHotel} onChange={e=>setFHotel(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <Tog checked={fUrg} onChange={setFUrg} label="⚡ Urgente +35%" color={ROSE}/>
                <Tog checked={fMani} onChange={setFMani} label="💪 Maniobras" color={VIOLET}/>
                <Tog checked={fRes} onChange={setFRes} label="🛡️ Resguardo" color={GREEN}/>
              </div>
            </S>
          </>}

          {/* ══ MASIVO ══ */}
          {modo==="masivo"&&<>
            <S><SH>Configuración de flota</SH>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:11,marginBottom:13}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Máx entregas/van/día</div>
                  <input type="number" min="1" value={mMaxDia} onChange={e=>setMMaxDia(Math.max(1,parseInt(e.target.value)||1))}
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:18,fontWeight:700,color:A,textAlign:"center"}}/>
                </div>
                <Spin label="Personas/van" value={mPersonas} onChange={setMPersonas} min={1} max={5}/>
                <Spin label="Plazo global (días)" value={plazo} onChange={setPlazo} min={1} max={90}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7,marginBottom:13}}>
                {VEHK.map(v=>(
                  <button key={v.k} onClick={()=>setMVeh(v.k)} className="btn" style={{padding:"8px 4px",borderRadius:10,border:"2px solid "+(mVeh===v.k?A:BD2),background:mVeh===v.k?A+"08":"#fff",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:16}}>{v.icon}</div>
                    <div style={{fontSize:9,fontWeight:mVeh===v.k?700:500,color:mVeh===v.k?A:MUTED,marginTop:3}}>{v.label.split(" ")[0]}</div>
                  </button>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:13}}>
                <Tog checked={mAyud} onChange={setMAyud} label="💪 Ayudante/van" color={VIOLET}/>
                <Tog checked={mUrg} onChange={setMUrg} label="⚡ Urgente +35%" color={ROSE}/>
              </div>
              {mCiudades.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                <InfoBox icon={Truck} color={A} title="Vans totales" value={mTotVans} sub={mCiudades.length+" ciudades"}/>
                <InfoBox icon={Package} color={BLUE} title="PDVs totales" value={mTotPDV.toLocaleString()}/>
                <InfoBox icon={Users} color={VIOLET} title="Personal total" value={mPersonasT}/>
              </div>}
            </S>

            <S>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <SH>Ciudades de distribución *</SH>
                {mCiudades.length>0&&<div style={{display:"flex",gap:6}}>
                  <Tag color={A}>{mTotPDV.toLocaleString()} PDVs</Tag>
                  <Tag color={VIOLET}>{mTotVans} vans</Tag>
                </div>}
              </div>
              {mCiudades.map((c,ci)=>(
                <div key={c.id} style={{border:"1.5px solid "+A+"22",borderRadius:12,marginBottom:12,overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:9,padding:"11px 14px",background:A+"06",borderBottom:"1px solid "+A+"15"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:A,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0}}>{ci+1}</div>
                    <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{c.c}</div><div style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{c.km.toLocaleString()} km · tarifa: {fmt(c.tarifa||0)}/van</div></div>
                    <Tag color={VIOLET}>{c.vans} van(s)</Tag>
                    <button onClick={()=>rmMCiudad(c.id)} className="btn" style={{width:22,height:22,borderRadius:"50%",border:"1px solid "+ROSE+"28",background:ROSE+"08",display:"flex",alignItems:"center",justifyContent:"center",color:ROSE}}><X size={10}/></button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,padding:"12px 14px",borderBottom:"1px solid "+BORDER}}>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>PDVs en ciudad</div>
                      <input type="number" min="1" value={c.pdv} onChange={e=>updMCiudad(c.id,"pdv",Math.max(1,parseInt(e.target.value)||1))}
                        style={{width:"100%",background:"#fff",border:"1.5px solid "+A+"40",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:15,fontWeight:700,color:A}}/>
                      <div style={{fontSize:10,color:MUTED,marginTop:3}}>≈ {Math.ceil(c.pdv/c.dias)} PDVs/día</div>
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>Días de operación</div>
                      <input type="number" min="1" value={c.dias} onChange={e=>updMCiudad(c.id,"dias",Math.max(1,parseInt(e.target.value)||1))}
                        style={{width:"100%",background:"#fff",border:"1.5px solid "+BLUE+"40",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:15,fontWeight:700,color:BLUE}}/>
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>Vans necesarias</div>
                      <div style={{background:"#fff",border:"1.5px solid "+VIOLET+"30",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:15,fontWeight:800,color:VIOLET,textAlign:"center"}}>{c.vans}</div>
                    </div>
                  </div>
                  <div style={{padding:"11px 14px"}}>
                    <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Direcciones de entrega en {c.c}</div>
                    {c.paradas.map((p,pi)=>(
                      <div key={p.id} style={{display:"flex",gap:7,marginBottom:7,alignItems:"center"}}>
                        <div style={{width:20,height:20,borderRadius:"50%",background:pi===0?BLUE+"14":VIOLET+"14",border:"2px solid "+(pi===0?BLUE:VIOLET),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:pi===0?BLUE:VIOLET,flexShrink:0}}>{pi+1}</div>
                        <input value={p.dir} onChange={e=>updMParada(c.id,p.id,"dir",e.target.value)}
                          placeholder={pi===0?"Origen / zona en "+c.c:"Dirección de entrega"}
                          style={{flex:1,background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontSize:12}}/>
                        <input value={p.ref} onChange={e=>updMParada(c.id,p.id,"ref",e.target.value)}
                          placeholder="Ref" style={{width:75,background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 9px",fontSize:11}}/>
                        {pi>0&&<button onClick={()=>rmMParada(c.id,p.id)} className="btn" style={{width:22,height:22,borderRadius:"50%",border:"1px solid "+ROSE+"28",background:ROSE+"08",display:"flex",alignItems:"center",justifyContent:"center",color:ROSE,flexShrink:0}}><X size={9}/></button>}
                      </div>
                    ))}
                    <button onClick={()=>addMParada(c.id)} className="btn" style={{display:"flex",alignItems:"center",gap:6,padding:"6px 11px",borderRadius:7,border:"1.5px dashed "+VIOLET+"40",background:VIOLET+"05",color:VIOLET,fontSize:11,fontWeight:600,cursor:"pointer",marginTop:2}}>
                      <Plus size={11}/>Agregar dirección
                    </button>
                  </div>
                </div>
              ))}
              <div style={{padding:"10px 12px",background:A+"04",border:"1.5px dashed "+A+"30",borderRadius:10}}>
                <div style={{fontSize:10,fontWeight:700,color:A,marginBottom:7,letterSpacing:"0.05em"}}>+ AGREGAR CIUDAD</div>
                <CitySearch value={mSearch} onChange={setMSearch} onSelect={addMCiudad} veh={mVeh} exclude={mCiudades.map(c=>c.c)}/>
              </div>
              {mCiudades.length===0&&<div style={{marginTop:10,fontSize:11,color:MUTED,fontStyle:"italic"}}>💡 Agrega las ciudades donde harás entregas simultáneas</div>}
            </S>

            <S><SH>Viáticos del personal</SH>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Comida/persona/día</div>
                  <input type="number" value={mComida} onChange={e=>setMComida(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Hotel/persona/noche</div>
                  <input type="number" value={mHotel} onChange={e=>setMHotel(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                </div>
              </div>
            </S>
          </>}

          <Txt label="Notas / Condiciones especiales" value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Tipo de mercancía, instrucciones especiales…"/>
        </div>

        {/* RIGHT: LIVE PREVIEW */}
        <div style={{position:"sticky",top:20,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:18,overflow:"hidden",boxShadow:"0 4px 24px rgba(12,24,41,.08)"}}>
            <div style={{borderTop:"3px solid "+A,padding:"18px 20px 14px"}}>
              <div style={{fontFamily:MONO,fontSize:9,color:A,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>● COTIZACIÓN EN VIVO</div>
              <div style={{fontFamily:MONO,fontWeight:800,fontSize:40,color:TEXT,lineHeight:1}}>{fmt(total)}</div>
              <div style={{fontSize:11,color:MUTED,marginTop:5}}>MXN con IVA incluido · {
                modo==="foraneo"?fCiudades.map(c=>c.c).join(", ")||"—":
                modo==="masivo"?mCiudades.map(c=>c.c).join(", ")||"—":
                "Local CDMX"
              }</div>
            </div>
            <div style={{padding:"0 20px 14px"}}>
              {modo==="foraneo"&&<>
                {fCiudades.map(c=><RowItem key={c.id} l={"📍 "+c.c+(c.pdv?" · "+c.pdv+" PDVs":"")} v={fmt(c[fVeh]||0)}/>)}
                {fCiudades.length>1&&<RowItem l={"Total "+fCiudades.length+" ciudades"} v={fmt(fBaseTotal)}/>}
                {fXC>0&&<RowItem l={"🍽️ Comidas"} v={"+"+fmt(fXC)} c={AMBER}/>}
                {fXH>0&&<RowItem l={"🏨 Hotel"} v={"+"+fmt(fXH)} c={BLUE}/>}
                {fXU>0&&<RowItem l={"⚡ Urgente"} v={"+"+fmt(fXU)} c={ROSE}/>}
                {fXM>0&&<RowItem l={"💪 Maniobras"} v={"+"+fmt(fXM)} c={VIOLET}/>}
                {fXR>0&&<RowItem l={"🛡️ Resguardo"} v={"+"+fmt(fXR)} c={GREEN}/>}
                <RowItem l="Subtotal" v={fmt(fSub)}/>
                <RowItem l="IVA 16%" v={fmt(fIva)} c={MUTED}/>
                <RowItem l="TOTAL" v={fmt(fTot)} c={A} bold/>
              </>}
              {modo==="local"&&<>
                <RowItem l={VEHK.find(v=>v.k===lVeh)?.label||""} v={fmt(lBase)}/>
                {lXP>0&&<RowItem l={"📦 "+lPuntosExtra+" parada(s) extra"} v={"+"+fmt(lXP)} c={BLUE}/>}
                {lXR>0&&<RowItem l="🛡️ Resguardo" v={"+"+fmt(lXR)} c={GREEN}/>}
                <RowItem l="Subtotal" v={fmt(lSub)}/>
                <RowItem l="IVA 16%" v={fmt(lIva)} c={MUTED}/>
                <RowItem l="TOTAL" v={fmt(lTot)} c={A} bold/>
              </>}
              {modo==="masivo"&&<>
                {mCiudades.map(c=><RowItem key={c.id} l={"📍 "+c.c+" · "+c.pdv+" PDVs · "+c.vans+" van(s)"} v={fmt((c.tarifa||0)*c.vans)}/>)}
                {mXU>0&&<RowItem l="⚡ Urgente" v={"+"+fmt(mXU)} c={ROSE}/>}
                {mXC>0&&<RowItem l="🍽️ Comidas" v={"+"+fmt(mXC)} c={AMBER}/>}
                {mXH>0&&<RowItem l="🏨 Hotel" v={"+"+fmt(mXH)} c={BLUE}/>}
                <RowItem l="Subtotal" v={fmt(mSub)}/>
                <RowItem l="IVA 16%" v={fmt(mIva)} c={MUTED}/>
                <RowItem l="TOTAL" v={fmt(mTot)} c={A} bold/>
              </>}
            </div>
            {modo==="foraneo"&&fCiudades.length>0&&<div style={{padding:"0 20px 14px"}}>
              <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,paddingTop:8,borderTop:"1px solid "+BORDER}}>Comparar vehículos</div>
              {VEHK.map(v=>(
                <div key={v.k} onClick={()=>setFVeh(v.k)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",cursor:"pointer",opacity:fVeh===v.k?1:.7}}>
                  <span style={{fontSize:11,color:fVeh===v.k?A:TEXT,fontWeight:fVeh===v.k?700:400}}>{v.icon} {v.label}</span>
                  <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:fVeh===v.k?A:TEXT}}>{fmt(fCiudades.reduce((a,c)=>a+(c[v.k]||0),0))}</span>
                </div>
              ))}
            </div>}
          </div>

          <button onClick={guardar} disabled={!canSave||!cliente.trim()} className="btn" style={{background:canSave&&cliente.trim()?"linear-gradient(135deg,"+A+",#fb923c)":"#e0e0e0",color:canSave&&cliente.trim()?"#fff":"#aaa",borderRadius:13,padding:"14px 0",fontFamily:DISP,fontWeight:700,fontSize:16,cursor:canSave&&cliente.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:canSave&&cliente.trim()?"0 6px 20px "+A+"40":"none"}}>
            <Send size={15}/>Guardar cotización
          </button>
          <button onClick={()=>downloadCotizacionPDF(buildQ())} className="btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"11px 0",border:"1.5px solid "+BLUE+"30",borderRadius:13,fontSize:13,fontWeight:700,color:BLUE,background:"#fff"}}>
            <Download size={14}/>Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
/* ─── IMPORTACIÓN MASIVA CSV/Excel ──────────────────────────────────────── */
function ImportRutasModal({onClose,choferes,showT}){
  const [file,setFile]=useState(null);
  const [rows,setRows]=useState([]);
  const [grouped,setGrouped]=useState({});
  const [step,setStep]=useState(1);
  const [saving,setSaving]=useState(false);
  const [choferAsignado,setChoferAsignado]=useState("");
  const [clienteGlobal,setClienteGlobal]=useState("");
  const [vehGlobal,setVehGlobal]=useState("cam");

  const downloadTemplate = ()=>{
    const ws = XLSX.utils.aoa_to_sheet([
      ["ciudad","punto_nombre","direccion_completa","pdv","notas","cliente","fecha"],
      ["Acapulco","Walmart Costera","Av. Costera Miguel Alemán 123, Acapulco",1,"Entregar antes de 3pm","Cliente X","2026-05-10"],
      ["Acapulco","Chedraui Marina","Plaza Marina, Acapulco",1,"","Cliente X","2026-05-10"],
      ["Cuernavaca","Walmart Galerías","Av. Vicente Guerrero 101, Cuernavaca",2,"2 PDVs","Cliente X","2026-05-10"],
    ]);
    ws["!cols"]=[{wch:16},{wch:24},{wch:40},{wch:8},{wch:20},{wch:20},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Rutas");
    XLSX.writeFile(wb,"template_rutas_dmov.xlsx");
  };

  const parseFile = async(f)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      try{
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data,{type:"array"});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);
        if(json.length===0){showT("Archivo vacío","err");return;}
        setRows(json);
        // Agrupa por ciudad + fecha + cliente
        const g = {};
        json.forEach(r=>{
          const key = `${(r.cliente||clienteGlobal||"Sin cliente").trim()}|${(r.fecha||"").trim()}|${(r.ciudad||"").trim()}`;
          if(!g[key]) g[key] = {cliente:(r.cliente||clienteGlobal||"").trim(),fecha:(r.fecha||"").trim(),ciudad:(r.ciudad||"").trim(),puntos:[]};
          g[key].puntos.push({name:(r.punto_nombre||"").trim(),address:(r.direccion_completa||"").trim(),pdv:Number(r.pdv)||1,notas:(r.notas||"").trim()});
        });
        setGrouped(g);
        setStep(2);
      }catch(err){showT("Error leyendo archivo: "+err.message,"err");}
    };
    reader.readAsArrayBuffer(f);
  };

  const geocodeAddress = async(address)=>{
    if(!MAPBOX_TOKEN||!address) return null;
    try{
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=MX&limit=1`;
      const res = await fetch(url);
      const d = await res.json();
      const f = d.features?.[0];
      if(f) return {lat:f.center[1],lng:f.center[0],address:f.place_name};
    }catch(e){}
    return null;
  };

  const saveAll = async()=>{
    setSaving(true);
    let creadas = 0;
    try{
      for(const [key,g] of Object.entries(grouped)){
        // Geocodifica los puntos que no tengan coordenadas
        const puntos = [];
        for(const p of g.puntos){
          const geo = await geocodeAddress(p.address||p.name);
          puntos.push({id:uid(),name:p.name,address:geo?.address||p.address,lat:geo?.lat||0,lng:geo?.lng||0,notas:p.notas||""});
        }
        const totalPDV = g.puntos.reduce((a,p)=>a+(p.pdv||1),0);
        // Busca la ciudad en TAR para sacar km y tarifa base
        const tar = TAR.find(t=>t.c.toLowerCase()===g.ciudad.toLowerCase());
        const base = tar?tar[vehGlobal]:0;
        const km = tar?tar.km:0;
        const chof = choferes.find(c=>c.id===choferAsignado);
        const nombre = `${g.ciudad} · ${g.fecha||new Date().toLocaleDateString("es-MX")} · ${g.cliente||"Masiva"}`;
        const trackingId = Math.random().toString(36).slice(2,10).toUpperCase();
        const stops = [
          {city:"Ciudad de México",pdv:0,km:0,isOrigin:true,puntos:[]},
          {city:g.ciudad,pdv:totalPDV,km:km,addr:"",isOrigin:false,puntos:puntos},
        ];
        const sub = base*1; // tarifa básica
        const iva = sub*0.16;
        const total = sub+iva;
        await addDoc(collection(db,"rutas"),{
          nombre,cliente:g.cliente,clienteTel:"",clienteEmail:"",trackingId,
          veh:vehGlobal,vehiculoLabel:VEHK.find(v=>v.k===vehGlobal)?.label,
          stops,totalPDV,totalKm:km,vans:1,diasOp:1,capDia:20,crew:1,xViat:0,tarifaT:sub,sub,iva,total,plazo:3,maxDia:20,
          mapURL:"",status:"Programada",progreso:0,
          choferId:choferAsignado||"",choferNombre:chof?.nombre||"",choferTel:chof?.tel||"",choferPlaca:chof?.placa||"",
          importada:true,
          fechaProgramada:g.fecha||"",
          createdAt:serverTimestamp(),
        });
        creadas++;
      }
      showT(`✓ ${creadas} rutas creadas`);
      onClose();
    }catch(e){showT("Error: "+e.message,"err");}
    setSaving(false);
  };

  return(
    <Modal title={step===1?"Importar rutas desde CSV/Excel":"Revisar y confirmar rutas"} onClose={onClose} wide icon={Upload} iconColor={BLUE}>
      {step===1&&<div>
        <div style={{padding:"14px 16px",background:BLUE+"08",borderRadius:11,border:"1.5px solid "+BLUE+"20",marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:BLUE,marginBottom:6}}>📋 Formato del archivo</div>
          <div style={{fontSize:11,color:TEXT,lineHeight:1.6}}>
            Tu archivo debe tener estas columnas: <strong>ciudad</strong>, <strong>punto_nombre</strong>, <strong>direccion_completa</strong>, <strong>pdv</strong>, <strong>notas</strong>, <strong>cliente</strong>, <strong>fecha</strong>.
            Las filas con la misma <strong>ciudad + cliente + fecha</strong> se agrupan en una sola ruta automáticamente.
          </div>
          <button onClick={downloadTemplate} className="btn" style={{marginTop:10,display:"flex",alignItems:"center",gap:6,background:BLUE,color:"#fff",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700}}><Download size={12}/>Descargar plantilla Excel</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <Inp label="Cliente global (opcional)" value={clienteGlobal} onChange={e=>setClienteGlobal(e.target.value)} placeholder="Si el CSV no trae columna cliente"/>
          <Sel label="Tipo de vehículo" value={vehGlobal} onChange={e=>setVehGlobal(e.target.value)} options={[{v:"eur",l:"Eurovan"},{v:"cam",l:"Camioneta 3.5T"},{v:"kra",l:"Krafter"}]}/>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Asignar chofer a todas las rutas</div>
          <select value={choferAsignado} onChange={e=>setChoferAsignado(e.target.value)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:13,marginBottom:14}}>
            <option value="">— Sin asignar (asignar después) —</option>
            {choferes.map(c=><option key={c.id} value={c.id}>{c.nombre} · {c.tel}</option>)}
          </select>
        </div>

        <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:"28px 14px",background:BLUE+"06",border:"2px dashed "+BLUE+"40",borderRadius:14,cursor:"pointer",color:BLUE,fontWeight:700}}>
          <Upload size={28}/>
          <div style={{fontSize:14}}>{file?file.name:"Click para seleccionar archivo (.csv, .xlsx)"}</div>
          <div style={{fontSize:11,color:MUTED,fontWeight:500}}>o arrastra tu archivo aquí</div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={e=>{const f=e.target.files?.[0];if(f){setFile(f);parseFile(f);}}} style={{display:"none"}}/>
        </label>
      </div>}

      {step===2&&<div>
        <div style={{padding:"12px 14px",background:GREEN+"08",borderRadius:10,border:"1.5px solid "+GREEN+"20",marginBottom:14}}>
          <div style={{fontSize:12,color:GREEN,fontWeight:700}}>✓ Archivo procesado: {rows.length} filas · {Object.keys(grouped).length} rutas generadas</div>
        </div>
        <div style={{maxHeight:340,overflowY:"auto",marginBottom:14}}>
          {Object.entries(grouped).map(([key,g])=>(
            <div key={key} style={{background:"#f8fafd",border:"1px solid "+BORDER,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontWeight:700,fontSize:13}}>{g.ciudad}</div>
                <Tag color={VIOLET} sm>{g.puntos.length} puntos</Tag>
              </div>
              <div style={{fontSize:11,color:MUTED}}>{g.cliente||"Sin cliente"} · {g.fecha||"Sin fecha"}</div>
              <div style={{fontSize:10,color:MUTED,marginTop:4}}>
                {g.puntos.slice(0,3).map(p=>p.name).join(", ")}{g.puntos.length>3?"…":""}
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setStep(1)} className="btn" style={{flex:1,padding:"12px 0",borderRadius:10,border:"1.5px solid "+BD2,background:"#fff",color:MUTED,fontWeight:700,fontSize:13}}>Atrás</button>
          <button onClick={saveAll} disabled={saving} className="btn" style={{flex:2,padding:"12px 0",borderRadius:10,background:"linear-gradient(135deg,"+BLUE+",#3b82f6)",color:"#fff",fontFamily:DISP,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            {saving?<><div className="spin" style={{width:14,height:14,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}}/>Creando rutas y geocodificando…</>:<><Check size={14}/>Crear {Object.keys(grouped).length} rutas</>}
          </button>
        </div>
      </div>}
    </Modal>
  );
}

/* ─── MODAL DE CAPACIDAD OPERATIVA ───────────────────────────────────────── */
function CapacidadModal({onClose,rutas,choferes}){
  const hoy = new Date().toISOString().slice(0,10);
  const manana = new Date(Date.now()+86400000).toISOString().slice(0,10);
  const disponibles = choferes.filter(c=>c.status==="Disponible").length;
  const enRuta = choferes.filter(c=>c.status==="En ruta").length;
  // Rutas por tipo vehículo
  const porVehiculo = VEHK.reduce((a,v)=>{
    const chofs = choferes.filter(c=>c.vehiculo===v.k&&c.status!=="Inactivo");
    const rutasVeh = rutas.filter(r=>r.veh===v.k&&r.status!=="Completada"&&r.status!=="Cancelada");
    a[v.k] = {label:v.label,icon:v.icon,total:chofs.length,disp:chofs.filter(c=>c.status==="Disponible").length,enRuta:chofs.filter(c=>c.status==="En ruta").length,rutasActivas:rutasVeh.length};
    return a;
  },{});
  // Rutas próximas por fecha
  const rutasHoy = rutas.filter(r=>r.fechaProgramada===hoy&&r.status!=="Completada");
  const rutasManana = rutas.filter(r=>r.fechaProgramada===manana);
  // Ciudades más frecuentes
  const ciudades = {};
  rutas.forEach(r=>(r.stops||[]).forEach(s=>{if(!s.isOrigin)ciudades[s.city]=(ciudades[s.city]||0)+1;}));
  const topCiudades = Object.entries(ciudades).sort((a,b)=>b[1]-a[1]).slice(0,5);
  // Capacidad estimada
  const capacidadDiaria = choferes.filter(c=>c.status!=="Inactivo").length * 20; // ~20 entregas/chofer/día

  return(
    <Modal title="Capacidad Operativa" onClose={onClose} wide icon={Activity} iconColor={VIOLET}>
      {/* KPIs principales */}
      <div className="g4" style={{marginBottom:16}}>
        <div style={{background:VIOLET+"08",border:"1.5px solid "+VIOLET+"20",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>Flota total</div>
          <div style={{fontFamily:MONO,fontSize:24,fontWeight:800,color:VIOLET}}>{choferes.length}</div>
          <div style={{fontSize:10,color:MUTED}}>choferes</div>
        </div>
        <div style={{background:GREEN+"08",border:"1.5px solid "+GREEN+"20",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>Disponibles</div>
          <div style={{fontFamily:MONO,fontSize:24,fontWeight:800,color:GREEN}}>{disponibles}</div>
          <div style={{fontSize:10,color:MUTED}}>listos ya</div>
        </div>
        <div style={{background:BLUE+"08",border:"1.5px solid "+BLUE+"20",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>En ruta</div>
          <div style={{fontFamily:MONO,fontSize:24,fontWeight:800,color:BLUE}}>{enRuta}</div>
          <div style={{fontSize:10,color:MUTED}}>activos</div>
        </div>
        <div style={{background:A+"08",border:"1.5px solid "+A+"20",borderRadius:12,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>Cap. diaria</div>
          <div style={{fontFamily:MONO,fontSize:24,fontWeight:800,color:A}}>{capacidadDiaria}</div>
          <div style={{fontSize:10,color:MUTED}}>~entregas/día</div>
        </div>
      </div>

      {/* Por tipo de vehículo */}
      <div style={{fontSize:11,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,marginTop:12}}>Por tipo de vehículo</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        {Object.entries(porVehiculo).map(([k,v])=>(
          <div key={k} style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"12px 14px",textAlign:"center"}}>
            <div style={{fontSize:20,marginBottom:4}}>{v.icon}</div>
            <div style={{fontSize:12,fontWeight:700}}>{v.label}</div>
            <div style={{fontFamily:MONO,fontSize:18,fontWeight:800,color:A,marginTop:6}}>{v.total}</div>
            <div style={{fontSize:10,color:MUTED}}>choferes asignados</div>
            <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:6,fontSize:9}}>
              <span style={{color:GREEN,fontWeight:700}}>● {v.disp} disp.</span>
              <span style={{color:BLUE,fontWeight:700}}>● {v.enRuta} en ruta</span>
            </div>
            <div style={{fontSize:10,color:MUTED,marginTop:4}}>{v.rutasActivas} rutas activas</div>
          </div>
        ))}
      </div>

      {/* Agenda */}
      <div className="g2" style={{marginBottom:16}}>
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>📅 Hoy ({hoy})</div>
          <div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:A}}>{rutasHoy.length}</div>
          <div style={{fontSize:11,color:MUTED}}>rutas programadas</div>
        </div>
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>📅 Mañana ({manana})</div>
          <div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:VIOLET}}>{rutasManana.length}</div>
          <div style={{fontSize:11,color:MUTED}}>rutas programadas</div>
        </div>
      </div>

      {/* Top ciudades */}
      {topCiudades.length>0&&<div>
        <div style={{fontSize:11,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Top ciudades recurrentes</div>
        {topCiudades.map(([ciudad,n],i)=>(
          <div key={ciudad} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f8fafd",borderRadius:9,marginBottom:5}}>
            <div style={{width:22,height:22,borderRadius:7,background:A+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:A}}>{i+1}</div>
            <div style={{flex:1,fontSize:13,fontWeight:600}}>{ciudad}</div>
            <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:A}}>{n} rutas</span>
          </div>
        ))}
      </div>}

      {/* Alertas */}
      {disponibles===0&&choferes.length>0&&<div style={{marginTop:14,padding:"12px 14px",background:ROSE+"08",borderRadius:10,border:"1.5px solid "+ROSE+"20",fontSize:12,color:ROSE,fontWeight:600}}>
        ⚠️ No hay choferes disponibles en este momento
      </div>}
      {capacidadDiaria<rutasHoy.length*3&&rutasHoy.length>0&&<div style={{marginTop:14,padding:"12px 14px",background:AMBER+"08",borderRadius:10,border:"1.5px solid "+AMBER+"20",fontSize:12,color:AMBER,fontWeight:600}}>
        ⚠️ Podría haber sobrecarga hoy: {rutasHoy.length} rutas vs capacidad de ~{capacidadDiaria} entregas
      </div>}
    </Modal>
  );
}

/* Mini-mapa que muestra todos los puntos de una ruta en preview */
function RouteMapPreview({stops,height=280}){
  const mapRef = useRef(null);
  const mapCont = useRef(null);
  const markersRef = useRef([]);

  // Recopila todos los puntos (lat,lng) con categoría
  const allPoints = useMemo(()=>{
    const arr = [];
    stops.forEach((s,ci)=>{
      (s.puntos||[]).forEach((p,pi)=>{
        if(p.lat&&p.lng) arr.push({lat:p.lat,lng:p.lng,name:p.name,ciudad:s.city,cityIdx:ci,puntoIdx:pi,isOrigin:s.isOrigin||p.isOrigin});
      });
    });
    return arr;
  },[stops]);

  useEffect(()=>{
    if(!MAPBOX_TOKEN||!mapCont.current||mapRef.current)return;
    mapRef.current = new mapboxgl.Map({
      container:mapCont.current,
      style:"mapbox://styles/mapbox/streets-v12",
      center:MX_CENTER,
      zoom:5,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(),"top-right");
    return()=>{mapRef.current?.remove();mapRef.current=null;};
  },[]);

  useEffect(()=>{
    if(!mapRef.current) return;
    // Limpia marcadores previos
    markersRef.current.forEach(m=>m.remove());
    markersRef.current = [];
    if(allPoints.length===0) return;
    allPoints.forEach((p,idx)=>{
      const el = document.createElement("div");
      const color = p.isOrigin?BLUE:A;
      el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(12,24,41,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;font-family:${MONO};cursor:pointer;`;
      el.textContent = String(idx+1);
      const popup = new mapboxgl.Popup({offset:16,closeButton:false}).setHTML(`<div style="font-family:${SANS};padding:4px;max-width:200px"><div style="font-weight:700;font-size:12px">${p.name}</div><div style="font-size:10px;color:#607080">${p.ciudad}</div></div>`);
      const marker = new mapboxgl.Marker(el).setLngLat([p.lng,p.lat]).setPopup(popup).addTo(mapRef.current);
      markersRef.current.push(marker);
    });
    // Fit bounds
    const bounds = new mapboxgl.LngLatBounds();
    allPoints.forEach(p=>bounds.extend([p.lng,p.lat]));
    if(!bounds.isEmpty()) mapRef.current.fitBounds(bounds,{padding:50,maxZoom:14,duration:500});
  },[allPoints]);

  if(!MAPBOX_TOKEN){
    return <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20,textAlign:"center",color:MUTED,fontSize:12}}>Mapbox token no configurado</div>;
  }
  return(
    <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
      <div style={{padding:"12px 18px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase"}}>Vista previa de la ruta</div>
        <Tag color={A} sm>{allPoints.length} puntos</Tag>
      </div>
      <div ref={mapCont} style={{width:"100%",height}}/>
      {allPoints.length===0&&<div style={{position:"relative",top:-height/2-20,textAlign:"center",color:MUTED,fontSize:12,pointerEvents:"none"}}>Agrega puntos específicos a las ciudades para visualizarlos aquí</div>}
    </div>
  );
}

function PlanificadorRutas(){
  const [nombre,setNombre]=useState("");
  const [cliente,setCliente]=useState("");
  const [clienteTel,setClienteTel]=useState("");
  const [clienteEmail,setClienteEmail]=useState("");
  const [veh,setVeh]=useState("cam");
  const [choferId,setChoferId]=useState("");
  const [optimizing,setOptimizing]=useState(false);
  const [optimResult,setOptimResult]=useState(null);
  const [showImport,setShowImport]=useState(false);
  const [showCapacidad,setShowCapacidad]=useState(false);
  const [costoParadaExtra,setCostoParadaExtra]=useState(0);
  const [aplicarParadaExtra,setAplicarParadaExtra]=useState(false);
  const [paradasIncluidas,setParadasIncluidas]=useState(1);
  const [choferesList,setChoferesList]=useState([]);
  useEffect(()=>onSnapshot(collection(db,"choferes"),s=>setChoferesList(s.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.status!=="Inactivo"))),[]);
  const [stops,setStops]=useState([]);
  const [search,setSearch]=useState("");
  const [searchOrigen,setSearchOrigen]=useState("");
  const [maxDia,setMaxDia]=useState(20);
  const [plazo,setPlazo]=useState(5);
  const [comida,setComida]=useState(COMIDA);
  const [hotel,setHotel]=useState(HOTEL);
  const [pVan,setPVan]=useState(1);
  const [ayud,setAyud]=useState(false);
  const [urg,setUrg]=useState(false);
  const [rutas,setRutas]=useState([]);
  const [loadR,setLoadR]=useState(true);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState(null);
  const [viewR,setViewR]=useState(null);
  const [picker,setPicker]=useState(null); // {stopId, isOrigin}
  const showT=(m,t="ok")=>setToast({msg:m,type:t});

  useEffect(()=>{
    return onSnapshot(collection(db,"rutas"),s=>{
      setRutas(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      setLoadR(false);
    });
  },[]);

  const totalPDV=useMemo(()=>stops.filter(s=>!s.isOrigin).reduce((a,s)=>a+(s.pdv||0),0),[stops]);
  const totalKm=useMemo(()=>{
    let km=0;
    for(let i=1;i<stops.length;i++) km+=Math.abs((stops[i].km||0)-(stops[i-1].km||0))*.8+Math.min(stops[i-1].km||0,stops[i].km||0)*.2;
    return Math.round(km);
  },[stops]);

  const {vans,dias:diasOp,capDia}=useMemo(()=>totalPDV>0?calcFlota(totalPDV,maxDia,plazo):{vans:1,dias:0,capDia:maxDia},[totalPDV,maxDia,plazo]);
  const vehD=VEHK.find(v=>v.k===veh);
  const crew=vans*((vehD?.crew||1)+pVan-1+(ayud?1:0));
  const {xC,xH,total:xViat,dias:diasF,noches}=useMemo(()=>calcViaticos(totalKm,crew,comida,hotel),[totalKm,crew,comida,hotel]);
  const tarifaT=useMemo(()=>stops.filter(s=>!s.isOrigin).reduce((a,s)=>a+(s.base||0),0)*vans,[stops,vans]);
  // Cuenta todas las paradas (puntos específicos) de todos los destinos
  const totalPuntosDestino = useMemo(()=>stops.filter(s=>!s.isOrigin).reduce((a,s)=>a+((s.puntos||[]).length||1),0),[stops]);
  const paradasExtra = Math.max(0, totalPuntosDestino - paradasIncluidas);
  const xParadasExtra = aplicarParadaExtra ? paradasExtra * (Number(costoParadaExtra)||0) : 0;
  const xU=urg?tarifaT*.35:0;
  const sub=tarifaT+xU+xViat+xParadasExtra;
  const iva=sub*.16;
  const total=sub+iva;
  const mapU=useMemo(()=>mapsURL(stops.map(s=>s.city)),[stops]);

  const addStop=async t=>{
    const geo = await geocodeCity(t.c);
    setStops(p=>[...p,{id:uid(),city:t.c,pdv:0,km:t.km,base:t[veh],isOrigin:false,puntos:[],cityBbox:geo?.bbox||null,cityCenter:geo?.center||null}]);
    setSearch("");
  };
  const rmStop=id=>setStops(p=>p.filter(s=>s.id!==id));
  const updStop=(id,k,v)=>setStops(p=>p.map(s=>s.id===id?{...s,[k]:v}:s));
  const mvUp=i=>{if(i<=0)return;setStops(p=>{const a=[...p];[a[i-1],a[i]]=[a[i],a[i-1]];return a;});};
  const mvDn=i=>{if(i>=stops.length-1)return;setStops(p=>{const a=[...p];[a[i],a[i+1]]=[a[i+1],a[i]];return a;});};

  useEffect(()=>{
    setStops(p=>p.map(s=>{
      const t=TAR.find(t=>t.c===s.city);
      // Los orígenes normalmente no cobran (base=0), salvo servicio local donde el origen genera tarifa
      if(s.isOrigin) return s;
      return t?{...s,base:t[veh]}:s;
    }));
  },[veh]);

  const handleSave=async()=>{
    if(!nombre.trim()){showT("Agrega un nombre a la ruta","err");return;}
    if(stops.filter(s=>!s.isOrigin).length===0){showT("Agrega al menos un destino","err");return;}
    setSaving(true);
    try{
      const choferSel = choferesList.find(c=>c.id===choferId);
      const trackingId = Math.random().toString(36).slice(2,10).toUpperCase();
      await addDoc(collection(db,"rutas"),{nombre,cliente,clienteTel:(clienteTel||"").replace(/\D/g,""),clienteEmail:clienteEmail||"",trackingId,veh,vehiculoLabel:vehD?.label,stops:stops.map(s=>({city:s.city,pdv:s.pdv||0,km:s.km||0,addr:s.addr||"",isOrigin:!!s.isOrigin,puntos:(s.puntos||[]).map(p=>({id:p.id,name:p.name||"",address:p.address||"",lat:p.lat||0,lng:p.lng||0,notas:p.notas||"",isOrigin:!!p.isOrigin}))})),totalPDV,totalKm,vans,diasOp,capDia,crew,xViat,tarifaT,sub,iva,total,plazo,maxDia,mapURL:mapU,status:"Programada",progreso:0,choferId:choferId||"",choferNombre:choferSel?.nombre||"",choferTel:choferSel?.tel||"",choferPlaca:choferSel?.placa||"",createdAt:serverTimestamp()});
      // Notifica al cliente si tiene tel
      if(clienteTel&&clienteTel.replace(/\D/g,"").length===10){
        setTimeout(()=>{
          const url = `${window.location.origin}/track/${trackingId}`;
          const msg = `Hola ${cliente||""}! Tu ruta "${nombre}" de DMvimiento ha sido programada. Puedes seguirla en tiempo real aquí: ${url}`;
          const waUrl = `https://wa.me/52${clienteTel.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`;
          if(confirm("¿Enviar link de tracking al cliente por WhatsApp?\n\nSe abrirá WhatsApp con el mensaje pre-llenado.")){
            window.open(waUrl,"_blank");
          }
        },400);
      }
      showT("✓ Ruta guardada");
    }catch(e){showT(e.message,"err");}
    setSaving(false);
  };

  const sc={Programada:VIOLET,"En curso":BLUE,Completada:GREEN,Cancelada:ROSE};

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {picker&&(()=>{
        const s = stops.find(x=>x.id===picker.stopId);
        if(!s) return null;
        return <LocationPicker
          title={picker.isOrigin?`Origen específico en ${s.city}`:`Punto de entrega en ${s.city}`}
          cityHint={s.city}
          bbox={s.cityBbox||CITY_BBOX[s.city]}
          proximity={s.cityCenter}
          onClose={()=>setPicker(null)}
          onSelect={(place)=>{
            const puntos = [...(s.puntos||[]),{id:uid(),...place,notas:"",isOrigin:!!picker.isOrigin}];
            updStop(s.id,"puntos",puntos);
            showT("✓ Punto agregado: "+place.name);
          }}
        />;
      })()}
      {!MAPBOX_TOKEN&&<div style={{background:ROSE+"10",border:"1.5px solid "+ROSE+"50",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",gap:10,alignItems:"flex-start"}}>
        <AlertCircle size={18} color={ROSE} style={{flexShrink:0,marginTop:1}}/>
        <div style={{flex:1,fontSize:12,color:TEXT,lineHeight:1.5}}>
          <div style={{fontWeight:800,color:ROSE,marginBottom:3}}>Mapbox no está configurado</div>
          No podrás buscar direcciones (Walmart, Estadio Harp Helú, etc.) hasta configurar un token válido. Ve a <strong>Vercel → Settings → Environment Variables</strong>, agrega <code style={{fontFamily:MONO,background:"#fff",padding:"1px 5px",borderRadius:4,border:"1px solid "+BD2}}>VITE_MAPBOX_TOKEN</code> con un token público de <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer" style={{color:BLUE,fontWeight:700}}>account.mapbox.com</a>, redeploy, y recarga esta página.
        </div>
      </div>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div><h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Planificador de Rutas</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>Multi-parada · Flota automática · Import CSV/Excel</p></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setShowCapacidad(true)} className="btn" title="Capacidad operativa" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+VIOLET+"40",color:VIOLET,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><Activity size={13}/>Capacidad</button>
          <button onClick={()=>setShowImport(true)} className="btn" title="Importar rutas desde CSV/Excel" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+BLUE+"40",color:BLUE,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><Upload size={13}/>Importar CSV</button>
          <button onClick={()=>exportRutasXLSX(rutas)} className="btn" title="Exportar rutas guardadas a Excel" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+GREEN+"40",color:GREEN,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><Download size={13}/>Exportar XLSX</button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 350px",gap:16,alignItems:"start"}}>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>

          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Datos de la ruta</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:11}}>
              <Inp label="Nombre de ruta *" value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej: MTY Noreste S12"/>
              <Inp label="Cliente" value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Nombre del cliente"/>
              <Inp label="WhatsApp cliente (10 díg)" value={clienteTel} onChange={e=>setClienteTel(e.target.value)} placeholder="5512345678"/>
              <Inp label="Email cliente (opcional)" type="email" value={clienteEmail} onChange={e=>setClienteEmail(e.target.value)} placeholder="cliente@empresa.com"/>
            </div>
            <div style={{padding:"8px 12px",background:BLUE+"08",borderRadius:8,fontSize:11,color:BLUE,marginBottom:11,display:"flex",alignItems:"center",gap:7}}>
              <Bell size={12}/>
              <span>El cliente recibirá link de tracking + notificaciones por WhatsApp cuando se registren entregas</span>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>Asignar chofer</div>
              <select value={choferId} onChange={e=>setChoferId(e.target.value)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:14,cursor:"pointer"}}>
                <option value="">— Sin asignar —</option>
                {choferesList.map(c=><option key={c.id} value={c.id}>{c.nombre} · {c.tel} {c.placa?"· "+c.placa:""} {c.status!=="Disponible"?"("+c.status+")":""}</option>)}
              </select>
              {choferesList.length===0&&<div style={{fontSize:11,color:AMBER,marginTop:5}}>⚠️ No hay choferes registrados. Ve a "Choferes" para agregar.</div>}
            </div>
          </div>

          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"visible"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid "+BORDER}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                <span style={{fontFamily:DISP,fontWeight:700,fontSize:15}}>Armado de ruta</span>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  <Tag color={GREEN} sm>{stops.filter(s=>s.isOrigin).length} orígenes</Tag>
                  <Tag color={A} sm>{stops.filter(s=>!s.isOrigin).length} destinos</Tag>
                  <Tag color={VIOLET} sm>{stops.reduce((a,s)=>a+(s.puntos?.length||0),0)} puntos</Tag>
                  <Tag color={BLUE} sm>{totalPDV.toLocaleString()} PDVs</Tag>
                </div>
              </div>
              {stops.length===0&&<div style={{marginBottom:10,padding:"12px 14px",background:"linear-gradient(135deg,"+A+"08,"+VIOLET+"08)",borderRadius:11,border:"1.5px solid "+A+"25"}}>
                <div style={{fontSize:12,fontWeight:700,color:A,marginBottom:6}}>🚀 ¿Empezamos? Elige un preset para armar más rápido:</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>{
                    const cdmx = TAR.find(t=>t.c==="Ciudad de México");
                    const bbox = CITY_BBOX["Ciudad de México"];
                    const center = [(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2];
                    setStops([{id:uid(),city:"Ciudad de México",pdv:0,km:0,base:cdmx?cdmx[veh]:0,isOrigin:true,puntos:[],cityBbox:bbox,cityCenter:center}]);
                  }} className="btn" style={{background:"#fff",border:"1.5px solid "+BLUE+"30",borderRadius:9,padding:"7px 12px",fontSize:11,fontWeight:700,color:BLUE,display:"flex",alignItems:"center",gap:5}}>🏠 Servicio Local CDMX</button>
                  <button onClick={()=>{
                    const bbox = CITY_BBOX["Ciudad de México"];
                    const center = [(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2];
                    setStops([{id:uid(),city:"Ciudad de México",pdv:0,km:0,base:0,isOrigin:true,puntos:[],cityBbox:bbox,cityCenter:center}]);
                  }} className="btn" style={{background:"#fff",border:"1.5px solid "+GREEN+"30",borderRadius:9,padding:"7px 12px",fontSize:11,fontWeight:700,color:GREEN,display:"flex",alignItems:"center",gap:5}}>📤 Origen CDMX (foráneo)</button>
                  <span style={{fontSize:11,color:MUTED,alignSelf:"center"}}>o arma desde cero abajo</span>
                </div>
              </div>}
              <div style={{fontSize:11,color:MUTED,lineHeight:1.5}}>
                📤 <strong style={{color:GREEN}}>Orígenes</strong>: donde se carga la mercancía (bodegas, almacenes).<br/>
                📥 <strong style={{color:A}}>Destinos</strong>: donde se entrega. Mismas o diferentes ciudades. Puedes agregar varios puntos por ciudad.
              </div>
            </div>
            <div style={{padding:14,display:"flex",flexDirection:"column",gap:10}}>
              {/* SECCIÓN ORÍGENES */}
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 2px"}}>
                <div style={{width:20,height:20,borderRadius:6,background:GREEN,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{color:"#fff",fontSize:11,fontWeight:800}}>↑</span>
                </div>
                <span style={{fontSize:11,fontWeight:800,color:GREEN,letterSpacing:"0.06em",textTransform:"uppercase"}}>Orígenes · Puntos de carga</span>
                <div style={{flex:1,height:1,background:GREEN+"30"}}/>
              </div>
              {stops.filter(s=>s.isOrigin).length===0&&<div style={{padding:"18px 14px",background:GREEN+"04",border:"1.5px dashed "+GREEN+"30",borderRadius:11,textAlign:"center",color:MUTED,fontSize:12}}>
                Aún no hay punto de origen. Agrega la ciudad donde se carga la mercancía abajo.
              </div>}
              {stops.filter(s=>s.isOrigin).map((s,originIdx)=>{
                const i = stops.findIndex(x=>x.id===s.id);
                return(
                <div key={s.id} style={{background:GREEN+"05",border:"1.5px solid "+GREEN+"35",borderRadius:12,overflow:"visible",transition:"all .13s",position:"relative"}}>
                  {/* Header de la ciudad */}
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:s.isOrigin?"#f8fafd":A+"06",borderBottom:s.isOrigin?"none":"1px solid "+A+"15"}}>
                    <div style={{width:24,height:24,borderRadius:"50%",background:s.isOrigin?BLUE:A,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:14,color:TEXT}}>{s.city}</span>
                        {s.isOrigin&&<Tag color={BLUE} sm>ORIGEN</Tag>}
                        {!s.isOrigin&&s.km>0&&<span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{s.km.toLocaleString()} km</span>}
                        {!s.isOrigin&&s.puntos?.length>0&&<Tag color={VIOLET} sm>{s.puntos.length} puntos</Tag>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:3}}>
                      {!s.isOrigin&&<button onClick={()=>mvUp(i)} className="btn" style={{border:"1px solid "+BD2,borderRadius:6,padding:"3px 5px",color:MUTED}}><ChevronUp size={10}/></button>}
                      {!s.isOrigin&&<button onClick={()=>mvDn(i)} className="btn" style={{border:"1px solid "+BD2,borderRadius:6,padding:"3px 5px",color:MUTED}}><ChevronDown size={10}/></button>}
                      <button onClick={()=>rmStop(s.id)} className="btn" style={{border:"1px solid "+ROSE+"28",background:ROSE+"08",borderRadius:6,padding:"3px 5px",color:ROSE}}><X size={10}/></button>
                    </div>
                  </div>
                  {/* Puntos específicos de la ciudad */}
                  <div style={{padding:"10px 14px"}}>
                    {!s.isOrigin&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Total PDVs ciudad</div>
                        <input type="number" value={s.pdv||""} onChange={e=>updStop(s.id,"pdv",parseInt(e.target.value)||0)} placeholder="0"
                          style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontFamily:MONO,fontSize:15,fontWeight:700,color:A}}/>
                      </div>
                      <div>
                        <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Zona general</div>
                        <input type="text" value={s.addr||""} onChange={e=>updStop(s.id,"addr",e.target.value)} placeholder="Opcional"
                          style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontSize:13}}/>
                      </div>
                    </div>}
                    {/* Lista de puntos */}
                    {(s.puntos||[]).map((p,pi)=>(
                      <div key={p.id} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"8px 10px",background:VIOLET+"06",border:"1px solid "+VIOLET+"20",borderRadius:9,marginBottom:6}}>
                        <div style={{width:20,height:20,borderRadius:"50%",background:VIOLET,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0,marginTop:2}}>{pi+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:12,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                          <div style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.address}</div>
                          {p.notas&&<div style={{fontSize:10,color:BLUE,marginTop:2}}>📝 {p.notas}</div>}
                          <input value={p.notas||""} onChange={e=>{
                            const puntos = s.puntos.map(x=>x.id===p.id?{...x,notas:e.target.value}:x);
                            updStop(s.id,"puntos",puntos);
                          }} placeholder="Agregar nota/referencia…" style={{width:"100%",marginTop:5,background:"#fff",border:"1px solid "+BD2,borderRadius:6,padding:"4px 8px",fontSize:11}}/>
                        </div>
                        <button onClick={()=>{
                          const puntos = s.puntos.filter(x=>x.id!==p.id);
                          updStop(s.id,"puntos",puntos);
                        }} className="btn" style={{color:ROSE,padding:4}}><X size={11}/></button>
                      </div>
                    ))}
                    {/* Agregar punto específico — ORIGEN */}
                    {s.isOrigin&&MAPBOX_TOKEN&&<div style={{padding:"10px 12px",background:BLUE+"04",border:"1.5px dashed "+BLUE+"40",borderRadius:10,marginTop:4}}>
                      <div style={{fontSize:9,fontWeight:800,color:BLUE,marginBottom:8,letterSpacing:"0.05em"}}>+ PUNTO DE ORIGEN ESPECÍFICO (bodega) EN {s.city.toUpperCase()}</div>
                      <button onClick={()=>setPicker({stopId:s.id,isOrigin:true})} className="btn" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 14px",background:"linear-gradient(135deg,"+BLUE+",#3b82f6)",color:"#fff",borderRadius:10,fontFamily:SANS,fontWeight:800,fontSize:13,boxShadow:"0 4px 14px "+BLUE+"30",marginBottom:8}}>
                        <Map size={15}/>Abrir mapa y buscar
                      </button>
                      <AddressSearch compact placeholder={"Atajo: Bodega, dirección en "+s.city+"…"} bbox={s.cityBbox||CITY_BBOX[s.city]} proximity={s.cityCenter} cityHint={s.city} onSelect={(place)=>{
                        const puntos = [...(s.puntos||[]),{id:uid(),...place,notas:"",isOrigin:true}];
                        updStop(s.id,"puntos",puntos);
                      }}/>
                    </div>}
                  </div>
                </div>
              );})}
              {/* Botón agregar otro origen */}
              <div style={{padding:"10px 12px",background:GREEN+"06",border:"1.5px dashed "+GREEN+"40",borderRadius:11}}>
                <div style={{fontSize:10,fontWeight:800,color:GREEN,marginBottom:6,letterSpacing:"0.05em"}}>{stops.filter(s=>s.isOrigin).length===0?"+ AGREGAR ORIGEN":"+ AGREGAR OTRO ORIGEN"}</div>
                <CitySearch value={searchOrigen} onChange={setSearchOrigen} onSelect={async t=>{
                  const geo = await geocodeCity(t.c);
                  setStops(p=>[...p,{id:uid(),city:t.c,pdv:0,km:t.km,base:0,isOrigin:true,puntos:[],cityBbox:geo?.bbox||null,cityCenter:geo?.center||null}]);
                  setSearchOrigen("");
                }} veh={veh} exclude={stops.filter(s=>s.isOrigin).map(s=>s.city)}/>
                <div style={{fontSize:10,color:MUTED,marginTop:6,lineHeight:1.5}}>💡 Busca "Ciudad de México" para servicio local · Después adentro puedes agregar la dirección exacta de la bodega</div>
              </div>

              {/* SECCIÓN DESTINOS */}
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 2px 4px",marginTop:8}}>
                <div style={{width:20,height:20,borderRadius:6,background:A,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{color:"#fff",fontSize:11,fontWeight:800}}>↓</span>
                </div>
                <span style={{fontSize:11,fontWeight:800,color:A,letterSpacing:"0.06em",textTransform:"uppercase"}}>Destinos · Puntos de entrega</span>
                <div style={{flex:1,height:1,background:A+"30"}}/>
              </div>
              {stops.filter(s=>!s.isOrigin).length===0&&<div style={{padding:"20px 18px",background:"linear-gradient(135deg,"+A+"08,"+A+"12)",border:"2px dashed "+A+"50",borderRadius:14,textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>📥</div>
                <div style={{fontSize:13,fontWeight:700,color:A,marginBottom:4}}>Ahora agrega tu primer destino</div>
                <div style={{fontSize:11,color:MUTED,marginBottom:10,lineHeight:1.5}}>
                  ¿Servicio local CDMX→CDMX? Escribe "Ciudad de México" en el buscador naranja ↓<br/>
                  ¿Foráneo? Busca otra ciudad como Acapulco, Guadalajara, Monterrey…
                </div>
                <div className="pulse" style={{fontSize:24,color:A,fontWeight:900}}>↓</div>
              </div>}
              {stops.filter(s=>!s.isOrigin).map((s)=>{
                const i = stops.findIndex(x=>x.id===s.id);
                return(
                <div key={s.id} style={{background:"#fff",border:"1.5px solid "+A+"30",borderRadius:12,overflow:"visible",transition:"all .13s",position:"relative"}}>
                  {/* Header */}
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:A+"06",borderBottom:"1px solid "+A+"15"}}>
                    <div style={{width:24,height:24,borderRadius:"50%",background:A,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0}}>{stops.filter(x=>!x.isOrigin).findIndex(x=>x.id===s.id)+1}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:14,color:TEXT}}>{s.city}</span>
                        {s.km>0&&<span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{s.km.toLocaleString()} km</span>}
                        {s.puntos?.length>0&&<Tag color={VIOLET} sm>{s.puntos.length} puntos</Tag>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:3}}>
                      <button onClick={()=>mvUp(i)} className="btn" style={{border:"1px solid "+BD2,borderRadius:6,padding:"3px 5px",color:MUTED}}><ChevronUp size={10}/></button>
                      <button onClick={()=>mvDn(i)} className="btn" style={{border:"1px solid "+BD2,borderRadius:6,padding:"3px 5px",color:MUTED}}><ChevronDown size={10}/></button>
                      <button onClick={()=>rmStop(s.id)} className="btn" style={{border:"1px solid "+ROSE+"28",background:ROSE+"08",borderRadius:6,padding:"3px 5px",color:ROSE}}><X size={10}/></button>
                    </div>
                  </div>
                  {/* Contenido */}
                  <div style={{padding:"10px 14px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Total PDVs ciudad</div>
                        <input type="number" value={s.pdv||""} onChange={e=>updStop(s.id,"pdv",parseInt(e.target.value)||0)} placeholder="0"
                          style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontFamily:MONO,fontSize:15,fontWeight:700,color:A}}/>
                      </div>
                      <div>
                        <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Zona general</div>
                        <input type="text" value={s.addr||""} onChange={e=>updStop(s.id,"addr",e.target.value)} placeholder="Opcional"
                          style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontSize:13}}/>
                      </div>
                    </div>
                    {/* Puntos específicos del destino */}
                    {(s.puntos||[]).map((p,pi)=>(
                      <div key={p.id} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"8px 10px",background:VIOLET+"06",border:"1px solid "+VIOLET+"20",borderRadius:9,marginBottom:6}}>
                        <div style={{width:20,height:20,borderRadius:"50%",background:VIOLET,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0,marginTop:2}}>{pi+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:12,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                          <div style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.address}</div>
                          <input value={p.notas||""} onChange={e=>{
                            const puntos = s.puntos.map(x=>x.id===p.id?{...x,notas:e.target.value}:x);
                            updStop(s.id,"puntos",puntos);
                          }} placeholder="Agregar nota/referencia…" style={{width:"100%",marginTop:5,background:"#fff",border:"1px solid "+BD2,borderRadius:6,padding:"4px 8px",fontSize:11}}/>
                        </div>
                        <button onClick={()=>{
                          const puntos = s.puntos.filter(x=>x.id!==p.id);
                          updStop(s.id,"puntos",puntos);
                        }} className="btn" style={{color:ROSE,padding:4}}><X size={11}/></button>
                      </div>
                    ))}
                    {/* Agregar punto en este destino — MAPA INTERACTIVO + atajo de búsqueda */}
                    {MAPBOX_TOKEN&&<div style={{padding:"10px 12px",background:VIOLET+"04",border:"1.5px dashed "+VIOLET+"40",borderRadius:10,marginTop:6}}>
                      <div style={{fontSize:9,fontWeight:800,color:VIOLET,marginBottom:8,letterSpacing:"0.05em"}}>+ AGREGAR PUNTO ESPECÍFICO EN {s.city.toUpperCase()}</div>
                      <button onClick={()=>setPicker({stopId:s.id,isOrigin:false})} className="btn" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 14px",background:"linear-gradient(135deg,"+VIOLET+",#9d5cff)",color:"#fff",borderRadius:10,fontFamily:SANS,fontWeight:800,fontSize:13,boxShadow:"0 4px 14px "+VIOLET+"30",marginBottom:8}}>
                        <Map size={15}/>Abrir mapa y buscar ubicación
                      </button>
                      <div style={{fontSize:10,color:MUTED,textAlign:"center",margin:"4px 0 8px"}}>o búsqueda rápida sin mapa:</div>
                      <AddressSearch compact placeholder={"Ej: Walmart, Estadio Harp Helu, dirección en "+s.city+"…"} bbox={s.cityBbox||CITY_BBOX[s.city]} proximity={s.cityCenter} cityHint={s.city} onSelect={(place)=>{
                        const puntos = [...(s.puntos||[]),{id:uid(),...place,notas:""}];
                        updStop(s.id,"puntos",puntos);
                      }}/>
                    </div>}
                  </div>
                </div>
              );})}
              {/* Botón agregar ciudad destino */}
              <div style={{padding:"11px 13px",background:A+"06",border:"1.5px dashed "+A+"38",borderRadius:11}}>
                <div style={{fontSize:10,fontWeight:800,color:A,marginBottom:8,letterSpacing:"0.05em"}}>+ AGREGAR CIUDAD DESTINO</div>
                <CitySearch value={search} onChange={setSearch} onSelect={addStop} veh={veh} exclude={stops.filter(s=>!s.isOrigin).map(s=>s.city)}/>
                <div style={{fontSize:10,color:MUTED,marginTop:6,lineHeight:1.5}}>💡 Puedes agregar "Ciudad de México" como destino si haces entregas locales · Y después agregar múltiples puntos específicos (Walmart, Chedraui, direcciones) dentro de la ciudad</div>
              </div>
            </div>
          </div>

          {/* Vista previa del mapa + optimización IA */}
          <RouteMapPreview stops={stops}/>

          {stops.reduce((a,s)=>a+(s.puntos||[]).filter(p=>p.lat&&p.lng).length,0)>=3&&<div style={{background:"linear-gradient(135deg,"+VIOLET+"08,"+A+"08)",border:"1.5px solid "+VIOLET+"30",borderRadius:14,padding:16,display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:44,height:44,borderRadius:12,background:VIOLET+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Zap size={20} color={VIOLET}/></div>
            <div style={{flex:1}}>
              <div style={{fontFamily:DISP,fontWeight:800,fontSize:14,color:TEXT}}>Optimización con IA</div>
              <div style={{fontSize:11,color:MUTED,marginTop:2}}>Reordena los puntos automáticamente para minimizar kilómetros y tiempo de manejo</div>
              {optimResult&&<div style={{fontSize:11,color:GREEN,fontWeight:700,marginTop:4}}>
                ✓ Optimizado: {(optimResult.distance/1000).toFixed(1)} km · {Math.round(optimResult.duration/60)} min
              </div>}
            </div>
            <button onClick={async()=>{
              setOptimizing(true);setOptimResult(null);
              try{
                // Extrae puntos con lat/lng en orden actual
                const points = [];
                const mapping = [];
                stops.forEach((s,ci)=>{
                  (s.puntos||[]).forEach((p,pi)=>{
                    if(p.lat&&p.lng){points.push([p.lng,p.lat]);mapping.push({ci,pi});}
                  });
                });
                if(points.length<3){showT("Necesitas al menos 3 puntos con coordenadas","warn");setOptimizing(false);return;}
                const result = await optimizeStops(points);
                if(!result){showT("No se pudo optimizar la ruta","err");setOptimizing(false);return;}
                // Reordena los puntos dentro de cada ciudad según el resultado
                const newOrder = result.order;
                // Reconstruye el orden
                const reorderedByCity = {};
                newOrder.forEach((origIdx,newPos)=>{
                  const m = mapping[origIdx];
                  if(!m)return;
                  if(!reorderedByCity[m.ci]) reorderedByCity[m.ci] = [];
                  reorderedByCity[m.ci].push(stops[m.ci].puntos[m.pi]);
                });
                // Aplica
                setStops(p=>p.map((s,ci)=>{
                  if(reorderedByCity[ci]) return {...s,puntos:reorderedByCity[ci]};
                  return s;
                }));
                setOptimResult(result);
                showT("✓ Ruta optimizada con IA");
              }catch(e){showT(e.message,"err");}
              setOptimizing(false);
            }} disabled={optimizing} className="btn" style={{background:"linear-gradient(135deg,"+VIOLET+",#a855f7)",color:"#fff",borderRadius:10,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:13,boxShadow:"0 4px 16px "+VIOLET+"30",display:"flex",alignItems:"center",gap:7}}>
              {optimizing?<><div className="spin" style={{width:12,height:12,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}}/>Optimizando…</>:<><Zap size={14}/>Optimizar</>}
            </button>
          </div>}

          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Vehículo y flota</div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
              {VEHK.map(v=>(
                <button key={v.k} onClick={()=>setVeh(v.k)} className="btn" style={{flex:1,minWidth:90,padding:"9px 6px",borderRadius:10,border:"2px solid "+(veh===v.k?A:BD2),background:veh===v.k?A+"08":"#fff",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:17,marginBottom:2}}>{v.icon}</div>
                  <div style={{fontSize:11,fontWeight:700,color:veh===v.k?A:MUTED}}>{v.label}</div>
                </button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:11,marginBottom:13}}>
              <Spin label="Entregas máx/día/van" value={maxDia} onChange={setMaxDia} min={1} max={300}/>
              <Spin label="Plazo máximo (días)" value={plazo} onChange={setPlazo} min={1} max={90}/>
              <Spin label="Personas por van" value={pVan} onChange={setPVan} min={1} max={5}/>
            </div>
            {totalPDV>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:13}}>
              <InfoBox icon={Truck} color={A} title="Vans necesarias" value={vans} sub={"para "+plazo+" días"}/>
              <InfoBox icon={Calendar} color={BLUE} title="Días operación" value={diasOp} sub={capDia+"/día"}/>
              <InfoBox icon={Users} color={VIOLET} title="Personal total" value={crew}/>
            </div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <Tog checked={ayud} onChange={setAyud} label="💪 Ayudante/van" color={VIOLET}/>
              <Tog checked={urg} onChange={setUrg} label="⚡ Urgente +35%" color={ROSE}/>
            </div>
          </div>

          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Viáticos del personal</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:diasF>0?11:0}}>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Comida/persona/día</div>
                <input type="number" value={comida} onChange={e=>setComida(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Hotel/persona/noche</div>
                <input type="number" value={hotel} onChange={e=>setHotel(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
              </div>
            </div>
            {diasF>0&&<div style={{padding:"9px 12px",background:BLUE+"08",borderRadius:9,border:"1px solid "+BLUE+"18"}}>
              <div style={{fontSize:11,color:BLUE,fontWeight:600}}>{crew}p × {diasF}d × ${comida}/comida{noches>0?" + "+noches+"n × $"+hotel+"/hotel":""}</div>
              <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:BLUE,marginTop:3}}>Total viáticos: {fmt(xViat)}</div>
            </div>}
          </div>

          {/* COSTO POR PARADA EXTRA */}
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Cargos adicionales por paradas</div>
            <Tog checked={aplicarParadaExtra} onChange={setAplicarParadaExtra} label="🛑 Cobrar extra por cada parada adicional" sub={aplicarParadaExtra?"Se aplicará un cargo por cada punto más allá del # incluido":"El precio total NO incluye costo por parada extra"} color={AMBER}/>
            {aplicarParadaExtra&&<div style={{marginTop:11,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Paradas incluidas</div>
                <input type="number" min="0" value={paradasIncluidas} onChange={e=>setParadasIncluidas(Math.max(0,parseInt(e.target.value)||0))} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                <div style={{fontSize:10,color:MUTED,marginTop:3}}>Primeras N paradas sin costo extra</div>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Costo por parada extra</div>
                <input type="number" min="0" value={costoParadaExtra} onChange={e=>setCostoParadaExtra(parseFloat(e.target.value)||0)} placeholder="200" style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700,color:AMBER}}/>
                <div style={{fontSize:10,color:MUTED,marginTop:3}}>MXN por cada parada adicional</div>
              </div>
            </div>}
            {aplicarParadaExtra&&paradasExtra>0&&<div style={{marginTop:11,padding:"10px 12px",background:AMBER+"08",borderRadius:9,border:"1px solid "+AMBER+"20"}}>
              <div style={{fontSize:11,color:AMBER,fontWeight:700}}>📍 Total puntos entrega: {totalPuntosDestino}</div>
              <div style={{fontSize:11,color:AMBER,marginTop:2}}>{paradasIncluidas} incluidas + {paradasExtra} extra × {fmt(costoParadaExtra)} = <strong>{fmt(xParadasExtra)}</strong></div>
            </div>}
          </div>

          <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
            <button onClick={handleSave} disabled={saving} className="btn" style={{flex:"2 1 200px",padding:"13px 0",borderRadius:12,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",fontFamily:DISP,fontWeight:700,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 5px 20px "+A+"35",opacity:saving?.7:1}}>
              {saving?<><div style={{width:15,height:15,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}} className="spin"/>Guardando…</>:<><Map size={17}/>Guardar Ruta</>}
            </button>
            <button onClick={async()=>{
              if(!cliente.trim()){showT("Agrega un cliente primero","err");return;}
              if(stops.filter(s=>!s.isOrigin).length===0){showT("Agrega al menos un destino","err");return;}
              // Construye conceptos detallados para el presupuesto
              const today=new Date().toISOString().slice(0,10);
              const in15=new Date(Date.now()+15*86400000).toISOString().slice(0,10);
              const conceptos=[];
              const destinos=stops.filter(s=>!s.isOrigin).map(s=>s.city).join(" → ");
              conceptos.push({desc:`Transporte ${vehD?.label||""} · ${destinos}`,cant:vans,precio:tarifaT/vans});
              if(xViat>0) conceptos.push({desc:`Viáticos del personal (${crew} personas × ${diasF} días)`,cant:1,precio:xViat});
              if(xU>0) conceptos.push({desc:"Recargo urgente +35%",cant:1,precio:xU});
              if(xParadasExtra>0) conceptos.push({desc:`Paradas extra (${paradasExtra} × ${fmt(costoParadaExtra)})`,cant:paradasExtra,precio:Number(costoParadaExtra)||0});
              try{
                const ref = await addDoc(collection(db,"presupuestos"),{
                  folio:"PRE-"+uid(),
                  cliente,contacto:"",
                  fecha:today,vigencia:in15,
                  conceptos,
                  subtotal:sub,ivaAmt:iva,total,iva:true,
                  status:"Borrador",
                  notas:`Generado desde ruta: ${nombre||"Sin nombre"}. Vehículo: ${vehD?.label}. ${stops.filter(s=>!s.isOrigin).length} ciudades destino, ${totalPuntosDestino} puntos específicos.`,
                  rutaOrigenId:null,
                  createdAt:serverTimestamp(),
                });
                showT("✓ Presupuesto creado. Búscalo en el módulo Presupuestos.");
              }catch(e){showT("Error: "+e.message,"err");}
            }} className="btn" style={{flex:"1 1 160px",padding:"13px 0",borderRadius:12,background:"linear-gradient(135deg,"+VIOLET+",#a855f7)",color:"#fff",fontFamily:SANS,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:7,boxShadow:"0 4px 16px "+VIOLET+"30"}}>
              <ClipboardList size={14}/>Crear Presupuesto
            </button>
            <button onClick={()=>{const q={folio:"RUT-"+uid(),cliente,modo:"ruta",modoLabel:"RUTA MULTI-PARADA",destino:stops.filter(s=>!s.isOrigin).map(s=>s.city).join(" → "),vehiculoLabel:vehD?.label,stops,lines:[{label:"Tarifa transporte",value:fmt(tarifaT)},urg&&{label:"⚡ Urgente",value:"+"+fmt(xU),color:ROSE},xViat>0&&{label:"Viáticos",value:"+"+fmt(xViat),color:AMBER},xParadasExtra>0&&{label:"Paradas extra",value:"+"+fmt(xParadasExtra),color:AMBER},{label:"Subtotal",value:fmt(sub)},{label:"IVA 16%",value:fmt(iva),color:MUTED},{label:"TOTAL",value:fmt(total),bold:true,color:A}].filter(Boolean),flota:{vans,dias:diasOp,capDia},totalPDV,plazo,total};downloadCotizacionPDF(q);}} className="btn"
              style={{flex:"1 1 100px",padding:"13px 0",borderRadius:12,border:"1.5px solid "+BD2,background:"#fff",fontFamily:SANS,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:7,color:TEXT}}>
              <Printer size={14}/>PDF
            </button>
            {mapU&&<a href={mapU} target="_blank" rel="noopener noreferrer" className="btn"
              style={{flex:"1 1 100px",padding:"13px 0",borderRadius:12,border:"1.5px solid "+BLUE+"28",background:BLUE+"0e",fontFamily:SANS,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:7,color:BLUE,textDecoration:"none"}}>
              <Globe size={14}/>Maps
            </a>}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div style={{background:"#fff",border:"1.5px solid "+BORDER,borderRadius:15,overflow:"hidden",boxShadow:"0 4px 18px rgba(12,24,41,.07)"}}>
            <div style={{borderTop:"3px solid "+VIOLET,padding:"17px 19px 13px",borderBottom:"1px solid "+BORDER}}>
              <div style={{fontFamily:MONO,fontSize:9,color:VIOLET,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>COSTO TOTAL DE RUTA</div>
              <div style={{fontFamily:MONO,fontWeight:700,fontSize:34,color:TEXT,lineHeight:1}}>{fmt(total)}</div>
              <div style={{fontSize:11,color:MUTED,marginTop:4}}>{stops.filter(s=>!s.isOrigin).length} destinos · {totalPDV.toLocaleString()} PDVs</div>
            </div>
            <div style={{padding:"13px 17px"}}>
              {[[fmt(tarifaT),"Transporte×"+vans],[xU>0&&"+"+fmt(xU),"⚡ Urgente",ROSE],[xViat>0&&"+"+fmt(xViat),"Viáticos",AMBER],[xParadasExtra>0&&"+"+fmt(xParadasExtra),"🛑 "+paradasExtra+" paradas extra",AMBER],[fmt(sub),"Subtotal"],[fmt(iva),"IVA 16%",MUTED]].filter(r=>r&&r[0]).map(([v,l,c],i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+BORDER,fontSize:12}}>
                  <span style={{color:MUTED}}>{l}</span><span style={{fontFamily:MONO,fontWeight:700,color:c||TEXT}}>{v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"11px 0",fontSize:15,fontWeight:800}}>
                <span>TOTAL</span><span style={{fontFamily:MONO,color:A,fontSize:20}}>{fmt(total)}</span>
              </div>
            </div>
          </div>

          {stops.filter(s=>!s.isOrigin).length>0&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,padding:16}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:11}}>Resumen de paradas</div>
            {stops.map((s,i)=>(
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                <div style={{width:20,height:20,borderRadius:"50%",background:s.isOrigin?BLUE+"14":A+"14",border:"2px solid "+(s.isOrigin?BLUE:A),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:s.isOrigin?BLUE:A,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{s.city}</div>{!s.isOrigin&&<div style={{fontSize:10,color:MUTED}}>{s.pdv>0?s.pdv+" PDVs":""} {s.base>0?fmt(s.base):""}</div>}</div>
                {i<stops.length-1&&<ArrowRight size={10} color={MUTED}/>}
              </div>
            ))}
          </div>}

          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
            <div style={{padding:"13px 16px",borderBottom:"1px solid "+BORDER}}><span style={{fontFamily:DISP,fontWeight:700,fontSize:13}}>Rutas guardadas ({rutas.length})</span></div>
            <div style={{maxHeight:340,overflowY:"auto"}}>
              {loadR?<div style={{padding:30,textAlign:"center",color:MUTED,fontSize:12}}>Cargando…</div>
              :rutas.length===0?<div style={{padding:30,textAlign:"center",color:MUTED,fontSize:12}}>Sin rutas guardadas</div>
              :rutas.map(r=>(
                <div key={r.id} className="fr" style={{padding:"11px 16px",borderBottom:"1px solid "+BORDER,cursor:"pointer"}} onClick={()=>setViewR(r)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                    <div style={{fontWeight:700,fontSize:13}}>{r.nombre}</div>
                    <Tag color={sc[r.status]||MUTED} sm>{r.status||"Programada"}</Tag>
                  </div>
                  <div style={{fontSize:11,color:MUTED,marginBottom:4}}>{r.cliente||"Sin cliente"} · {r.stops?.length||0} paradas</div>
                  {r.choferNombre&&<div style={{fontSize:10,color:BLUE,marginBottom:4,display:"flex",alignItems:"center",gap:4}}><Users size={10}/>{r.choferNombre} {r.choferPlaca?"· "+r.choferPlaca:""}</div>}
                  <div style={{display:"flex",gap:7}}><Tag color={A} sm>{fmt(r.total||0)}</Tag><Tag color={VIOLET} sm>{r.vans||1} vans</Tag>{!r.choferId&&<Tag color={AMBER} sm>Sin chofer</Tag>}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showImport&&<ImportRutasModal onClose={()=>setShowImport(false)} choferes={choferesList} showT={showT}/>}
      {showCapacidad&&<CapacidadModal onClose={()=>setShowCapacidad(false)} rutas={rutas} choferes={choferesList}/>}

      {viewR&&<Modal title={viewR.nombre} onClose={()=>setViewR(null)} wide icon={Map} iconColor={VIOLET}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:16}}>
          <InfoBox icon={Truck} color={A} title="Vans" value={viewR.vans||1} sub={VEHK.find(v=>v.k===viewR.veh)?.label}/>
          <InfoBox icon={Calendar} color={BLUE} title="Días" value={(viewR.diasOp||"—")+" días"} sub={"Plazo: "+(viewR.plazo||"—")+" días"}/>
          <InfoBox icon={Package} color={VIOLET} title="PDVs" value={(viewR.totalPDV||0).toLocaleString()} sub={(viewR.capDia||0)+"/día"}/>
          <InfoBox icon={Globe} color={GREEN} title="~Km" value={(viewR.totalKm||0).toLocaleString()}/>
        </div>
        <div style={{marginBottom:14,padding:"12px 14px",background:(viewR.choferId?BLUE:AMBER)+"08",borderRadius:11,border:"1px solid "+(viewR.choferId?BLUE:AMBER)+"20"}}>
          <div style={{fontSize:10,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Chofer asignado</div>
          {viewR.choferId?<div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:10,background:BLUE+"18",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:800,fontSize:12,color:BLUE,flexShrink:0}}>{(viewR.choferNombre||"?").slice(0,2).toUpperCase()}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13}}>{viewR.choferNombre}</div>
              <div style={{fontSize:11,color:MUTED,fontFamily:MONO}}>{viewR.choferTel} {viewR.choferPlaca?" · "+viewR.choferPlaca:""}</div>
            </div>
            <button onClick={async()=>{await updateDoc(doc(db,"rutas",viewR.id),{choferId:"",choferNombre:"",choferTel:"",choferPlaca:""});setViewR({...viewR,choferId:"",choferNombre:"",choferTel:"",choferPlaca:""});}} className="btn" style={{color:ROSE,fontSize:11,border:"1px solid "+ROSE+"28",borderRadius:6,padding:"4px 8px"}}>Quitar</button>
          </div>
          :<select onChange={async e=>{const id=e.target.value;if(!id)return;const c=choferesList.find(x=>x.id===id);await updateDoc(doc(db,"rutas",viewR.id),{choferId:id,choferNombre:c?.nombre||"",choferTel:c?.tel||"",choferPlaca:c?.placa||""});if(c)await updateDoc(doc(db,"choferes",id),{rutaAsignadaId:viewR.id,rutaAsignadaNombre:viewR.nombre}).catch(()=>{});setViewR({...viewR,choferId:id,choferNombre:c?.nombre,choferTel:c?.tel,choferPlaca:c?.placa});}} defaultValue="" style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
            <option value="">Seleccionar chofer…</option>
            {choferesList.map(c=><option key={c.id} value={c.id}>{c.nombre} · {c.tel} {c.placa?"· "+c.placa:""}</option>)}
          </select>}
        </div>
        <div style={{marginBottom:14}}>
          {(viewR.stops||[]).map((s,i)=>(
            <div key={i} style={{padding:"8px 0",borderBottom:"1px solid "+BORDER}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:20,height:20,borderRadius:"50%",background:A+"14",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:A,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,fontWeight:600,fontSize:13}}>{s.city}</div>
                {s.pdv>0&&<Tag color={A} sm>{s.pdv} PDVs</Tag>}
                {s.puntos?.length>0&&<Tag color={VIOLET} sm>{s.puntos.length} puntos</Tag>}
              </div>
              {s.puntos?.length>0&&<div style={{marginTop:6,marginLeft:28}}>
                {s.puntos.map((p,pi)=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",fontSize:11,color:MUTED}}>
                    <MapPin size={10} color={VIOLET}/>
                    <span style={{fontWeight:600,color:TEXT}}>{p.name}</span>
                    <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.address}</span>
                  </div>
                ))}
              </div>}
            </div>
          ))}
        </div>
        {/* Tracking link para el cliente */}
        {viewR.trackingId&&<div style={{marginBottom:12,padding:"12px 14px",background:VIOLET+"08",borderRadius:12,border:"1.5px solid "+VIOLET+"24"}}>
          <div style={{fontSize:10,fontWeight:800,color:VIOLET,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,display:"flex",alignItems:"center",gap:6}}><Globe size={11}/>Link de tracking para cliente</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input readOnly value={`${window.location.origin}/track/${viewR.trackingId}`} onClick={e=>e.target.select()} style={{flex:1,fontFamily:MONO,fontSize:11,padding:"7px 10px",border:"1px solid "+BD2,borderRadius:7,background:"#fff"}}/>
            <button onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/track/${viewR.trackingId}`);alert("Link copiado ✓");}} className="btn" style={{background:VIOLET,color:"#fff",borderRadius:7,padding:"7px 12px",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:5}}><Hash size={11}/>Copiar</button>
            {viewR.clienteTel&&<a href={`https://wa.me/52${viewR.clienteTel}?text=${encodeURIComponent(`Hola ${viewR.cliente||""}! Aquí el tracking de tu ruta "${viewR.nombre}" de DMvimiento: ${window.location.origin}/track/${viewR.trackingId}`)}`} target="_blank" rel="noopener noreferrer" className="btn" style={{background:GREEN,color:"#fff",borderRadius:7,padding:"7px 12px",fontSize:11,fontWeight:700,textDecoration:"none",display:"flex",alignItems:"center",gap:5}}>WhatsApp</a>}
          </div>
        </div>}
        {/* Override precio manual */}
        <div style={{marginBottom:14,padding:"12px 14px",background:AMBER+"08",borderRadius:11,border:"1.5px solid "+AMBER+"25"}}>
          <div style={{fontSize:10,fontWeight:800,color:AMBER,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,display:"flex",alignItems:"center",gap:6}}><DollarSign size={11}/>Precios (editables)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>Subtotal</div>
              <input type="number" defaultValue={viewR.sub||0} onBlur={async e=>{
                const sub=parseFloat(e.target.value)||0;const iva=sub*0.16;const total=sub+iva;
                await updateDoc(doc(db,"rutas",viewR.id),{sub,iva,total,precioOverride:true});
                setViewR({...viewR,sub,iva,total,precioOverride:true});
              }} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontFamily:MONO,fontSize:13,fontWeight:700}}/>
            </div>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>IVA 16%</div>
              <div style={{background:"#f8fafd",border:"1.5px solid "+BORDER,borderRadius:8,padding:"7px 10px",fontFamily:MONO,fontSize:13,fontWeight:700,color:MUTED}}>{fmt(viewR.iva||0)}</div>
            </div>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>Total c/IVA</div>
              <input type="number" defaultValue={viewR.total||0} onBlur={async e=>{
                const total=parseFloat(e.target.value)||0;const sub=total/1.16;const iva=total-sub;
                await updateDoc(doc(db,"rutas",viewR.id),{sub,iva,total,precioOverride:true});
                setViewR({...viewR,sub,iva,total,precioOverride:true});
              }} style={{width:"100%",background:"#fff",border:"1.5px solid "+A+"30",borderRadius:8,padding:"7px 10px",fontFamily:MONO,fontSize:14,fontWeight:800,color:A}}/>
            </div>
          </div>
          {viewR.precioOverride&&<div style={{fontSize:10,color:AMBER,marginTop:6,fontWeight:600}}>⚠ Precio modificado manualmente (no se recalcula automáticamente)</div>}
        </div>

        <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
          <button onClick={()=>downloadRutaPDF(viewR)} className="btn" style={{flex:"1 1 90px",padding:"10px 0",borderRadius:10,background:"#fff",border:"1.5px solid "+VIOLET+"30",color:VIOLET,display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:SANS,fontWeight:700,fontSize:13}}><Download size={14}/>PDF</button>
          <button onClick={async()=>{
            if(!confirm("¿Duplicar esta ruta?\n\nSe creará una copia en estado 'Programada' para que la edites y asignes.")) return;
            const copy = {...viewR};
            delete copy.id;
            copy.nombre = (copy.nombre||"Ruta") + " (copia)";
            copy.status = "Programada";
            copy.progreso = 0;
            copy.stopsStatus = [];
            copy.iniciadaEn = null;
            copy.completadaEn = null;
            copy.trackingId = Math.random().toString(36).slice(2,10).toUpperCase();
            copy.choferId = ""; copy.choferNombre = ""; copy.choferTel = ""; copy.choferPlaca = "";
            copy.createdAt = serverTimestamp();
            await addDoc(collection(db,"rutas"),copy);
            setViewR(null);
            showT("✓ Ruta duplicada");
          }} className="btn" style={{flex:"1 1 90px",padding:"10px 0",borderRadius:10,background:"#fff",border:"1.5px solid "+BLUE+"30",color:BLUE,display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:SANS,fontWeight:700,fontSize:13}}><RefreshCw size={14}/>Duplicar</button>
          {viewR.mapURL&&<a href={viewR.mapURL} target="_blank" rel="noopener noreferrer" className="btn" style={{flex:"1 1 90px",padding:"10px 0",borderRadius:10,background:BLUE+"0e",border:"1.5px solid "+BLUE+"28",color:BLUE,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:SANS,fontWeight:700,fontSize:13}}><Globe size={14}/>Maps</a>}
          <button onClick={async()=>{
            if(!confirm("¿Eliminar esta ruta permanentemente?\n\nEsta acción no se puede deshacer.")) return;
            await deleteDoc(doc(db,"rutas",viewR.id));
            setViewR(null);
            showT("Ruta eliminada");
          }} className="btn" style={{flex:"1 1 90px",padding:"10px 0",borderRadius:10,background:"#fff",border:"1.5px solid "+ROSE+"30",color:ROSE,display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:SANS,fontWeight:700,fontSize:13}}><Trash2 size={14}/>Eliminar</button>
          <button onClick={async()=>{
            const nuevoStatus = viewR.status==="En curso"?"Completada":viewR.status==="Completada"?"Programada":"En curso";
            await updateDoc(doc(db,"rutas",viewR.id),{status:nuevoStatus});
            setViewR(null);
          }} className="btn"
            style={{flex:"1 1 120px",padding:"10px 0",borderRadius:10,background:"linear-gradient(135deg,"+A+",#fb923c)",border:"none",cursor:"pointer",fontFamily:SANS,fontWeight:700,fontSize:13,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            {viewR.status==="En curso"?<><CheckCircle size={14}/>Completar</>:viewR.status==="Completada"?<><RefreshCw size={14}/>Reabrir</>:<><Navigation size={14}/>Iniciar</>}
          </button>
        </div>
      </Modal>}
    </div>
  );
}


/* ─── PLANIFICADOR NACIONAL ──────────────────────────────────────────────── */
function PlanificadorNacional(){
  const [proyectos,setProyectos]=useState([]);
  const [tab,setTab]=useState("nuevo");
  const [toast,setToast]=useState(null);
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  const [nombre,setNombre]=useState("");
  const [cliente,setCliente]=useState("");
  const [maxPDia,setMaxPDia]=useState(20);
  const [diasDef,setDiasDef]=useState(5);
  const [ciudades,setCiudades]=useState([]);
  const [dragOver,setDragOver]=useState(false);
  const [loading,setLoading]=useState(false);
  const [xlReady,setXlReady]=useState(false);
  const fileRef=useRef(null);
  const [aC,setAC]=useState(""); const [aE,setAE]=useState(""); const [aP,setAP]=useState(""); const [aD,setAD]=useState("");

  // Load SheetJS from CDN
  useEffect(()=>{
    if(window.XLSX){setXlReady(true);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload=()=>{setXlReady(true);};
    s.onerror=()=>showT("Error cargando lector Excel. Usa formato CSV.","err");
    document.head.appendChild(s);
  },[]);

  useEffect(()=>onSnapshot(collection(db,"proyectos"),snap=>{
    setProyectos(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  }),[]);

  const calc=(pdv,dias,mpd)=>{
    const d=Math.max(1,dias); const m=Math.max(1,mpd);
    const vans=Math.max(1,Math.ceil(pdv/(m*d)));
    const capDia=Math.ceil(pdv/d);
    return {vans,capDia};
  };
  useEffect(()=>{setCiudades(p=>p.map(c=>{const{vans,capDia}=calc(c.pdv,c.dias,maxPDia);return{...c,vans,capDia};}));},[maxPDia]);

  const processRows=(rows)=>{
    if(!rows||rows.length<2){showT("Archivo sin datos suficientes","err");return;}
    const hdr=rows[0].map(h=>String(h||"").trim().toLowerCase());
    const ci=hdr.findIndex(h=>h.includes("ciudad")||h.includes("city")||h.includes("municipio"));
    const si=hdr.findIndex(h=>h.includes("estado")||h.includes("state")||h.includes("entidad"));
    const pi=hdr.findIndex(h=>h.includes("pdv")||h.includes("punto")||h.includes("entrega")||h.includes("cantidad")||h.includes("qty")||h.includes("tienda"));
    const di=hdr.findIndex(h=>h.includes("dia")||h.includes("day"));
    if(ci===-1&&pi===-1){showT("No se encontraron columnas Ciudad o PDVs. Revisa el formato.","err");return;}
    const grouped={};
    rows.slice(1).forEach(row=>{
      const ciudad=String(row[ci>=0?ci:0]||"").trim();
      const estado=String(row[si>=0?si:1]||"").trim();
      const pdv=Math.abs(parseInt(row[pi>=0?pi:2])||0);
      const dias=di>=0?Math.max(1,parseInt(row[di])||diasDef):diasDef;
      if(!ciudad||pdv===0) return;
      const key=(ciudad+"|"+estado).toLowerCase();
      if(grouped[key]) grouped[key].pdv+=pdv;
      else grouped[key]={id:uid(),ciudad,estado,pdv,dias};
    });
    const arr=Object.values(grouped).map(c=>{const{vans,capDia}=calc(c.pdv,c.dias,maxPDia);return{...c,vans,capDia};});
    if(!arr.length){showT("No se encontraron filas con datos válidos","err");return;}
    setCiudades(arr);
    showT("✓ "+arr.length+" ciudades importadas · "+arr.reduce((a,c)=>a+c.pdv,0).toLocaleString()+" PDVs totales");
  };

  const parseFile=async(file)=>{
    setLoading(true);
    try{
      const nm=file.name.toLowerCase();
      if(nm.endsWith(".csv")){
        const txt=await file.text();
        const rows=txt.split(/\r?\n/).filter(r=>r.trim()).map(r=>r.split(/[,;|\t]/));
        processRows(rows);
      } else if(nm.endsWith(".xlsx")||nm.endsWith(".xls")){
        if(!window.XLSX){showT("Lector Excel no listo. Espera 3 seg e intenta de nuevo","err");setLoading(false);return;}
        const buf=await file.arrayBuffer();
        const wb=window.XLSX.read(buf,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=window.XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        processRows(rows);
      } else {
        showT("Formato no soportado. Usa .csv, .xlsx o .xls","err");
      }
    }catch(e){showT("Error leyendo archivo: "+e.message,"err");}
    setLoading(false);
  };

  const onDrop=e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f) parseFile(f);};

  const addCiudad=()=>{
    if(!aC.trim()||!aP){showT("Ciudad y PDVs son requeridos","err");return;}
    const pdv=parseInt(aP)||0; const dias=parseInt(aD)||diasDef;
    const{vans,capDia}=calc(pdv,dias,maxPDia);
    setCiudades(p=>[...p,{id:uid(),ciudad:aC.trim(),estado:aE.trim(),pdv,dias,vans,capDia}]);
    setAC("");setAE("");setAP("");setAD("");
  };
  const updCiudad=(id,k,v)=>setCiudades(p=>p.map(c=>{
    if(c.id!==id) return c;
    const upd={...c,[k]:Math.max(1,parseInt(v)||1)};
    const{vans,capDia}=calc(upd.pdv,upd.dias,maxPDia);
    return{...upd,vans,capDia};
  }));
  const rmCiudad=id=>setCiudades(p=>p.filter(c=>c.id!==id));

  const totPDV=ciudades.reduce((a,c)=>a+c.pdv,0);
  const totVans=ciudades.reduce((a,c)=>a+c.vans,0);
  const totDias=ciudades.length>0?Math.max(...ciudades.map(c=>c.dias)):0;
  const porEstado={};
  [...ciudades].sort((a,b)=>(a.estado+a.ciudad).localeCompare(b.estado+b.ciudad)).forEach(c=>{
    const e=c.estado||"Sin estado"; if(!porEstado[e]) porEstado[e]=[]; porEstado[e].push(c);
  });

  const saveProyecto=async()=>{
    if(!nombre||ciudades.length===0){showT("Nombre y ciudades requeridos","err");return;}
    try{
      await addDoc(collection(db,"proyectos"),{nombre,cliente,ciudades,totPDV,totVans,maxPDia,diasDef,createdAt:serverTimestamp(),status:"Activo"});
      showT("✓ Proyecto guardado"); setTab("lista");
    }catch(e){showT(e.message,"err");}
  };
  const delProyecto=async id=>{if(!confirm("¿Eliminar proyecto?"))return;await deleteDoc(doc(db,"proyectos",id));showT("Eliminado");};

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div>
          <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Proyectos Nacionales</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>Distribución simultánea · Importar Excel/CSV · Optimizador de flota por ciudad</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {tab==="nuevo"&&ciudades.length>0&&nombre&&(
            <button onClick={saveProyecto} className="btn" style={{display:"flex",alignItems:"center",gap:7,background:"linear-gradient(135deg,"+GREEN+",#059669)",color:"#fff",borderRadius:11,padding:"9px 16px",fontWeight:700,fontSize:13,boxShadow:"0 4px 14px "+GREEN+"30"}}>
              <Check size={13}/>Guardar proyecto
            </button>
          )}
          <button onClick={()=>setTab(tab==="nuevo"?"lista":"nuevo")} className="btn" style={{display:"flex",alignItems:"center",gap:7,background:tab==="lista"?A+"10":"#fff",border:"1.5px solid "+(tab==="lista"?A:BD2),borderRadius:11,padding:"9px 16px",fontWeight:700,fontSize:13,color:tab==="lista"?A:TEXT}}>
            {tab==="nuevo"?<><FolderOpen size={13}/>Proyectos ({proyectos.length})</>:<><Plus size={13}/>Nuevo proyecto</>}
          </button>
        </div>
      </div>

      {tab==="lista"&&<>
        {proyectos.length===0
          ?<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:60,textAlign:"center",color:MUTED,fontSize:13}}>
            Sin proyectos. <button onClick={()=>setTab("nuevo")} style={{color:A,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Crear primero →</button>
          </div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
            {proyectos.map(p=>(
              <div key={p.id} style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
                <div style={{padding:"14px 16px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between"}}>
                  <div><div style={{fontFamily:DISP,fontWeight:700,fontSize:15}}>{p.nombre}</div>{p.cliente&&<div style={{fontSize:12,color:MUTED,marginTop:2}}>{p.cliente}</div>}</div>
                  <button onClick={()=>delProyecto(p.id)} className="btn" style={{color:MUTED}}><Trash2 size={13}/></button>
                </div>
                <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[[A,"PDVs",(p.totPDV||0).toLocaleString()],[VIOLET,"Vans",p.totVans||0],[BLUE,"Ciudades",p.ciudades?.length||0]].map(([c,l,v])=>(
                    <div key={l}><div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:MONO,fontSize:17,fontWeight:800,color:c,marginTop:2}}>{v}</div></div>
                  ))}
                </div>
                {p.ciudades?.length>0&&<div style={{padding:"0 16px 14px"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {p.ciudades.slice(0,8).map(c=><span key={c.id||c.ciudad} style={{background:VIOLET+"10",color:VIOLET,borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:600}}>{c.ciudad}</span>)}
                    {p.ciudades.length>8&&<span style={{fontSize:10,color:MUTED}}>+{p.ciudades.length-8} más</span>}
                  </div>
                </div>}
              </div>
            ))}
          </div>
        }
      </>}

      {tab==="nuevo"&&<>
        {/* Config global */}
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:13,padding:"16px 20px",marginBottom:16,display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:12}}>
          <Inp label="Nombre del proyecto *" value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej: Campaña Nacional Mar 2026"/>
          <Inp label="Cliente" value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Empresa"/>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Máx PDVs/van/día</div>
            <input type="number" min="1" value={maxPDia} onChange={e=>setMaxPDia(Math.max(1,parseInt(e.target.value)||1))}
              style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:16,fontWeight:700,color:A}}/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Días por defecto</div>
            <input type="number" min="1" value={diasDef} onChange={e=>setDiasDef(Math.max(1,parseInt(e.target.value)||1))}
              style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:16,fontWeight:700,color:BLUE}}/>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:16,alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* Upload zone */}
            <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"13px 18px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:DISP,fontWeight:700,fontSize:14}}>📂 Importar desde archivo</span>
                <div style={{display:"flex",gap:6}}>
                  <Tag color={GREEN}>.xlsx</Tag><Tag color={BLUE}>.xls</Tag><Tag color={MUTED}>.csv</Tag>
                  {!xlReady&&<Tag color={AMBER}>Cargando lector…</Tag>}
                </div>
              </div>
              <div style={{padding:16}}>
                <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
                  onDrop={onDrop} onClick={()=>fileRef.current?.click()}
                  style={{border:"2px dashed "+(dragOver?A:BD2),borderRadius:12,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:dragOver?A+"06":"#fafbfd",transition:"all .15s"}}>
                  {loading
                    ?<><div style={{width:28,height:28,border:"3px solid "+A,borderTop:"3px solid transparent",borderRadius:"50%",margin:"0 auto 10px"}} className="spin"/><div style={{fontWeight:700,color:A}}>Procesando archivo…</div></>
                    :<><Upload size={28} color={dragOver?A:MUTED} style={{margin:"0 auto 10px"}}/><div style={{fontWeight:700,fontSize:14,color:dragOver?A:TEXT}}>Arrastra tu archivo aquí</div><div style={{fontSize:12,color:MUTED,marginTop:4}}>o haz clic · Excel (.xlsx, .xls) o CSV (.csv)</div></>
                  }
                </div>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f) parseFile(f);e.target.value="";}}/>
                {ciudades.length>0&&<div style={{marginTop:10,padding:"9px 14px",background:GREEN+"08",borderRadius:9,border:"1px solid "+GREEN+"25",fontSize:12,color:GREEN,fontWeight:700}}>
                  ✓ {ciudades.length} ciudades · {totPDV.toLocaleString()} PDVs · {totVans} vans necesarias
                </div>}
                <div style={{marginTop:12,background:"#f8fafd",borderRadius:10,padding:"12px 14px",border:"1px solid "+BORDER}}>
                  <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",marginBottom:8}}>Formato esperado:</div>
                  <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
                    <thead><tr style={{background:VIOLET+"10"}}>{["Ciudad","Estado","PDVs","Dias"].map(h=><th key={h} style={{padding:"4px 10px",textAlign:"left",fontWeight:700,color:VIOLET,borderBottom:"1px solid "+BORDER}}>{h}</th>)}</tr></thead>
                    <tbody>{[["Monterrey","Nuevo León","384","3"],["Guadalajara","Jalisco","251","2"],["Mérida","Yucatán","128","2"],["Cancún","Q. Roo","97","1"]].map((r,i)=>(
                      <tr key={i}>{r.map((v,j)=><td key={j} style={{padding:"3px 10px",fontFamily:MONO,color:j===2?A:j===3?BLUE:TEXT}}>{v}</td>)}</tr>
                    ))}</tbody>
                  </table>
                  <div style={{fontSize:10,color:MUTED,marginTop:8}}>💡 Acepta variantes: Municipio, Entidad, Cantidad, Tiendas, Puntos</div>
                </div>
              </div>
            </div>

            {/* Agregar manual */}
            <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"13px 18px",borderBottom:"1px solid "+BORDER}}><span style={{fontFamily:DISP,fontWeight:700,fontSize:14}}>➕ Agregar ciudad manualmente</span></div>
              <div style={{padding:14,display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:9,alignItems:"end"}}>
                <div><div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>Ciudad *</div>
                  <input value={aC} onChange={e=>setAC(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCiudad()} placeholder="Ej: Monterrey"
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"8px 11px",fontSize:13}}/>
                </div>
                <div><div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>Estado</div>
                  <input value={aE} onChange={e=>setAE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCiudad()} placeholder="NL"
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"8px 11px",fontSize:13}}/>
                </div>
                <div><div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>PDVs *</div>
                  <input type="number" value={aP} onChange={e=>setAP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCiudad()} placeholder="384"
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+A+"40",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:14,fontWeight:700,color:A}}/>
                </div>
                <div><div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>Días</div>
                  <input type="number" value={aD} onChange={e=>setAD(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCiudad()} placeholder={String(diasDef)}
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+BLUE+"40",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:14,fontWeight:700,color:BLUE}}/>
                </div>
                <button onClick={addCiudad} className="btn" style={{background:A,color:"#fff",borderRadius:9,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}><Plus size={15}/></button>
              </div>
            </div>

            {/* Tabla ciudades */}
            {ciudades.length>0&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"13px 18px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:DISP,fontWeight:700,fontSize:14}}>📋 Distribución por ciudad</span>
                <div style={{display:"flex",gap:7}}>
                  <Tag color={A}>{totPDV.toLocaleString()} PDVs</Tag><Tag color={VIOLET}>{totVans} vans</Tag><Tag color={BLUE}>{Object.keys(porEstado).length} estados</Tag>
                  <button onClick={()=>setCiudades([])} className="btn" style={{padding:"2px 8px",borderRadius:6,border:"1px solid "+ROSE+"30",color:ROSE,fontSize:11}}>Limpiar todo</button>
                </div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:580}}>
                  <thead><tr style={{background:"#f8fafd",borderBottom:"1px solid "+BORDER}}>
                    {["Ciudad","Estado","PDVs","Días","Vans","PDVs/día",""].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {Object.entries(porEstado).map(([estado,cits])=>[
                      <tr key={"h_"+estado}>
                        <td colSpan={7} style={{padding:"6px 12px",background:VIOLET+"06",fontSize:10,fontWeight:800,color:VIOLET,letterSpacing:"0.05em",textTransform:"uppercase",borderBottom:"1px solid "+BORDER,borderTop:"1px solid "+BORDER}}>
                          {estado} · {cits.length} ciudad(es) · {cits.reduce((a,c)=>a+c.pdv,0).toLocaleString()} PDVs · {cits.reduce((a,c)=>a+c.vans,0)} vans
                        </td>
                      </tr>,
                      ...cits.map(c=>(
                        <tr key={c.id} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
                          <td style={{padding:"9px 12px",fontWeight:700,fontSize:13}}>{c.ciudad}</td>
                          <td style={{padding:"9px 12px",fontSize:12,color:MUTED}}>{c.estado||"—"}</td>
                          <td style={{padding:"9px 12px"}}><input type="number" value={c.pdv} onChange={e=>updCiudad(c.id,"pdv",e.target.value)} style={{width:80,background:"#fff",border:"1.5px solid "+A+"28",borderRadius:7,padding:"4px 8px",fontFamily:MONO,fontSize:13,fontWeight:700,color:A}}/></td>
                          <td style={{padding:"9px 12px"}}><input type="number" value={c.dias} onChange={e=>updCiudad(c.id,"dias",e.target.value)} style={{width:55,background:"#fff",border:"1.5px solid "+BLUE+"28",borderRadius:7,padding:"4px 8px",fontFamily:MONO,fontSize:13,fontWeight:700,color:BLUE}}/></td>
                          <td style={{padding:"9px 12px",fontFamily:MONO,fontSize:14,fontWeight:800,color:VIOLET}}>{c.vans}</td>
                          <td style={{padding:"9px 12px",fontFamily:MONO,fontSize:12,color:MUTED}}>{c.capDia}/día</td>
                          <td style={{padding:"9px 12px"}}><button onClick={()=>rmCiudad(c.id)} className="btn" style={{color:MUTED}}><X size={12}/></button></td>
                        </tr>
                      ))
                    ])}
                  </tbody>
                </table>
              </div>
            </div>}
          </div>

          {/* Panel resumen */}
          <div style={{position:"sticky",top:20,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
              <div style={{borderTop:"3px solid "+VIOLET,padding:"16px 18px 12px"}}>
                <div style={{fontFamily:MONO,fontSize:9,color:VIOLET,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>● RESUMEN</div>
                <div style={{fontFamily:MONO,fontWeight:800,fontSize:36,color:TEXT,lineHeight:1}}>{totPDV.toLocaleString()}</div>
                <div style={{fontSize:11,color:MUTED,marginTop:4}}>PDVs en {ciudades.length} ciudad(es)</div>
              </div>
              <div style={{padding:"12px 18px",borderTop:"1px solid "+BORDER}}>
                <RowItem l="🏙️ Ciudades" v={ciudades.length}/>
                <RowItem l="🗺️ Estados" v={Object.keys(porEstado).length}/>
                <RowItem l="🚛 Vans simultáneas" v={totVans} c={VIOLET}/>
                <RowItem l="📦 Máx PDVs/van/día" v={maxPDia}/>
                <RowItem l="⏱️ Días máx en campo" v={totDias||"—"} c={BLUE}/>
              </div>
              {Object.keys(porEstado).length>0&&<div style={{padding:"12px 18px",borderTop:"1px solid "+BORDER}}>
                <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Por estado</div>
                {Object.entries(porEstado).map(([e,cits])=>(
                  <div key={e} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid "+BORDER}}>
                    <div><div style={{fontSize:12,fontWeight:700}}>{e}</div><div style={{fontSize:10,color:MUTED}}>{cits.length} ciudad(es) · {cits.reduce((a,c)=>a+c.vans,0)} vans</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontFamily:MONO,fontSize:13,fontWeight:700,color:A}}>{cits.reduce((a,c)=>a+c.pdv,0).toLocaleString()}</div><div style={{fontSize:9,color:MUTED}}>PDVs</div></div>
                  </div>
                ))}
              </div>}
            </div>
            {ciudades.length>0&&nombre
              ?<button onClick={saveProyecto} className="btn" style={{background:"linear-gradient(135deg,"+GREEN+",#059669)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 16px "+GREEN+"30"}}><Check size={15}/>Guardar proyecto</button>
              :ciudades.length>0&&<div style={{padding:"10px 14px",background:AMBER+"10",borderRadius:10,border:"1px solid "+AMBER+"30",fontSize:12,color:AMBER,fontWeight:600}}>⚠️ Escribe un nombre para guardar</div>
            }
          </div>
        </div>
      </>}
    </div>
  );
}

/* ─── FACTURACIÓN ────────────────────────────────────────────────────────── */
function Facturas(){
  const [items,setItems]=useState([]);const [load,setLoad]=useState(true);
  const [modal,setModal]=useState(false);const [editItem,setEditItem]=useState(null);
  const [toast,setToast]=useState(null);const [tab,setTab]=useState("registros");const [mesF,setMesF]=useState("todos");
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const ANIO=new Date().getFullYear();
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  const empty={mesOp:MESES[new Date().getMonth()],anio:ANIO,plan:"",empresa:"",solicitante:"",servicio:"",subtotal:"",iva:true,status:"Pendiente",notas:""};
  const [form,setForm]=useState(empty);
  const sf=k=>e=>setForm(f=>({...f,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));

  useEffect(()=>onSnapshot(collection(db,"facturas"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setLoad(false);
  }),[]);

  const openNew=()=>{setForm(empty);setEditItem(null);setModal(true);};
  const openEdit=f=>{setForm({mesOp:f.mesOp||MESES[0],anio:f.anio||ANIO,plan:f.plan||"",empresa:f.empresa||f.cliente||"",solicitante:f.solicitante||"",servicio:f.servicio||"",subtotal:String(f.subtotal||f.monto||""),iva:f.ivaAmt>0,status:f.status||"Pendiente",notas:f.notas||""});setEditItem(f);setModal(true);};

  const save=async()=>{
    if(!form.empresa||!form.subtotal){showT("Empresa y subtotal son requeridos","err");return;}
    const sub=parseFloat(form.subtotal)||0;const xIva=form.iva?sub*.16:0;const total=sub+xIva;
    const data={...form,subtotal:sub,ivaAmt:xIva,total};
    try{
      if(editItem){await updateDoc(doc(db,"facturas",editItem.id),data);showT("✓ Registro actualizado");}
      else{await addDoc(collection(db,"facturas"),{...data,folio:"FAC-"+uid(),createdAt:serverTimestamp()});showT("✓ Registro creado");}
      setModal(false);setForm(empty);setEditItem(null);
    }catch(e){showT(e.message,"err");}
  };
  const del=async id=>{if(!confirm("¿Eliminar este registro?"))return;await deleteDoc(doc(db,"facturas",id));showT("Eliminado");};
  const updStatus=async(id,status)=>updateDoc(doc(db,"facturas",id),{status});

  const filt=mesF==="todos"?items:items.filter(f=>f.mesOp===mesF);
  const totTotal=filt.reduce((a,f)=>a+(f.total||0),0);
  const cobrado=filt.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0);
  const pendiente=filt.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+(f.total||0),0);
  const vencido=filt.filter(f=>f.status==="Vencida").reduce((a,f)=>a+(f.total||0),0);
  const porMes=MESES.map(m=>{const its=items.filter(f=>f.mesOp===m);return{m,fac:its.reduce((a,f)=>a+(f.total||0),0),cob:its.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0),n:its.length};});
  const maxV=Math.max(...porMes.map(m=>m.fac),1);
  const proyAnual=porMes.reduce((a,m)=>a+m.fac,0);
  const avgMes=porMes.filter(m=>m.fac>0).reduce((a,m,_,arr)=>a+m.fac/arr.length,0)||0;
  const mesActual=MESES[new Date().getMonth()];
  const sc={Pendiente:AMBER,Pagada:GREEN,Vencida:ROSE};
  const sub=parseFloat(form.subtotal)||0;const ivaP=form.iva?sub*.16:0;const totP=sub+ivaP;

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div><h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Facturación & Finanzas</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>Control mensual · PDF descargable · Proyecciones anuales</p></div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>exportFacturasXLSX(filt,mesF==="todos"?null:mesF)} className="btn" title="Exportar facturas a Excel" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+GREEN+"40",color:GREEN,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><Download size={13}/>XLSX Facturas</button>
          <button onClick={()=>exportFinancierosXLSX(items)} className="btn" title="Exportar financieros completos" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+VIOLET+"40",color:VIOLET,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><BarChart2 size={13}/>XLSX Financiero</button>
          <button onClick={openNew} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"30"}}><Plus size={14}/>Nuevo registro</button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
        <KpiCard icon={BarChart2} color={BLUE} label="Total facturado" value={fmtK(totTotal)} sub={filt.length+" registros"}/>
        <KpiCard icon={CheckCircle} color={GREEN} label="Cobrado" value={fmtK(cobrado)} sub={totTotal>0?Math.round(cobrado/totTotal*100)+"%":"0%"}/>
        <KpiCard icon={Clock} color={AMBER} label="Por cobrar" value={fmtK(pendiente)}/>
        <KpiCard icon={AlertCircle} color={ROSE} label="Vencido" value={fmtK(vencido)}/>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:14}}>
        {[["registros","📋 Registros"],["proyecciones","📈 Proyecciones"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className="btn" style={{padding:"7px 18px",borderRadius:10,border:"1.5px solid "+(tab===k?A:BD2),background:tab===k?A+"10":"#fff",color:tab===k?A:MUTED,fontWeight:tab===k?700:500,fontSize:13,cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      {tab==="registros"&&<>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
          {["todos",...MESES].map(m=><button key={m} onClick={()=>setMesF(m)} className="btn" style={{padding:"5px 13px",borderRadius:8,border:"1.5px solid "+(mesF===m?A:BD2),background:mesF===m?A+"10":"#fff",color:mesF===m?A:MUTED,fontSize:12,fontWeight:mesF===m?700:500,cursor:"pointer"}}>{m==="todos"?"Todos":m}</button>)}
        </div>
        {mesF!=="todos"&&totTotal>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
          {[[MUTED,"Subtotal",fmt(filt.reduce((a,f)=>a+(f.subtotal||f.monto||0),0))],[MUTED,"IVA 16%",fmt(filt.reduce((a,f)=>a+(f.ivaAmt||f.iva||0),0))],[A,"Total c/IVA",fmt(totTotal)]].map(([c,l,v])=>(
            <div key={l} style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"12px 16px"}}>
              <div style={{fontSize:10,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
              <div style={{fontFamily:MONO,fontSize:20,fontWeight:800,color:c,marginTop:4}}>{v}</div>
            </div>
          ))}
        </div>}
        {load?<div style={{padding:40,textAlign:"center",color:MUTED}}>Cargando…</div>
        :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
          {filt.length===0?<div style={{padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin registros. <button onClick={openNew} style={{color:A,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Crear →</button></div>
          :<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:960}}>
            <thead><tr style={{borderBottom:"1px solid "+BORDER}}>
              {["Folio","Mes/Año","Empresa","Solicitante","Plan","Servicio","Subtotal","IVA","Total","Estado","Acciones"].map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>{filt.map((f,i)=>(
              <tr key={f.id||i} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:10,color:MUTED,whiteSpace:"nowrap"}}>{f.folio||"—"}</td>
                <td style={{padding:"10px 12px"}}><span style={{background:A+"12",color:A,borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700}}>{f.mesOp||"—"} {f.anio||""}</span></td>
                <td style={{padding:"10px 12px",fontWeight:700,fontSize:13}}>{f.empresa||f.cliente||"—"}</td>
                <td style={{padding:"10px 12px",fontSize:12,color:MUTED}}>{f.solicitante||"—"}</td>
                <td style={{padding:"10px 12px"}}>{f.plan&&<span style={{background:VIOLET+"12",color:VIOLET,borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:700}}>{f.plan}</span>}</td>
                <td style={{padding:"10px 12px",fontSize:12,color:MUTED,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.servicio||"—"}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:12}}>{fmt(f.subtotal||f.monto||0)}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:12,color:MUTED}}>{fmt(f.ivaAmt||f.iva||0)}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:13,fontWeight:800}}>{fmt(f.total||0)}</td>
                <td style={{padding:"10px 12px"}}>
                  <select value={f.status||"Pendiente"} onChange={e=>updStatus(f.id,e.target.value)} style={{background:"transparent",border:"1.5px solid "+(sc[f.status]||MUTED)+"28",borderRadius:8,padding:"3px 7px",color:sc[f.status]||MUTED,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    {["Pendiente","Pagada","Vencida"].map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{padding:"10px 12px"}}>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    <button onClick={()=>downloadFacturaPDF(f)} className="btn" title="Descargar PDF" style={{color:BLUE,padding:"4px 6px",border:"1px solid "+BLUE+"20",borderRadius:6,display:"flex",alignItems:"center",gap:3,fontSize:11,fontWeight:600}}>
                      <Download size={12}/>PDF
                    </button>
                    <button onClick={()=>{
                      downloadFacturaPDF(f); // primero descarga el PDF
                      const emailCliente = prompt("Email del cliente para enviar la factura:",f.emailCliente||"");
                      if(!emailCliente) return;
                      const subject = `Factura ${f.folio||""} - DMvimiento`;
                      const body = `Hola,\n\nAdjunto la factura ${f.folio||""} por el servicio: ${f.servicio||""}\n\nTotal: ${fmt(f.total||0)}\n\nSaludos,\nDMvimiento Logística`;
                      const mailto = `mailto:${emailCliente}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                      window.location.href = mailto;
                    }} className="btn" title="Enviar por email (PDF se descarga para adjuntar)" style={{color:VIOLET,padding:"4px 6px",border:"1px solid "+VIOLET+"20",borderRadius:6,display:"flex",alignItems:"center",fontSize:11,fontWeight:600}}>
                      <Send size={12}/>
                    </button>
                    <button onClick={()=>printFactura(f)} className="btn" title="Imprimir" style={{color:MUTED,padding:"4px 6px",border:"1px solid "+BD2,borderRadius:6,display:"flex",alignItems:"center",fontSize:11}}>
                      <Printer size={12}/>
                    </button>
                    <button onClick={()=>openEdit(f)} className="btn" style={{color:MUTED,padding:4}}><Eye size={13}/></button>
                    <button onClick={()=>{if(!confirm("¿Eliminar esta factura?"))return;del(f.id);}} className="btn" style={{color:MUTED,padding:4}}><Trash2 size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>}
        </div>}
      </>}

      {tab==="proyecciones"&&<>
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:24,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div><div style={{fontFamily:DISP,fontWeight:700,fontSize:16}}>Facturación mensual {ANIO}</div><div style={{fontSize:12,color:MUTED,marginTop:2}}>Facturado vs cobrado</div></div>
            <div style={{display:"flex",gap:14}}>
              {[[A,"Facturado"],[GREEN,"Cobrado"]].map(([c,l])=><div key={l} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:9,height:9,borderRadius:2,background:c}}/><span style={{fontSize:11,color:MUTED}}>{l}</span></div>)}
              <div style={{fontFamily:MONO,fontSize:13,fontWeight:700,color:VIOLET}}>Anual: {fmtK(proyAnual)}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:5,height:150}}>
            {porMes.map(d=>(
              <div key={d.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                {d.fac>0&&<div style={{fontSize:8,fontFamily:MONO,color:d.m===mesActual?A:MUTED,fontWeight:700}}>{fmtK(d.fac)}</div>}
                <div style={{width:"100%",position:"relative",height:110,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
                  <div style={{width:"100%",background:d.m===mesActual?A:A+"38",borderRadius:"3px 3px 0 0",height:d.fac>0?Math.max(5,Math.round(d.fac/maxV*100))+"%":"4px",minHeight:3}}/>
                  {d.cob>0&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:GREEN+"75",borderRadius:"3px 3px 0 0",height:Math.max(2,Math.round(d.cob/maxV*100))+"%"}}/>}
                </div>
                <div style={{fontSize:9,fontWeight:d.m===mesActual?800:500,color:d.m===mesActual?A:MUTED}}>{d.m}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Proyección anual</div><div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:VIOLET}}>{fmt(proyAnual)}</div></div>
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Promedio mensual</div><div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:BLUE}}>{fmt(avgMes)}</div></div>
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>% cobrado global</div><div style={{fontFamily:MONO,fontSize:22,fontWeight:800,color:GREEN}}>{proyAnual>0?Math.round(porMes.reduce((a,m)=>a+m.cob,0)/proyAnual*100):0}%</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {porMes.filter(m=>m.fac>0).map(m=>(
            <div key={m.m} style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontFamily:DISP,fontWeight:700,fontSize:15}}>{m.m} {ANIO}</span>
                <span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{m.n} reg.</span>
              </div>
              <div style={{fontFamily:MONO,fontSize:20,fontWeight:800,color:A,marginBottom:8}}>{fmt(m.fac)}</div>
              <MiniBar pct={m.fac>0?m.cob/m.fac*100:0} color={GREEN}/>
              <div style={{display:"flex",gap:10,marginTop:7}}>
                <div><div style={{fontSize:9,color:MUTED,textTransform:"uppercase",fontWeight:700}}>Cobrado</div><div style={{fontFamily:MONO,fontSize:12,color:GREEN,fontWeight:700}}>{fmt(m.cob)}</div></div>
                <div><div style={{fontSize:9,color:MUTED,textTransform:"uppercase",fontWeight:700}}>Pendiente</div><div style={{fontFamily:MONO,fontSize:12,color:AMBER,fontWeight:700}}>{fmt(m.fac-m.cob)}</div></div>
              </div>
            </div>
          ))}
          {porMes.filter(m=>m.fac>0).length===0&&<div style={{gridColumn:"1/-1",padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin datos. Agrega registros para ver proyecciones.</div>}
        </div>
      </>}

      {modal&&<Modal title={editItem?"Editar registro":"Nuevo registro de facturación"} onClose={()=>{setModal(false);setEditItem(null);}} icon={FileText} iconColor={BLUE} wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Mes de operación *</div>
            <select value={form.mesOp} onChange={sf("mesOp")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {MESES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Año</div>
            <select value={form.anio} onChange={sf("anio")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {[ANIO-1,ANIO,ANIO+1].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Inp label="Empresa a facturar *" value={form.empresa} onChange={sf("empresa")} placeholder="Nombre de la empresa"/>
          <Inp label="Quien solicita el servicio" value={form.solicitante} onChange={sf("solicitante")} placeholder="Nombre del contacto"/>
          <Inp label="Plan / Cuenta" value={form.plan} onChange={sf("plan")} placeholder="Ej: Plan Básico MTY, Cuenta #4521"/>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Estado de pago</div>
            <select value={form.status} onChange={sf("status")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {["Pendiente","Pagada","Vencida"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{gridColumn:"1/-1"}}><Inp label="Servicio / Descripción" value={form.servicio} onChange={sf("servicio")} placeholder="Ej: Distribución masiva Monterrey — Ruta Norte"/></div>
          <Inp label="Subtotal sin IVA *" type="number" value={form.subtotal} onChange={sf("subtotal")} placeholder="0.00"/>
          <div style={{display:"flex",alignItems:"center"}}><Tog checked={form.iva} onChange={v=>setForm(f=>({...f,iva:v}))} label="Incluir IVA 16%" sub={sub>0?"IVA: "+fmt(ivaP):"Escribe el subtotal"} color={BLUE}/></div>
          <div style={{gridColumn:"1/-1",padding:"14px 16px",background:"#fff8f3",borderRadius:12,border:"1.5px solid "+A+"24"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[["Subtotal",fmt(sub),MUTED],["IVA 16%",fmt(ivaP),MUTED],["Total c/IVA",fmt(totP),A]].map(([l,v,c])=>(
                <div key={l}><div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:MONO,fontSize:18,fontWeight:800,color:c,marginTop:3}}>{v}</div></div>
              ))}
            </div>
          </div>
          <div style={{gridColumn:"1/-1"}}><Txt label="Notas" value={form.notas} onChange={sf("notas")} placeholder="Observaciones, número de OC, folio interno…"/></div>
          <button onClick={save} className="btn" style={{gridColumn:"1/-1",background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:16,cursor:"pointer"}}>
            {editItem?"Guardar cambios":"Crear registro"}
          </button>
        </div>
      </Modal>}
    </div>
  );
}
/* ─── CLIENTES ──────────────────────────────────────────────────────────── */
function Clientes(){
  const [items,setItems]=useState([]);const[load,setLoad]=useState(true);
  const[modal,setModal]=useState(false);const[editItem,setEditItem]=useState(null);
  const[toast,setToast]=useState(null);
  const[q,setQ]=useState("");
  const emptyForm={nombre:"",contacto:"",email:"",tel:"",rfc:"",plan:"",notas:""};
  const[form,setForm]=useState(emptyForm);
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  useEffect(()=>onSnapshot(collection(db,"cuentas"),s=>{setItems(s.docs.map(d=>({id:d.id,...d.data()})));setLoad(false);}),[]);
  const openNew=()=>{setForm(emptyForm);setEditItem(null);setModal(true);};
  const openEdit=c=>{setForm({nombre:c.nombre||"",contacto:c.contacto||"",email:c.email||"",tel:c.tel||"",rfc:c.rfc||"",plan:c.plan||"",notas:c.notas||""});setEditItem(c);setModal(true);};
  const save=async()=>{
    if(!form.nombre){showT("Nombre requerido","err");return;}
    try{
      if(editItem){await updateDoc(doc(db,"cuentas",editItem.id),form);showT("✓ Cliente actualizado");}
      else{await addDoc(collection(db,"cuentas"),{...form,createdAt:serverTimestamp()});showT("✓ Cliente creado");}
      setModal(false);setForm(emptyForm);setEditItem(null);
    }catch(e){showT(e.message,"err");}
  };
  const del=async id=>{if(!confirm("¿Eliminar?"))return;await deleteDoc(doc(db,"cuentas",id));showT("Eliminado");};
  const filt=items.filter(c=>c.nombre?.toLowerCase().includes(q.toLowerCase())||c.contacto?.toLowerCase().includes(q.toLowerCase())||c.plan?.toLowerCase().includes(q.toLowerCase()));
  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div><h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Clientes</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>{items.length} cuentas activas</p></div>
        <button onClick={openNew} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"30"}}><Plus size={14}/>Nuevo cliente</button>
      </div>
      <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:11,padding:"9px 14px",display:"flex",alignItems:"center",gap:9,marginBottom:13}}><Search size={13} color={MUTED}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, plan, contacto…" style={{background:"none",border:"none",fontSize:13,flex:1}}/></div>
      {load?<div style={{padding:40,textAlign:"center",color:MUTED}}>Cargando…</div>
      :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
        {filt.length===0?<div style={{padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin clientes. <button onClick={openNew} style={{color:A,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Agregar →</button></div>
        :<table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{borderBottom:"1px solid "+BORDER,background:"#f8fafd"}}>{["Empresa","Plan / No. Cuenta","Contacto","Email / Tel","RFC",""].map(h=><th key={h} style={{padding:"9px 16px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{filt.map((c,i)=>(
            <tr key={c.id||i} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
              <td style={{padding:"12px 16px",fontWeight:700,fontSize:13}}>{c.nombre}</td>
              <td style={{padding:"12px 16px"}}>
                {c.plan
                  ?<span style={{background:VIOLET+"12",color:VIOLET,borderRadius:8,padding:"3px 10px",fontSize:11,fontWeight:700,fontFamily:MONO}}>{c.plan}</span>
                  :<span style={{color:MUTED,fontSize:11}}>—</span>}
              </td>
              <td style={{padding:"12px 16px",fontSize:12,color:MUTED}}>{c.contacto||"—"}</td>
              <td style={{padding:"12px 16px",fontSize:12,color:MUTED}}>{[c.email,c.tel].filter(Boolean).join(" · ")||"—"}</td>
              <td style={{padding:"12px 16px",fontFamily:MONO,fontSize:11,color:MUTED}}>{c.rfc||"—"}</td>
              <td style={{padding:"12px 16px"}}>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>openEdit(c)} className="btn" style={{color:BLUE,padding:"3px 7px",border:"1px solid "+BLUE+"20",borderRadius:6,fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3}}><Eye size={11}/>Editar</button>
                  <button onClick={()=>del(c.id)} className="btn" style={{color:MUTED}}><Trash2 size={12}/></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>}
      </div>}
      {modal&&<Modal title={editItem?"Editar cliente":"Nuevo cliente"} onClose={()=>{setModal(false);setEditItem(null);}} icon={Building2} iconColor={BLUE}>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <Inp label="Empresa *" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Ej: Promotor On Demand"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
            <Inp label="Contacto" value={form.contacto} onChange={e=>setForm({...form,contacto:e.target.value})} placeholder="Nombre del contacto"/>
            <Inp label="Teléfono" value={form.tel} onChange={e=>setForm({...form,tel:e.target.value})} placeholder="55 1234 5678"/>
            <Inp label="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="contacto@empresa.com"/>
            <Inp label="RFC" value={form.rfc} onChange={e=>setForm({...form,rfc:e.target.value})} placeholder="POD123456XXX"/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>Plan / Número de cuenta *</div>
            <input value={form.plan} onChange={e=>setForm({...form,plan:e.target.value})}
              placeholder="Ej: 212802 POD Robots"
              style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:14,fontFamily:MONO,fontWeight:600,color:VIOLET}}/>
            <div style={{fontSize:11,color:MUTED,marginTop:5}}>Este número aparece en los reportes de facturación para contadores.</div>
          </div>
          <Txt label="Notas" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Observaciones, condiciones especiales…"/>
          <button onClick={save} className="btn" style={{background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:16,cursor:"pointer"}}>
            {editItem?"Guardar cambios":"Crear cliente"}
          </button>
        </div>
      </Modal>}
    </div>
  );
}



/* ─── VIÁTICOS & GASTOS OPERATIVOS ──────────────────────────────────────── */
function Viaticos(){
  const [items,setItems]=useState([]);const [load,setLoad]=useState(true);
  const [modal,setModal]=useState(false);const [toast,setToast]=useState(null);
  const [filtMes,setFiltMes]=useState("todos");const [filtTipo,setFiltTipo]=useState("todos");
  const showT=(m,t="ok")=>setToast({msg:m,type:t});

  const TIPOS=[
    {k:"comida",label:"🍽️ Comida",color:AMBER},
    {k:"hotel",label:"🏨 Hotel",color:BLUE},
    {k:"gasolina",label:"⛽ Gasolina",color:GREEN},
    {k:"casetas",label:"🛣️ Casetas",color:VIOLET},
    {k:"tag",label:"📟 TAG / Telvia",color:"#0891b2"},
    {k:"hospital",label:"🏥 Hospital / Médico",color:ROSE},
    {k:"herramienta",label:"🔧 Herramienta",color:"#92400e"},
    {k:"otro",label:"📎 Otro",color:MUTED},
  ];
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const mesActual=MESES[new Date().getMonth()];
  const ANIO=new Date().getFullYear();

  const empty={tipo:"comida",concepto:"",monto:"",operador:"",ruta:"",mes:mesActual,anio:ANIO,notas:""};
  const [form,setForm]=useState(empty);
  const sf=k=>e=>setForm(f=>({...f,[k]:e.target.value}));

  useEffect(()=>onSnapshot(collection(db,"viaticos"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setLoad(false);
  }),[]);

  const save=async()=>{
    if(!form.concepto||!form.monto){showT("Concepto y monto requeridos","err");return;}
    try{
      await addDoc(collection(db,"viaticos"),{...form,monto:parseFloat(form.monto)||0,folio:"GAS-"+uid(),createdAt:serverTimestamp()});
      setModal(false);setForm(empty);showT("✓ Gasto registrado");
    }catch(e){showT(e.message,"err");}
  };
  const del=async id=>{if(!confirm("¿Eliminar?"))return;await deleteDoc(doc(db,"viaticos",id));showT("Eliminado");};

  const filt=items.filter(g=>(filtMes==="todos"||g.mes===filtMes)&&(filtTipo==="todos"||g.tipo===filtTipo));
  const totGastos=filt.reduce((a,g)=>a+(g.monto||0),0);

  // Resumen por tipo
  const porTipo={};
  items.forEach(g=>{if(!porTipo[g.tipo]) porTipo[g.tipo]=0; porTipo[g.tipo]+=g.monto||0;});
  const maxTipo=Math.max(...Object.values(porTipo),1);

  // Resumen por mes
  const porMes=MESES.map(m=>({m,total:items.filter(g=>g.mes===m).reduce((a,g)=>a+(g.monto||0),0)}));
  const maxMes=Math.max(...porMes.map(d=>d.total),1);

  const tipoInfo=k=>TIPOS.find(t=>t.k===k)||{label:k,color:MUTED};

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}

      {/* Header */}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div>
          <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Viáticos & Gastos</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>Comidas · Hotel · Gasolina · TAG · Médico · Todos los gastos operativos</p>
        </div>
        <button onClick={()=>{setForm(empty);setModal(true);}} className="btn"
          style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+AMBER+",#f59e0b)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+AMBER+"40"}}>
          <Plus size={14}/>Registrar gasto
        </button>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <KpiCard icon={TrendingUp} color={ROSE} label="Total gastos" value={fmtK(items.reduce((a,g)=>a+(g.monto||0),0))} sub={items.length+" registros"}/>
        <KpiCard icon={Calendar} color={AMBER} label={mesActual+" "+ANIO} value={fmtK(items.filter(g=>g.mes===mesActual&&g.anio===ANIO).reduce((a,g)=>a+(g.monto||0),0))} sub="mes actual"/>
        <KpiCard icon={Truck} color={BLUE} label="Gasolina+Casetas+TAG" value={fmtK(items.filter(g=>["gasolina","casetas","tag"].includes(g.tipo)).reduce((a,g)=>a+(g.monto||0),0))}/>
        <KpiCard icon={Users} color={GREEN} label="Comida+Hotel" value={fmtK(items.filter(g=>["comida","hotel"].includes(g.tipo)).reduce((a,g)=>a+(g.monto||0),0))}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16,marginBottom:16}}>
        {/* Gráfica por mes */}
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20}}>
          <div style={{fontFamily:DISP,fontWeight:700,fontSize:15,marginBottom:16}}>Gastos por mes {ANIO}</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:5,height:100}}>
            {porMes.map(d=>(
              <div key={d.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                {d.total>0&&<div style={{fontSize:7,fontFamily:MONO,color:d.m===mesActual?ROSE:MUTED,fontWeight:700}}>{fmtK(d.total)}</div>}
                <div style={{width:"100%",background:d.m===mesActual?ROSE:ROSE+"38",borderRadius:"3px 3px 0 0",height:d.total>0?Math.max(4,Math.round(d.total/maxMes*80))+"%":"3px",minHeight:3}}/>
                <div style={{fontSize:8,fontWeight:d.m===mesActual?800:400,color:d.m===mesActual?ROSE:MUTED}}>{d.m}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Por categoría */}
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20}}>
          <div style={{fontFamily:DISP,fontWeight:700,fontSize:15,marginBottom:14}}>Por categoría</div>
          {TIPOS.filter(t=>porTipo[t.k]>0).sort((a,b)=>(porTipo[b.k]||0)-(porTipo[a.k]||0)).map(t=>(
            <div key={t.k} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                <span style={{color:TEXT,fontWeight:600}}>{t.label}</span>
                <span style={{fontFamily:MONO,fontWeight:700,color:t.color}}>{fmt(porTipo[t.k]||0)}</span>
              </div>
              <MiniBar pct={(porTipo[t.k]||0)/maxTipo*100} color={t.color} h={5}/>
            </div>
          ))}
          {Object.keys(porTipo).length===0&&<div style={{color:MUTED,fontSize:12,textAlign:"center",padding:"20px 0"}}>Sin gastos registrados</div>}
        </div>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {["todos",...MESES].map(m=>(
            <button key={m} onClick={()=>setFiltMes(m)} className="btn"
              style={{padding:"5px 11px",borderRadius:8,border:"1.5px solid "+(filtMes===m?ROSE:BD2),background:filtMes===m?ROSE+"10":"#fff",color:filtMes===m?ROSE:MUTED,fontSize:11,fontWeight:filtMes===m?700:500,cursor:"pointer"}}>
              {m==="todos"?"Todos los meses":m}
            </button>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {[{k:"todos",l:"Todos"},...TIPOS.map(t=>({k:t.k,l:t.label}))].map(t=>(
            <button key={t.k} onClick={()=>setFiltTipo(t.k)} className="btn"
              style={{padding:"5px 11px",borderRadius:8,border:"1.5px solid "+(filtTipo===t.k?VIOLET:BD2),background:filtTipo===t.k?VIOLET+"10":"#fff",color:filtTipo===t.k?VIOLET:MUTED,fontSize:11,fontWeight:filtTipo===t.k?700:500,cursor:"pointer",whiteSpace:"nowrap"}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Total filtrado */}
      {(filtMes!=="todos"||filtTipo!=="todos")&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:11,padding:"10px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,color:MUTED}}>{filt.length} gasto(s) {filtMes!=="todos"?`· ${filtMes}`:""} {filtTipo!=="todos"?`· ${tipoInfo(filtTipo).label}`:""}</span>
        <span style={{fontFamily:MONO,fontSize:16,fontWeight:800,color:ROSE}}>{fmt(totGastos)}</span>
      </div>}

      {/* Tabla */}
      {load?<div style={{padding:40,textAlign:"center",color:MUTED}}>Cargando…</div>
      :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
        {filt.length===0
          ?<div style={{padding:50,textAlign:"center",color:MUTED,fontSize:13}}>
            Sin gastos registrados. <button onClick={()=>{setForm(empty);setModal(true);}} style={{color:AMBER,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Registrar →</button>
          </div>
          :<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead><tr style={{borderBottom:"1px solid "+BORDER,background:"#f8fafd"}}>
                {["Folio","Mes","Tipo","Concepto","Operador","Ruta","Monto",""].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{filt.map((g,i)=>{
                const ti=tipoInfo(g.tipo);
                return(
                  <tr key={g.id||i} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
                    <td style={{padding:"10px 14px",fontFamily:MONO,fontSize:10,color:MUTED}}>{g.folio||"—"}</td>
                    <td style={{padding:"10px 14px"}}><span style={{background:AMBER+"12",color:AMBER,borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700}}>{g.mes||"—"} {g.anio||""}</span></td>
                    <td style={{padding:"10px 14px"}}><span style={{background:ti.color+"14",color:ti.color,borderRadius:7,padding:"3px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{ti.label}</span></td>
                    <td style={{padding:"10px 14px",fontWeight:600,fontSize:13}}>{g.concepto||"—"}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:MUTED}}>{g.operador||"—"}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:MUTED}}>{g.ruta||"—"}</td>
                    <td style={{padding:"10px 14px",fontFamily:MONO,fontSize:14,fontWeight:800,color:ROSE}}>{fmt(g.monto||0)}</td>
                    <td style={{padding:"10px 14px"}}><button onClick={()=>del(g.id)} className="btn" style={{color:MUTED}}><Trash2 size={12}/></button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        }
      </div>}

      {/* Modal */}
      {modal&&<Modal title="Registrar gasto operativo" onClose={()=>setModal(false)} icon={Zap} iconColor={AMBER} wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {/* Tipo */}
          <div style={{gridColumn:"1/-1"}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.07em"}}>Tipo de gasto *</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {TIPOS.map(t=>(
                <button key={t.k} onClick={()=>setForm(f=>({...f,tipo:t.k}))} className="btn"
                  style={{padding:"7px 12px",borderRadius:9,border:"1.5px solid "+(form.tipo===t.k?t.color:BD2),background:form.tipo===t.k?t.color+"14":"#fff",color:form.tipo===t.k?t.color:MUTED,fontSize:12,fontWeight:form.tipo===t.k?700:500,cursor:"pointer",whiteSpace:"nowrap"}}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {/* Campos */}
          <div style={{gridColumn:"1/-1"}}><Inp label="Concepto / Descripción *" value={form.concepto} onChange={sf("concepto")} placeholder="Ej: Comida equipo MTY día 1, Gasolina ruta norte, Hotel Marriott…"/></div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Monto (sin IVA) *</div>
            <input type="number" value={form.monto} onChange={sf("monto")} placeholder="0.00"
              style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:16,fontFamily:MONO,fontWeight:700,color:ROSE}}/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Mes de operación</div>
            <select value={form.mes} onChange={sf("mes")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:14,cursor:"pointer"}}>
              {MESES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <Inp label="Operador / Chofer" value={form.operador} onChange={sf("operador")} placeholder="Nombre del operador"/>
          <Inp label="Ruta / Proyecto" value={form.ruta} onChange={sf("ruta")} placeholder="Ej: CDMX-MTY, Proyecto Walmart…"/>
          <div style={{gridColumn:"1/-1"}}><Txt label="Notas / Referencia del ticket" value={form.notas} onChange={sf("notas")} placeholder="Número de ticket, observaciones…"/></div>
          <button onClick={save} className="btn" style={{gridColumn:"1/-1",background:"linear-gradient(135deg,"+AMBER+",#f59e0b)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:16,cursor:"pointer"}}>
            Guardar gasto
          </button>
        </div>
      </Modal>}
    </div>
  );
}

/* ─── ENTREGAS ──────────────────────────────────────────────────────────── */
function Entregas(){
  const [items,setItems]=useState([]);const[load,setLoad]=useState(true);
  const[form,setForm]=useState({pdv:"",dir:"",receptor:"",notas:"",status:"Entregado"});
  const[toast,setToast]=useState(null);const[q,setQ]=useState("");
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  useEffect(()=>onSnapshot(collection(db,"entregas"),s=>{setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));setLoad(false);}),[]);
  const save=async()=>{if(!form.pdv){showT("PDV requerido","err");return;}try{await addDoc(collection(db,"entregas"),{...form,hora:new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}),createdAt:serverTimestamp()});setForm({pdv:"",dir:"",receptor:"",notas:"",status:"Entregado"});showT("✓ Entrega registrada");}catch(e){showT(e.message,"err");}};
  const del=async id=>{if(!confirm("¿Eliminar esta entrega?"))return;await deleteDoc(doc(db,"entregas",id));showT("Eliminada");};
  const filt=items.filter(e=>e.pdv?.toLowerCase().includes(q.toLowerCase())||e.dir?.toLowerCase().includes(q.toLowerCase()));
  const sc={Entregado:GREEN,"En tránsito":BLUE,Pendiente:AMBER,Rechazado:ROSE};
  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div><h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Entregas</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>{items.length} registradas · {items.filter(e=>e.status==="Entregado").length} completadas</p></div>
        <div style={{display:"flex",gap:7}}>{[["Entregado",GREEN],["En tránsito",BLUE],["Pendiente",AMBER]].map(([s,c])=><Tag key={s} color={c}>{items.filter(e=>e.status===s).length} {s}</Tag>)}</div>
      </div>
      <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:11,padding:"9px 14px",display:"flex",alignItems:"center",gap:9,marginBottom:13}}><Search size={13} color={MUTED}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar PDV o dirección…" style={{background:"none",border:"none",fontSize:13,flex:1}}/></div>
      {!load&&<div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:18}}>
        {filt.length===0&&<div style={{padding:32,textAlign:"center",color:MUTED,fontSize:13,background:"#fff",border:"1px solid "+BORDER,borderRadius:13}}>Sin entregas.</div>}
        {filt.map((e,i)=>{const c=sc[e.status]||MUTED;return(
          <div key={e.id||i} className="ch" style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
            <div style={{width:38,height:38,borderRadius:10,background:c+"12",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {e.status==="Entregado"?<CheckCircle size={16} color={c}/>:e.status==="En tránsito"?<Navigation size={16} color={c}/>:<Clock size={16} color={c}/>}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{e.pdv}</div>
              <div style={{fontSize:11,color:MUTED}}>{e.dir}</div>
              {e.receptor&&<div style={{fontSize:11,color:GREEN,marginTop:2}}>✓ {e.receptor}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <Tag color={c} sm>{e.status}</Tag>
              <span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{e.hora}</span>
            </div>
            <button onClick={()=>del(e.id)} className="btn" style={{color:MUTED}}><Trash2 size={12}/></button>
          </div>
        );})}
      </div>}
      <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,padding:20}}>
        <div style={{fontFamily:DISP,fontWeight:700,fontSize:14,marginBottom:14}}>Registrar entrega</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:11}}>
          <Inp label="PDV / Punto de venta *" value={form.pdv} onChange={e=>setForm({...form,pdv:e.target.value})} placeholder="Nombre del PDV"/>
          <Inp label="Dirección" value={form.dir} onChange={e=>setForm({...form,dir:e.target.value})} placeholder="Dirección"/>
          <Inp label="Receptor" value={form.receptor} onChange={e=>setForm({...form,receptor:e.target.value})} placeholder="¿Quién recibió?"/>
          <Sel label="Estado" value={form.status} onChange={e=>setForm({...form,status:e.target.value})} options={["Entregado","En tránsito","Pendiente","Rechazado"]}/>
        </div>
        <Txt label="Notas / Incidencias" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Observaciones…" style={{marginBottom:11}}/>
        <button onClick={save} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:11,padding:"11px 20px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"28"}}><CheckCircle size={14}/>Confirmar entrega</button>
      </div>
    </div>
  );
}


/* ─── PRESUPUESTOS ───────────────────────────────────────────────────────── */
function Presupuestos(){
  const [items,setItems]=useState([]);
  const [load,setLoad]=useState(true);
  const [modal,setModal]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [toast,setToast]=useState(null);
  const [q,setQ]=useState("");
  const [statusF,setStatusF]=useState("todos");
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  const today=new Date().toISOString().slice(0,10);
  const in15=new Date(Date.now()+15*86400000).toISOString().slice(0,10);
  const empty={cliente:"",contacto:"",fecha:today,vigencia:in15,conceptos:[{desc:"",cant:1,precio:0}],iva:true,status:"Borrador",notas:""};
  const [form,setForm]=useState(empty);

  useEffect(()=>onSnapshot(collection(db,"presupuestos"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setLoad(false);
  }),[]);

  const openNew=()=>{setForm(empty);setEditItem(null);setModal(true);};
  const openEdit=p=>{
    setForm({
      cliente:p.cliente||"", contacto:p.contacto||"",
      fecha:p.fecha||today, vigencia:p.vigencia||in15,
      conceptos:(p.conceptos&&p.conceptos.length?p.conceptos:[{desc:"",cant:1,precio:0}]).map(c=>({desc:c.desc||"",cant:Number(c.cant)||0,precio:Number(c.precio)||0})),
      iva:p.ivaAmt>0||p.iva!==false,
      status:p.status||"Borrador",
      notas:p.notas||"",
    });
    setEditItem(p);setModal(true);
  };

  const subtotal=form.conceptos.reduce((a,c)=>a+(Number(c.cant)||0)*(Number(c.precio)||0),0);
  const ivaAmt=form.iva?subtotal*.16:0;
  const total=subtotal+ivaAmt;

  const updConcepto=(i,k,v)=>setForm(f=>({...f,conceptos:f.conceptos.map((c,idx)=>idx===i?{...c,[k]:v}:c)}));
  const addConcepto=()=>setForm(f=>({...f,conceptos:[...f.conceptos,{desc:"",cant:1,precio:0}]}));
  const rmConcepto=i=>setForm(f=>({...f,conceptos:f.conceptos.length>1?f.conceptos.filter((_,idx)=>idx!==i):f.conceptos}));

  const save=async()=>{
    if(!form.cliente.trim()){showT("El cliente es obligatorio","err");return;}
    if(form.conceptos.filter(c=>c.desc&&c.cant>0).length===0){showT("Agrega al menos un concepto con descripción y cantidad","err");return;}
    const data={
      ...form,
      conceptos:form.conceptos.map(c=>({desc:c.desc,cant:Number(c.cant)||0,precio:Number(c.precio)||0})),
      subtotal,ivaAmt,total,
    };
    try{
      if(editItem){
        await updateDoc(doc(db,"presupuestos",editItem.id),data);
        showT("✓ Presupuesto actualizado");
      }else{
        await addDoc(collection(db,"presupuestos"),{...data,folio:"PRE-"+uid(),createdAt:serverTimestamp()});
        showT("✓ Presupuesto creado");
      }
      setModal(false);setForm(empty);setEditItem(null);
    }catch(e){showT(e.message,"err");}
  };
  const del=async id=>{if(!confirm("¿Eliminar este presupuesto?"))return;await deleteDoc(doc(db,"presupuestos",id));showT("Eliminado");};
  const updStatus=async(id,status)=>updateDoc(doc(db,"presupuestos",id),{status});

  const sc={Borrador:MUTED,Enviado:BLUE,Aprobado:GREEN,Rechazado:ROSE};
  const statuses=["Borrador","Enviado","Aprobado","Rechazado"];
  const filt=items.filter(p=>
    (statusF==="todos"||p.status===statusF) &&
    (!q || (p.cliente||"").toLowerCase().includes(q.toLowerCase()) || (p.folio||"").toLowerCase().includes(q.toLowerCase()))
  );
  const totAll=filt.reduce((a,p)=>a+(p.total||0),0);
  const aprobados=items.filter(p=>p.status==="Aprobado").reduce((a,p)=>a+(p.total||0),0);
  const pendientes=items.filter(p=>p.status==="Enviado").reduce((a,p)=>a+(p.total||0),0);

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div>
          <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Presupuestos</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>Crea, envía y controla presupuestos · PDF · XLSX</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>exportPresupuestosXLSX(items)} className="btn" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+GREEN+"40",color:GREEN,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><Download size={13}/>Exportar XLSX</button>
          <button onClick={openNew} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"30"}}><Plus size={14}/>Nuevo presupuesto</button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <KpiCard icon={ClipboardList} color={A} label="Total presupuestos" value={items.length} sub="en la base"/>
        <KpiCard icon={DollarSign} color={VIOLET} label="Monto filtrado" value={fmtK(totAll)} sub={filt.length+" registros"}/>
        <KpiCard icon={CheckCircle} color={GREEN} label="Aprobados" value={fmtK(aprobados)}/>
        <KpiCard icon={Clock} color={BLUE} label="Enviados / por definir" value={fmtK(pendientes)}/>
      </div>

      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
        {["todos",...statuses].map(s=>(
          <button key={s} onClick={()=>setStatusF(s)} className="btn" style={{padding:"6px 14px",borderRadius:9,border:"1.5px solid "+(statusF===s?A:BD2),background:statusF===s?A+"10":"#fff",color:statusF===s?A:MUTED,fontSize:12,fontWeight:statusF===s?700:500,cursor:"pointer"}}>{s==="todos"?"Todos":s}</button>
        ))}
        <div style={{marginLeft:"auto",background:"#fff",border:"1px solid "+BORDER,borderRadius:10,padding:"7px 13px",display:"flex",alignItems:"center",gap:8,minWidth:240}}>
          <Search size={13} color={MUTED}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente o folio…" style={{background:"none",border:"none",fontSize:13,flex:1,outline:"none"}}/>
        </div>
      </div>

      {load?<div style={{padding:40,textAlign:"center",color:MUTED}}>Cargando…</div>
      :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
        {filt.length===0?
          <div style={{padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin presupuestos. <button onClick={openNew} style={{color:A,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Crear →</button></div>
          :<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
            <thead><tr style={{borderBottom:"1px solid "+BORDER}}>
              {["Folio","Cliente","Fecha","Vigencia","Conceptos","Subtotal","IVA","Total","Estado","Acciones"].map(h=>
                <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              )}
            </tr></thead>
            <tbody>{filt.map(p=>(
              <tr key={p.id} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:10,color:MUTED,whiteSpace:"nowrap"}}>{p.folio||"—"}</td>
                <td style={{padding:"10px 12px",fontWeight:700,fontSize:13}}>{p.cliente||"—"}<div style={{fontSize:10,color:MUTED,fontWeight:400}}>{p.contacto}</div></td>
                <td style={{padding:"10px 12px",fontSize:12,color:MUTED,whiteSpace:"nowrap"}}>{p.fecha||"—"}</td>
                <td style={{padding:"10px 12px",fontSize:12,color:MUTED,whiteSpace:"nowrap"}}>{p.vigencia||"—"}</td>
                <td style={{padding:"10px 12px",fontSize:12}}>{(p.conceptos||[]).length}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:12}}>{fmt(p.subtotal||0)}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:12,color:MUTED}}>{fmt(p.ivaAmt||0)}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:13,fontWeight:800}}>{fmt(p.total||0)}</td>
                <td style={{padding:"10px 12px"}}>
                  <select value={p.status||"Borrador"} onChange={e=>updStatus(p.id,e.target.value)} style={{background:"transparent",border:"1.5px solid "+(sc[p.status]||MUTED)+"28",borderRadius:8,padding:"3px 7px",color:sc[p.status]||MUTED,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    {statuses.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{padding:"10px 12px"}}>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    <button onClick={()=>downloadPresupuestoPDF(p)} className="btn" title="Descargar PDF" style={{color:BLUE,padding:"4px 6px",border:"1px solid "+BLUE+"20",borderRadius:6,display:"flex",alignItems:"center",gap:3,fontSize:11,fontWeight:600}}><Download size={12}/>PDF</button>
                    <button onClick={()=>openEdit(p)} className="btn" style={{color:MUTED,padding:4}}><Eye size={13}/></button>
                    <button onClick={()=>del(p.id)} className="btn" style={{color:MUTED,padding:4}}><Trash2 size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>}
      </div>}

      {modal&&<Modal title={editItem?"Editar presupuesto":"Nuevo presupuesto"} onClose={()=>{setModal(false);setEditItem(null);}} icon={ClipboardList} iconColor={A} wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <Inp label="Cliente *" value={form.cliente} onChange={e=>setForm({...form,cliente:e.target.value})} placeholder="Nombre de la empresa"/>
          <Inp label="Contacto" value={form.contacto} onChange={e=>setForm({...form,contacto:e.target.value})} placeholder="Nombre del contacto"/>
          <Inp label="Fecha" type="date" value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})}/>
          <Inp label="Vigencia hasta" type="date" value={form.vigencia} onChange={e=>setForm({...form,vigencia:e.target.value})}/>
        </div>
        <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Conceptos</div>
        <div style={{background:"#f8fafd",border:"1px solid "+BORDER,borderRadius:11,padding:11,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"3fr 0.7fr 1fr 1fr 30px",gap:7,fontSize:9,fontWeight:700,color:MUTED,textTransform:"uppercase",marginBottom:6,padding:"0 4px"}}>
            <div>Descripción</div><div style={{textAlign:"center"}}>Cant</div><div style={{textAlign:"right"}}>P. Unit</div><div style={{textAlign:"right"}}>Importe</div><div/>
          </div>
          {form.conceptos.map((c,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"3fr 0.7fr 1fr 1fr 30px",gap:7,marginBottom:6,alignItems:"center"}}>
              <input value={c.desc} onChange={e=>updConcepto(i,"desc",e.target.value)} placeholder="Ej: Traslado MTY → GDL" style={{background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontSize:12}}/>
              <input type="number" value={c.cant} onChange={e=>updConcepto(i,"cant",e.target.value)} style={{background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 6px",fontSize:12,fontFamily:MONO,textAlign:"center"}}/>
              <input type="number" value={c.precio} onChange={e=>updConcepto(i,"precio",e.target.value)} style={{background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontSize:12,fontFamily:MONO,textAlign:"right"}}/>
              <div style={{fontFamily:MONO,fontSize:12,fontWeight:700,textAlign:"right",padding:"7px 6px",color:TEXT}}>{fmt((Number(c.cant)||0)*(Number(c.precio)||0))}</div>
              <button onClick={()=>rmConcepto(i)} className="btn" style={{color:ROSE,border:"1px solid "+ROSE+"28",borderRadius:6,padding:4,display:"flex",justifyContent:"center"}}><X size={11}/></button>
            </div>
          ))}
          <button onClick={addConcepto} className="btn" style={{background:A+"10",color:A,border:"1.5px dashed "+A+"50",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6,marginTop:6}}><Plus size={12}/>Agregar concepto</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Estado</div>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {statuses.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center"}}>
            <Tog checked={form.iva} onChange={v=>setForm(f=>({...f,iva:v}))} label="Incluir IVA 16%" sub={subtotal>0?"IVA: "+fmt(subtotal*.16):"Sin subtotal"} color={BLUE}/>
          </div>
        </div>

        <div style={{padding:"14px 16px",background:"#fff8f3",borderRadius:12,border:"1.5px solid "+A+"24",marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[["Subtotal",fmt(subtotal),MUTED],["IVA 16%",fmt(ivaAmt),MUTED],["Total c/IVA",fmt(total),A]].map(([l,v,c])=>(
              <div key={l}><div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:MONO,fontSize:18,fontWeight:800,color:c,marginTop:3}}>{v}</div></div>
            ))}
          </div>
        </div>

        <Txt label="Notas y condiciones" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Términos, forma de pago, vigencia, etc."/>

        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={save} className="btn" style={{flex:1,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:15}}>
            {editItem?"Guardar cambios":"Crear presupuesto"}
          </button>
          <button onClick={()=>downloadPresupuestoPDF({folio:editItem?.folio||"PREVIEW",cliente:form.cliente,contacto:form.contacto,fecha:form.fecha,vigencia:form.vigencia,conceptos:form.conceptos,subtotal,ivaAmt,total,notas:form.notas,status:form.status})} className="btn" style={{background:"#fff",border:"1.5px solid "+BLUE+"40",color:BLUE,borderRadius:12,padding:"13px 20px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:7}}><Download size={14}/>Vista PDF</button>
        </div>
      </Modal>}
    </div>
  );
}

/* ─── CHOFERES ───────────────────────────────────────────────────────────── */
function Choferes(){
  const [items,setItems]=useState([]);
  const [load,setLoad]=useState(true);
  const [modal,setModal]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [toast,setToast]=useState(null);
  const [q,setQ]=useState("");
  const [statusF,setStatusF]=useState("todos");
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  const statuses=["Disponible","En ruta","Descanso","Inactivo"];
  const sc={Disponible:GREEN,"En ruta":BLUE,Descanso:AMBER,Inactivo:MUTED};
  const empty={nombre:"",tel:"",email:"",placa:"",vehiculo:"cam",licencia:"",emergencia:"",emergenciaTel:"",status:"Disponible",fotoURL:"",notas:""};
  const [form,setForm]=useState(empty);

  useEffect(()=>onSnapshot(collection(db,"choferes"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")));
    setLoad(false);
  }),[]);

  const openNew=()=>{setForm(empty);setEditItem(null);setModal(true);};
  const openEdit=c=>{setForm({nombre:c.nombre||"",tel:c.tel||"",email:c.email||"",placa:c.placa||"",vehiculo:c.vehiculo||"cam",licencia:c.licencia||"",emergencia:c.emergencia||"",emergenciaTel:c.emergenciaTel||"",status:c.status||"Disponible",fotoURL:c.fotoURL||"",notas:c.notas||""});setEditItem(c);setModal(true);};

  const save=async()=>{
    if(!form.nombre.trim()||!form.tel.trim()){showT("Nombre y teléfono son obligatorios","err");return;}
    // Normalizar teléfono (quitar espacios, dashes, etc.)
    const telNorm = form.tel.replace(/\D/g,"");
    if(telNorm.length<10){showT("El teléfono debe tener al menos 10 dígitos","err");return;}
    const data={...form,tel:telNorm};
    try{
      if(editItem){await updateDoc(doc(db,"choferes",editItem.id),data);showT("✓ Chofer actualizado");}
      else{await addDoc(collection(db,"choferes"),{...data,codigoAcceso:Math.random().toString(36).slice(2,8).toUpperCase(),createdAt:serverTimestamp()});showT("✓ Chofer agregado");}
      setModal(false);setForm(empty);setEditItem(null);
    }catch(e){showT(e.message,"err");}
  };
  const del=async id=>{if(!confirm("¿Eliminar este chofer?"))return;await deleteDoc(doc(db,"choferes",id));showT("Eliminado");};
  const updStatus=async(id,status)=>updateDoc(doc(db,"choferes",id),{status});

  const filt=items.filter(c=>(statusF==="todos"||c.status===statusF)&&(!q||(c.nombre||"").toLowerCase().includes(q.toLowerCase())||(c.tel||"").includes(q)||(c.placa||"").toLowerCase().includes(q.toLowerCase())));
  const disponibles=items.filter(c=>c.status==="Disponible").length;
  const enRuta=items.filter(c=>c.status==="En ruta").length;

  return(
    <div className="slide-in" style={{flex:1,overflowY:"auto",padding:"24px 28px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Choferes</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>Equipo operativo · Asignación a rutas · Código de acceso móvil</p>
        </div>
        <button onClick={openNew} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"30"}}><Plus size={14}/>Nuevo chofer</button>
      </div>

      <div className="g4" style={{marginBottom:16}}>
        <KpiCard icon={Users} color={A} label="Total choferes" value={items.length} sub="en la flota"/>
        <KpiCard icon={CheckCircle} color={GREEN} label="Disponibles" value={disponibles}/>
        <KpiCard icon={Navigation} color={BLUE} label="En ruta" value={enRuta}/>
        <KpiCard icon={Clock} color={AMBER} label="En descanso" value={items.filter(c=>c.status==="Descanso").length}/>
      </div>

      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
        {["todos",...statuses].map(s=>(
          <button key={s} onClick={()=>setStatusF(s)} className="btn" style={{padding:"6px 14px",borderRadius:9,border:"1.5px solid "+(statusF===s?A:BD2),background:statusF===s?A+"10":"#fff",color:statusF===s?A:MUTED,fontSize:12,fontWeight:statusF===s?700:500}}>{s==="todos"?"Todos":s}</button>
        ))}
        <div style={{marginLeft:"auto",background:"#fff",border:"1px solid "+BORDER,borderRadius:10,padding:"7px 13px",display:"flex",alignItems:"center",gap:8,minWidth:220}}>
          <Search size={13} color={MUTED}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar nombre, tel, placa…" style={{background:"none",border:"none",fontSize:13,flex:1,outline:"none"}}/>
        </div>
      </div>

      {load?<SkeletonRows n={4}/>
      :<div className="g3">
        {filt.length===0?<div style={{gridColumn:"1/-1"}}><EmptyState icon={Users} title="Sin choferes" sub="Agrega tu equipo de choferes para asignarles rutas" action={openNew} actionLabel="Nuevo chofer"/></div>
        :filt.map(c=>(
          <div key={c.id} className="ch" style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,padding:16,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,"+A+"22,"+VIOLET+"22)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:800,fontSize:16,color:A,flexShrink:0}}>{(c.nombre||"?").slice(0,2).toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nombre}</div>
                <div style={{fontSize:11,color:MUTED,fontFamily:MONO}}>{c.tel}</div>
              </div>
              <select value={c.status||"Disponible"} onChange={e=>updStatus(c.id,e.target.value)} style={{background:"transparent",border:"1.5px solid "+(sc[c.status]||MUTED)+"28",borderRadius:8,padding:"3px 7px",color:sc[c.status]||MUTED,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                {statuses.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10,fontSize:11}}>
              <div><div style={{color:MUTED,fontWeight:700,textTransform:"uppercase",fontSize:9}}>Placa</div><div style={{fontFamily:MONO,fontWeight:700}}>{c.placa||"—"}</div></div>
              <div><div style={{color:MUTED,fontWeight:700,textTransform:"uppercase",fontSize:9}}>Licencia</div><div style={{fontFamily:MONO}}>{c.licencia||"—"}</div></div>
              <div><div style={{color:MUTED,fontWeight:700,textTransform:"uppercase",fontSize:9}}>Emergencia</div><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.emergencia||"—"}</div></div>
              <div><div style={{color:MUTED,fontWeight:700,textTransform:"uppercase",fontSize:9}}>Tel. emergencia</div><div style={{fontFamily:MONO}}>{c.emergenciaTel||"—"}</div></div>
            </div>
            {c.codigoAcceso&&<div style={{padding:"8px 10px",background:VIOLET+"08",borderRadius:8,border:"1px dashed "+VIOLET+"30",marginBottom:10}}>
              <div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>Código de acceso app chofer</div>
              <div style={{fontFamily:MONO,fontWeight:800,fontSize:16,color:VIOLET,letterSpacing:"0.1em"}}>{c.codigoAcceso}</div>
            </div>}
            <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
              <button onClick={()=>openEdit(c)} className="btn" style={{color:BLUE,padding:"5px 9px",border:"1px solid "+BLUE+"20",borderRadius:6,fontSize:11,fontWeight:600}}><Eye size={12}/></button>
              <button onClick={()=>del(c.id)} className="btn" style={{color:ROSE,padding:"5px 9px",border:"1px solid "+ROSE+"20",borderRadius:6,fontSize:11,fontWeight:600}}><Trash2 size={12}/></button>
            </div>
          </div>
        ))}
      </div>}

      {modal&&<Modal title={editItem?"Editar chofer":"Nuevo chofer"} onClose={()=>{setModal(false);setEditItem(null);}} icon={Users} iconColor={A} wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="Nombre completo *" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Juan Pérez García"/>
          <Inp label="Teléfono * (10 dígitos)" value={form.tel} onChange={e=>setForm({...form,tel:e.target.value})} placeholder="5512345678"/>
          <Inp label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="juan@ejemplo.com"/>
          <Inp label="Licencia de conducir" value={form.licencia} onChange={e=>setForm({...form,licencia:e.target.value})} placeholder="Tipo B · Folio …"/>
          <Inp label="Placa asignada" value={form.placa} onChange={e=>setForm({...form,placa:e.target.value})} placeholder="ABC-123-D"/>
          <Sel label="Vehículo" value={form.vehiculo} onChange={e=>setForm({...form,vehiculo:e.target.value})} options={[{v:"eur",l:"Eurovan"},{v:"cam",l:"Camioneta 3.5T"},{v:"kra",l:"Krafter"}]}/>
          <Inp label="Contacto de emergencia" value={form.emergencia} onChange={e=>setForm({...form,emergencia:e.target.value})} placeholder="Nombre del contacto"/>
          <Inp label="Tel. emergencia" value={form.emergenciaTel} onChange={e=>setForm({...form,emergenciaTel:e.target.value})} placeholder="55…"/>
          <Sel label="Estado" value={form.status} onChange={e=>setForm({...form,status:e.target.value})} options={statuses}/>
          <Inp label="URL foto (opcional)" value={form.fotoURL} onChange={e=>setForm({...form,fotoURL:e.target.value})} placeholder="https://…"/>
          <div style={{gridColumn:"1/-1"}}><Txt label="Notas" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Observaciones, restricciones, etc."/></div>
          {editItem?.codigoAcceso&&<div style={{gridColumn:"1/-1",padding:"12px 16px",background:VIOLET+"08",borderRadius:10,border:"1.5px solid "+VIOLET+"20"}}>
            <div style={{fontSize:10,color:VIOLET,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Código de acceso app chofer</div>
            <div style={{fontFamily:MONO,fontWeight:800,fontSize:22,color:VIOLET,letterSpacing:"0.12em"}}>{editItem.codigoAcceso}</div>
            <div style={{fontSize:11,color:MUTED,marginTop:4}}>Comparte este código con el chofer para que inicie sesión en la app móvil</div>
          </div>}
          <button onClick={save} className="btn" style={{gridColumn:"1/-1",background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:15}}>
            {editItem?"Guardar cambios":"Crear chofer"}
          </button>
        </div>
      </Modal>}
    </div>
  );
}

/* ─── PROSPECCIÓN ────────────────────────────────────────────────────────── */
function Prospeccion(){
  const [items,setItems]=useState([]);
  const [load,setLoad]=useState(true);
  const [modal,setModal]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [toast,setToast]=useState(null);
  const [q,setQ]=useState("");
  const [statusF,setStatusF]=useState("todos");
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  const statuses=["Contacto inicial","En negociación","Propuesta enviada","Ganado","Perdido"];
  const sc={"Contacto inicial":MUTED,"En negociación":BLUE,"Propuesta enviada":AMBER,Ganado:GREEN,Perdido:ROSE};
  const empty={empresa:"",contacto:"",servicio:"",monto:"",mes:"May",anio:2026,probabilidad:50,status:"Contacto inicial",notas:""};
  const [form,setForm]=useState(empty);

  useEffect(()=>onSnapshot(collection(db,"prospeccion"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setLoad(false);
  }),[]);

  const openNew=()=>{setForm(empty);setEditItem(null);setModal(true);};
  const openEdit=p=>{setForm({empresa:p.empresa||"",contacto:p.contacto||"",servicio:p.servicio||"",monto:String(p.monto||""),mes:p.mes||"May",anio:p.anio||2026,probabilidad:p.probabilidad||50,status:p.status||"Contacto inicial",notas:p.notas||""});setEditItem(p);setModal(true);};

  const save=async()=>{
    if(!form.empresa.trim()){showT("La empresa es obligatoria","err");return;}
    const monto=parseFloat(form.monto)||0;
    const ivaAmt=monto*.16;
    const data={...form,monto,ivaAmt,total:monto+ivaAmt,probabilidad:Number(form.probabilidad)||0};
    try{
      if(editItem){await updateDoc(doc(db,"prospeccion",editItem.id),data);showT("✓ Prospecto actualizado");}
      else{await addDoc(collection(db,"prospeccion"),{...data,folio:"PROS-"+uid(),createdAt:serverTimestamp()});showT("✓ Prospecto creado");}
      setModal(false);setForm(empty);setEditItem(null);
    }catch(e){showT(e.message,"err");}
  };
  const del=async id=>{if(!confirm("¿Eliminar este prospecto?"))return;await deleteDoc(doc(db,"prospeccion",id));showT("Eliminado");};

  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const filt=items.filter(p=>(statusF==="todos"||p.status===statusF)&&(!q||(p.empresa||"").toLowerCase().includes(q.toLowerCase())||(p.contacto||"").toLowerCase().includes(q.toLowerCase())));
  const totPipeline=filt.reduce((a,p)=>a+(p.total||0),0);
  const totGanado=items.filter(p=>p.status==="Ganado").reduce((a,p)=>a+(p.total||0),0);
  const totNeg=items.filter(p=>p.status==="En negociación"||p.status==="Propuesta enviada").reduce((a,p)=>a+(p.total||0),0);
  const pipelinePonderado=items.filter(p=>p.status!=="Perdido"&&p.status!=="Ganado").reduce((a,p)=>a+((p.total||0)*(p.probabilidad||0)/100),0);

  // Pipeline counts
  const pipeline=statuses.filter(s=>s!=="Perdido").map(s=>({status:s,color:sc[s],count:items.filter(p=>p.status===s).length,total:items.filter(p=>p.status===s).reduce((a,p)=>a+(p.total||0),0)}));

  return(
    <div className="slide-in" style={{flex:1,overflowY:"auto",padding:"24px 28px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Prospección</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>Pipeline de ventas · Oportunidades de negocio · Seguimiento comercial</p>
        </div>
        <button onClick={openNew} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+VIOLET+",#a855f7)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+VIOLET+"30"}}><Plus size={14}/>Nuevo prospecto</button>
      </div>

      {/* Pipeline visual */}
      <div className="g4" style={{marginBottom:16}}>
        {pipeline.map(({status,color,count,total})=>(
          <div key={status} onClick={()=>setStatusF(statusF===status?"todos":status)} className="ch" style={{background:"#fff",border:"1.5px solid "+(statusF===status?color:BORDER),borderRadius:14,padding:"16px 18px",cursor:"pointer",transition:"all .15s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <Tag color={color}>{status}</Tag>
              <span style={{fontFamily:MONO,fontSize:18,fontWeight:800,color}}>{count}</span>
            </div>
            <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:TEXT}}>{fmtK(total)}</div>
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div className="g4" style={{marginBottom:16}}>
        <KpiCard icon={Target} color={VIOLET} label="Pipeline total" value={fmtK(totPipeline)} sub={filt.length+" prospectos"}/>
        <KpiCard icon={TrendingUp} color={GREEN} label="Ganados" value={fmtK(totGanado)}/>
        <KpiCard icon={Clock} color={BLUE} label="En negociación" value={fmtK(totNeg)}/>
        <KpiCard icon={Activity} color={AMBER} label="Ponderado" value={fmtK(pipelinePonderado)} sub="valor × probabilidad"/>
      </div>

      {/* Filters + search */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
        {["todos",...statuses].map(s=>(
          <button key={s} onClick={()=>setStatusF(s)} className="btn" style={{padding:"6px 14px",borderRadius:9,border:"1.5px solid "+(statusF===s?VIOLET:BD2),background:statusF===s?VIOLET+"10":"#fff",color:statusF===s?VIOLET:MUTED,fontSize:12,fontWeight:statusF===s?700:500}}>{s==="todos"?"Todos":s}</button>
        ))}
        <div style={{marginLeft:"auto",background:"#fff",border:"1px solid "+BORDER,borderRadius:10,padding:"7px 13px",display:"flex",alignItems:"center",gap:8,minWidth:220}}>
          <Search size={13} color={MUTED}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar empresa…" style={{background:"none",border:"none",fontSize:13,flex:1}}/>
        </div>
      </div>

      {/* Table */}
      {load?<SkeletonRows n={4}/>
      :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
        {filt.length===0?<EmptyState icon={Target} title="Sin prospectos" sub="Agrega oportunidades de negocio para dar seguimiento" action={openNew} actionLabel="Nuevo prospecto" color={VIOLET}/>
        :<div className="table-wrap"><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
          <thead><tr style={{borderBottom:"1px solid "+BORDER}}>
            {["Folio","Empresa","Contacto","Servicio","Mes","Monto","Total c/IVA","Prob.","Estado","Acciones"].map(h=>
              <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
            )}
          </tr></thead>
          <tbody>{filt.map(p=>(
            <tr key={p.id} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
              <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:10,color:MUTED}}>{p.folio||"—"}</td>
              <td style={{padding:"10px 12px",fontWeight:700,fontSize:13}}>{p.empresa||"—"}</td>
              <td style={{padding:"10px 12px",fontSize:12,color:MUTED}}>{p.contacto||"—"}</td>
              <td style={{padding:"10px 12px",fontSize:12,color:MUTED,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.servicio||"—"}</td>
              <td style={{padding:"10px 12px"}}><span style={{background:VIOLET+"12",color:VIOLET,borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700}}>{p.mes||"—"} {p.anio||""}</span></td>
              <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:12}}>{fmt(p.monto||0)}</td>
              <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:13,fontWeight:800}}>{fmt(p.total||0)}</td>
              <td style={{padding:"10px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <MiniBar pct={p.probabilidad||0} color={VIOLET} h={5}/>
                  <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:VIOLET}}>{p.probabilidad||0}%</span>
                </div>
              </td>
              <td style={{padding:"10px 12px"}}><Tag color={sc[p.status]||MUTED} sm>{p.status}</Tag></td>
              <td style={{padding:"10px 12px"}}>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>openEdit(p)} className="btn" style={{color:MUTED,padding:4}}><Eye size={13}/></button>
                  <button onClick={()=>del(p.id)} className="btn" style={{color:MUTED,padding:4}}><Trash2 size={12}/></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table></div>}
      </div>}

      {/* Modal */}
      {modal&&<Modal title={editItem?"Editar prospecto":"Nuevo prospecto"} onClose={()=>{setModal(false);setEditItem(null);}} icon={Target} iconColor={VIOLET} wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="Empresa *" value={form.empresa} onChange={e=>setForm({...form,empresa:e.target.value})} placeholder="Nombre de la empresa"/>
          <Inp label="Contacto" value={form.contacto} onChange={e=>setForm({...form,contacto:e.target.value})} placeholder="Persona de contacto"/>
          <div style={{gridColumn:"1/-1"}}><Inp label="Servicio / Descripción" value={form.servicio} onChange={e=>setForm({...form,servicio:e.target.value})} placeholder="Ej: Distribución masiva zona norte"/></div>
          <Inp label="Monto (sin IVA)" type="number" value={form.monto} onChange={e=>setForm({...form,monto:e.target.value})} placeholder="0.00"/>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Probabilidad de cierre</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="range" min="0" max="100" step="5" value={form.probabilidad} onChange={e=>setForm({...form,probabilidad:e.target.value})} style={{flex:1,accentColor:VIOLET}}/>
              <span style={{fontFamily:MONO,fontSize:16,fontWeight:800,color:VIOLET,minWidth:40,textAlign:"right"}}>{form.probabilidad}%</span>
            </div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Mes objetivo</div>
            <select value={form.mes} onChange={e=>setForm({...form,mes:e.target.value})} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {MESES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Estado</div>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {statuses.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {(parseFloat(form.monto)||0)>0&&<div style={{gridColumn:"1/-1",padding:"12px 16px",background:VIOLET+"08",borderRadius:12,border:"1.5px solid "+VIOLET+"20"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[["Monto",fmt(parseFloat(form.monto)||0),MUTED],["IVA 16%",fmt((parseFloat(form.monto)||0)*.16),MUTED],["Total",fmt((parseFloat(form.monto)||0)*1.16),VIOLET]].map(([l,v,c])=>(
                <div key={l}><div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:MONO,fontSize:18,fontWeight:800,color:c,marginTop:3}}>{v}</div></div>
              ))}
            </div>
          </div>}
          <div style={{gridColumn:"1/-1"}}><Txt label="Notas" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Contexto, próximos pasos, competencia…"/></div>
          <button onClick={save} className="btn" style={{gridColumn:"1/-1",background:"linear-gradient(135deg,"+VIOLET+",#a855f7)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:15}}>
            {editItem?"Guardar cambios":"Crear prospecto"}
          </button>
        </div>
      </Modal>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE TRACKING + APP DE CHOFER
   ═══════════════════════════════════════════════════════════════════════════ */

/* Helper: crear un alerta en Firestore */
async function postAlert(rutaId, choferId, choferNombre, type, msg, extra={}){
  try{
    await addDoc(collection(db,"alerts"),{rutaId,choferId,choferNombre,type,msg,read:false,createdAt:serverTimestamp(),...extra});
  }catch(e){console.warn("alert fail",e);}
}

/* ─── LIVE TRACKING (ADMIN) ──────────────────────────────────────────────── */
function LiveTracking(){
  const [driverLocs,setDriverLocs]=useState([]);
  const [rutas,setRutas]=useState([]);
  const [alerts,setAlerts]=useState([]);
  const [selected,setSelected]=useState(null);
  const mapRef=useRef(null);
  const mapCont=useRef(null);
  const markers=useRef({});
  const stopMarkers=useRef([]);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"driverLocations"),s=>setDriverLocs(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2=onSnapshot(collection(db,"rutas"),s=>setRutas(s.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.status==="En curso")));
    const u3=onSnapshot(collection(db,"alerts"),s=>setAlerts(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,50)));
    return()=>{u1();u2();u3();};
  },[]);

  // Init mapbox
  useEffect(()=>{
    if(!MAPBOX_TOKEN){return;}
    if(mapRef.current||!mapCont.current)return;
    mapRef.current = new mapboxgl.Map({
      container:mapCont.current,
      style:"mapbox://styles/mapbox/streets-v12",
      center:MX_CENTER,
      zoom:10,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(),"top-right");
    mapRef.current.on("load",()=>{
      // Fuente y capa para la ruta (línea azul estilo Uber)
      mapRef.current.addSource("route-line",{type:"geojson",data:{type:"Feature",geometry:{type:"LineString",coordinates:[]}}});
      mapRef.current.addLayer({id:"route-line-casing",type:"line",source:"route-line",paint:{"line-color":"#fff","line-width":8,"line-opacity":.85}});
      mapRef.current.addLayer({id:"route-line-layer",type:"line",source:"route-line",paint:{"line-color":BLUE,"line-width":5,"line-opacity":.95,"line-dasharray":[0.5,1.5]}});
    });
    return()=>{mapRef.current?.remove();mapRef.current=null;};
  },[]);

  // Render driver markers with rotation (heading)
  useEffect(()=>{
    if(!mapRef.current) return;
    const activeIds = driverLocs.filter(d=>d.lat&&d.lng&&Date.now()/1000-(d.ts?.seconds||0)<300).map(d=>d.id);
    Object.keys(markers.current).forEach(id=>{if(!activeIds.includes(id)){markers.current[id].remove();delete markers.current[id];}});
    driverLocs.forEach(d=>{
      if(!d.lat||!d.lng) return;
      const stale = Date.now()/1000-(d.ts?.seconds||0)>300;
      if(stale) return;
      if(markers.current[d.id]){
        markers.current[d.id].setLngLat([d.lng,d.lat]);
      }else{
        const el = document.createElement("div");
        el.style.cssText=`width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${A},#fb923c);border:3px solid #fff;box-shadow:0 4px 14px rgba(249,115,22,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px;font-family:${DISP};cursor:pointer;animation:pulse 2s ease infinite;`;
        el.textContent=(d.choferNombre||"?").slice(0,2).toUpperCase();
        const popup = new mapboxgl.Popup({offset:26,closeButton:false}).setHTML(`<div style="font-family:${SANS};padding:4px"><div style="font-weight:700;font-size:13px">${d.choferNombre||"Chofer"}</div><div style="font-size:11px;color:#607080">${d.rutaNombre||"—"}</div><div style="font-size:10px;color:#9db0c4;font-family:${MONO};margin-top:4px">${d.speed?Math.round(d.speed*3.6)+" km/h":"—"}</div></div>`);
        markers.current[d.id] = new mapboxgl.Marker(el).setLngLat([d.lng,d.lat]).setPopup(popup).addTo(mapRef.current);
        el.onclick=()=>setSelected(d);
      }
    });
    if(!selected && Object.keys(markers.current).length>0){
      const bounds = new mapboxgl.LngLatBounds();
      driverLocs.forEach(d=>{if(d.lat&&d.lng&&Date.now()/1000-(d.ts?.seconds||0)<300)bounds.extend([d.lng,d.lat]);});
      if(!bounds.isEmpty())mapRef.current.fitBounds(bounds,{padding:80,maxZoom:13,duration:500});
    }
  },[driverLocs,selected]);

  // Cuando hay chofer seleccionado: dibujar stops y línea al siguiente punto
  useEffect(()=>{
    if(!mapRef.current||!mapRef.current.isStyleLoaded()) return;
    // Limpia marcadores de stops previos
    stopMarkers.current.forEach(m=>m.remove());
    stopMarkers.current = [];
    const source = mapRef.current.getSource("route-line");
    if(!source) return;
    if(!selected){
      source.setData({type:"Feature",geometry:{type:"LineString",coordinates:[]}});
      return;
    }
    const ruta = rutas.find(r=>r.id===selected.rutaId);
    if(!ruta){source.setData({type:"Feature",geometry:{type:"LineString",coordinates:[]}});return;}
    const stopStates = (ruta.stopsStatus||[]).reduce((a,s)=>{a[s.idx]=s;return a;},{});
    const puntos=[];
    (ruta.stops||[]).forEach((s,ci)=>{
      (s.puntos||[]).forEach((p)=>{
        if(p.lat&&p.lng){
          const st=stopStates[ci];
          puntos.push({lng:p.lng,lat:p.lat,name:p.name,city:s.city,status:st?.status,isOrigin:s.isOrigin||p.isOrigin});
        }
      });
    });
    // Pinta markers de stops
    puntos.forEach((p,idx)=>{
      const color = p.status==="entregado"?GREEN:p.status==="llegue"?BLUE:p.status==="problema"?ROSE:p.isOrigin?MUTED:A;
      const el = document.createElement("div");
      el.style.cssText=`width:30px;height:30px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;font-family:${MONO};`;
      el.textContent=String(idx+1);
      const popup = new mapboxgl.Popup({offset:16,closeButton:false}).setHTML(`<div style="font-family:${SANS};padding:4px;max-width:200px"><div style="font-weight:700;font-size:12px">${p.name}</div><div style="font-size:10px;color:#607080">${p.city}</div></div>`);
      const m = new mapboxgl.Marker(el).setLngLat([p.lng,p.lat]).setPopup(popup).addTo(mapRef.current);
      stopMarkers.current.push(m);
    });
    // Línea del chofer al siguiente punto pendiente
    const siguiente = puntos.find(p=>!p.isOrigin&&p.status!=="entregado");
    if(siguiente&&selected.lat&&selected.lng){
      source.setData({type:"Feature",geometry:{type:"LineString",coordinates:[[selected.lng,selected.lat],[siguiente.lng,siguiente.lat]]}});
      // Fit bounds del chofer + siguiente punto
      const b = new mapboxgl.LngLatBounds();
      b.extend([selected.lng,selected.lat]);
      b.extend([siguiente.lng,siguiente.lat]);
      mapRef.current.fitBounds(b,{padding:140,maxZoom:15,duration:600});
    }else{
      source.setData({type:"Feature",geometry:{type:"LineString",coordinates:[]}});
    }
  },[selected,rutas,driverLocs]);

  const activos = driverLocs.filter(d=>d.lat&&d.lng&&Date.now()/1000-(d.ts?.seconds||0)<300);
  // Detecta choferes que llevan mucho tiempo sin moverse (posible problema)
  const sinSenal = driverLocs.filter(d=>d.lat&&d.lng&&Date.now()/1000-(d.ts?.seconds||0)>=300&&Date.now()/1000-(d.ts?.seconds||0)<1800);
  const parados = activos.filter(d=>(d.speed||0)<0.5); // menos de 1.8 km/h por 5+ min
  const rutaSeleccionada = selected?rutas.find(r=>r.id===selected.rutaId):null;

  return(
    <div className="slide-in" style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#f1f4fb"}}>
      <div className="au" style={{padding:"20px 28px 16px",borderBottom:"1px solid "+BORDER,background:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:26,color:TEXT,letterSpacing:"-0.03em",display:"flex",alignItems:"center",gap:10}}>
              <Radio size={22} color={GREEN} className={activos.length>0?"pulse":""}/>
              Live Tracking
            </h1>
            <p style={{color:MUTED,fontSize:12,marginTop:3}}>Ubicación en tiempo real · {activos.length} chofer{activos.length===1?"":"es"} activo{activos.length===1?"":"s"} · {rutas.length} ruta{rutas.length===1?"":"s"} en curso</p>
          </div>
          {(sinSenal.length>0||parados.length>0)&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {sinSenal.length>0&&<div style={{background:AMBER+"10",border:"1.5px solid "+AMBER+"40",borderRadius:9,padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}>
              <AlertCircle size={13} color={AMBER}/>
              <span style={{fontSize:11,fontWeight:700,color:AMBER}}>{sinSenal.length} sin señal</span>
            </div>}
            {parados.length>0&&<div style={{background:ROSE+"10",border:"1.5px solid "+ROSE+"40",borderRadius:9,padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}>
              <Clock size={13} color={ROSE}/>
              <span style={{fontSize:11,fontWeight:700,color:ROSE}}>{parados.length} detenidos</span>
            </div>}
          </div>}
        </div>
      </div>
      {!MAPBOX_TOKEN?<div style={{padding:40,textAlign:"center",color:ROSE}}><AlertCircle size={32}/><div style={{fontSize:14,marginTop:10}}>Falta configurar VITE_MAPBOX_TOKEN en .env</div></div>
      :<div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 360px",overflow:"hidden"}}>
        <div ref={mapCont} style={{width:"100%",height:"100%",position:"relative"}}/>
        <div style={{borderLeft:"1px solid "+BORDER,background:"#fff",overflowY:"auto",display:"flex",flexDirection:"column"}}>
          {/* Detalle del chofer seleccionado (estilo Uber) */}
          {selected&&<div style={{padding:"16px 18px",borderBottom:"2px solid "+BORDER,background:"linear-gradient(135deg,"+A+"08,#fff)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:800,color:A,textTransform:"uppercase",letterSpacing:"0.08em"}}>🔴 EN VIVO</div>
              <button onClick={()=>setSelected(null)} className="btn" style={{color:MUTED,fontSize:10,fontWeight:700}}>✕ Cerrar</button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <div style={{width:52,height:52,borderRadius:14,background:"linear-gradient(135deg,"+A+","+VIOLET+")",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:16,color:"#fff",flexShrink:0,boxShadow:"0 4px 14px "+A+"40"}}>{(selected.choferNombre||"?").slice(0,2).toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:DISP,fontWeight:800,fontSize:16}}>{selected.choferNombre}</div>
                <div style={{fontSize:11,color:MUTED,fontFamily:MONO}}>{selected.choferPlaca||"—"}</div>
                {selected.choferTel&&<a href={"tel:"+selected.choferTel} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:GREEN,textDecoration:"none",fontWeight:700,marginTop:3}}><Phone size={11}/>{selected.choferTel}</a>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
              <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:9,padding:"7px 9px",textAlign:"center"}}>
                <div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>Velocidad</div>
                <div style={{fontFamily:MONO,fontSize:14,fontWeight:800,color:A}}>{selected.speed?Math.round(selected.speed*3.6):0}<span style={{fontSize:9,color:MUTED}}> km/h</span></div>
              </div>
              <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:9,padding:"7px 9px",textAlign:"center"}}>
                <div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>Precisión</div>
                <div style={{fontFamily:MONO,fontSize:14,fontWeight:800,color:BLUE}}>{selected.accuracy?Math.round(selected.accuracy):0}<span style={{fontSize:9,color:MUTED}}> m</span></div>
              </div>
              <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:9,padding:"7px 9px",textAlign:"center"}}>
                <div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>Última señal</div>
                <div style={{fontFamily:MONO,fontSize:14,fontWeight:800,color:GREEN}}>{ago(selected.ts?.seconds)}</div>
              </div>
            </div>
            {rutaSeleccionada&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Ruta activa</div>
              <div style={{fontSize:13,fontWeight:700}}>{rutaSeleccionada.nombre}</div>
              {rutaSeleccionada.cliente&&<div style={{fontSize:11,color:MUTED,marginBottom:6}}>{rutaSeleccionada.cliente}</div>}
              <MiniBar pct={rutaSeleccionada.progreso||0} color={GREEN} h={5}/>
              <div style={{fontSize:10,color:MUTED,marginTop:4}}>{rutaSeleccionada.progreso||0}% completado</div>
            </div>}
          </div>}
          <div style={{padding:"14px 18px",borderBottom:"1px solid "+BORDER}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <Radio size={11} color={GREEN} className={activos.length>0?"pulse":""}/>
              Choferes activos ({activos.length})
            </div>
            {activos.length===0?<div style={{fontSize:12,color:MUTED,padding:"14px 0",textAlign:"center"}}>
              Ningún chofer transmitiendo GPS
              <div style={{fontSize:10,marginTop:4}}>Los choferes aparecen aquí al pulsar "Iniciar ruta"</div>
            </div>
            :activos.map(d=>(
              <button key={d.id} onClick={()=>{setSelected(d);mapRef.current?.flyTo({center:[d.lng,d.lat],zoom:14});}} className="btn fr" style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 6px",cursor:"pointer",background:selected?.id===d.id?A+"08":"transparent",textAlign:"left",borderRadius:8,border:selected?.id===d.id?"1.5px solid "+A+"30":"1.5px solid transparent"}}>
                <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,"+A+"22,"+VIOLET+"22)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:800,fontSize:11,color:A,flexShrink:0}}>{(d.choferNombre||"?").slice(0,2).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.choferNombre||"Chofer"}</div>
                  <div style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.rutaNombre||"Sin ruta"}</div>
                </div>
                <div className="pulse" style={{width:8,height:8,borderRadius:"50%",background:GREEN,boxShadow:"0 0 6px "+GREEN,flexShrink:0}}/>
              </button>
            ))}
          </div>
          <div style={{padding:"14px 18px",borderBottom:"1px solid "+BORDER,flex:1}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,display:"flex",alignItems:"center",gap:6}}><Bell size={11}/>Alertas recientes</div>
            {alerts.length===0?<div style={{fontSize:12,color:MUTED,padding:"14px 0",textAlign:"center"}}>Sin alertas</div>
            :alerts.slice(0,15).map(a=>{
              const c = a.type==="arrival"?GREEN:a.type==="delivered"?BLUE:a.type==="issue"?ROSE:MUTED;
              const ic = a.type==="arrival"?MapPin:a.type==="delivered"?CheckCircle:a.type==="issue"?AlertCircle:Bell;
              const I = ic;
              return(
                <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 0",borderBottom:"1px solid "+BORDER+"60"}}>
                  <div style={{width:26,height:26,borderRadius:7,background:c+"12",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><I size={11} color={c}/></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:TEXT}}>{a.choferNombre}</div>
                    <div style={{fontSize:11,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.msg}</div>
                  </div>
                  <span style={{fontSize:9,color:MUTED,fontFamily:MONO,flexShrink:0}}>{ago(a.createdAt?.seconds)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>}
    </div>
  );
}

/* ─── OPTIMIZACIÓN DE RUTAS (Mapbox Optimization API v1) ──────────────────── */
async function optimizeStops(stopsLngLat){
  // stopsLngLat: [[lng,lat], ...] — primero = origen
  if(!MAPBOX_TOKEN||stopsLngLat.length<3) return null;
  const coords = stopsLngLat.map(([lng,lat])=>`${lng},${lat}`).join(";");
  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?source=first&roundtrip=false&destination=last&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
  try{
    const res = await fetch(url);
    const d = await res.json();
    if(d.code!=="Ok") return null;
    // trips[0].waypoints has the reordered stops
    return {
      order: d.waypoints.map(w=>w.waypoint_index),
      distance: d.trips[0].distance, // metros
      duration: d.trips[0].duration, // segundos
      geometry: d.trips[0].geometry,
    };
  }catch(e){console.warn("optimize fail",e);return null;}
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP DEL CHOFER (PWA) — /chofer
   ═══════════════════════════════════════════════════════════════════════════ */
function ChoferApp(){
  const [chofer,setChofer]=useState(()=>{
    try{const s=localStorage.getItem("dmov_chofer");return s?JSON.parse(s):null;}catch(e){return null;}
  });
  const [toast,setToast]=useState(null);
  const showT=(m,t="ok")=>setToast({msg:m,type:t});

  // Marca body para dark mode automático en app chofer
  useEffect(()=>{
    document.body.classList.add("chofer-mode");
    return()=>document.body.classList.remove("chofer-mode");
  },[]);

  // Pide permiso de notificaciones al login (para alertas de nueva ruta)
  useEffect(()=>{
    if(chofer&&"Notification" in window&&Notification.permission==="default"){
      Notification.requestPermission().catch(()=>{});
    }
  },[chofer]);

  const logout=()=>{localStorage.removeItem("dmov_chofer");setChofer(null);};

  const login=async(tel,codigo)=>{
    try{
      const telNorm = tel.replace(/\D/g,"");
      const q = query(collection(db,"choferes"),where("tel","==",telNorm));
      const snap = await getDocs(q);
      if(snap.empty){showT("Teléfono no registrado","err");return false;}
      const match = snap.docs.find(d=>(d.data().codigoAcceso||"").toUpperCase()===codigo.toUpperCase().trim());
      if(!match){showT("Código incorrecto","err");return false;}
      const chof = {id:match.id,...match.data()};
      localStorage.setItem("dmov_chofer",JSON.stringify(chof));
      setChofer(chof);
      showT("✓ Bienvenido "+chof.nombre);
      return true;
    }catch(e){showT(e.message,"err");return false;}
  };

  if(!chofer) return <ChoferLogin onLogin={login} toast={toast} setToast={setToast}/>;
  return <ChoferDashboard chofer={chofer} onLogout={logout} showT={showT} toast={toast} setToast={setToast}/>;
}

function ChoferLogin({onLogin,toast,setToast}){
  const [tel,setTel]=useState("");
  const [codigo,setCodigo]=useState("");
  const [loading,setLoading]=useState(false);

  const handle=async()=>{
    if(!tel||!codigo){return;}
    setLoading(true);
    await onLogin(tel,codigo);
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1628,#1e293b)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:SANS}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="pi" style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:24,padding:32,boxShadow:"0 32px 80px rgba(0,0,0,.4)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:64,height:64,borderRadius:18,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:22,color:"#fff",margin:"0 auto 14px"}}>DM</div>
          <h1 style={{fontFamily:DISP,fontWeight:900,fontSize:26,color:TEXT,letterSpacing:"-0.02em"}}>DMvimiento</h1>
          <div style={{fontSize:11,color:MUTED,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginTop:3}}>App Chofer</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Teléfono</div>
            <div style={{position:"relative"}}>
              <Phone size={15} color={MUTED} style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}/>
              <input type="tel" value={tel} onChange={e=>setTel(e.target.value)} placeholder="5512345678" style={{width:"100%",padding:"14px 14px 14px 40px",fontSize:15,border:"1.5px solid "+BD2,borderRadius:12,fontFamily:SANS}}/>
            </div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Código de acceso</div>
            <div style={{position:"relative"}}>
              <Hash size={15} color={MUTED} style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}/>
              <input value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} style={{width:"100%",padding:"14px 14px 14px 40px",fontSize:16,fontFamily:MONO,fontWeight:800,letterSpacing:"0.15em",border:"1.5px solid "+BD2,borderRadius:12,textTransform:"uppercase"}}/>
            </div>
          </div>
          <button onClick={handle} disabled={loading||!tel||!codigo} className="btn" style={{marginTop:6,background:loading||!tel||!codigo?"#e0e0e0":"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"14px 0",fontFamily:DISP,fontWeight:700,fontSize:15,boxShadow:"0 6px 20px "+A+"30"}}>
            {loading?"Verificando…":"Ingresar"}
          </button>
          <div style={{fontSize:11,color:MUTED,textAlign:"center",marginTop:6,lineHeight:1.5}}>
            Pide a tu administrador el código de acceso de 6 caracteres
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoferDashboard({chofer,onLogout,showT,toast,setToast}){
  const [misRutas,setMisRutas]=useState([]);
  const [activeRuta,setActiveRuta]=useState(null);
  const [tracking,setTracking]=useState(false);
  const [justFinished,setJustFinished]=useState(null); // muestra celebración post-completar
  const watchIdRef = useRef(null);

  const prevRutaIdsRef = useRef(null);
  useEffect(()=>{
    const q = query(collection(db,"rutas"),where("choferId","==",chofer.id));
    return onSnapshot(q,s=>{
      const items = s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      // Detecta rutas nuevas asignadas (para notificación + vibración)
      const prevIds = prevRutaIdsRef.current;
      if(prevIds){
        const nuevas = items.filter(r=>!prevIds.has(r.id)&&r.status!=="Completada"&&r.status!=="Cancelada");
        nuevas.forEach(r=>{
          // Vibración del celular
          try{navigator.vibrate&&navigator.vibrate([180,90,180,90,250]);}catch(e){}
          // Notificación nativa del OS (si hay permiso)
          if("Notification" in window&&Notification.permission==="granted"){
            try{
              new Notification("📦 Nueva ruta asignada",{
                body: r.nombre + (r.cliente?" — "+r.cliente:""),
                icon: "/icon.svg",
                badge: "/icon.svg",
                vibrate: [180,90,180,90,250],
                tag: "new-route-"+r.id,
              });
            }catch(e){}
          }
          setToast({msg:"🚚 Nueva ruta: "+r.nombre,type:"ok"});
        });
      }
      prevRutaIdsRef.current = new Set(items.map(r=>r.id));
      setMisRutas(items);
      // auto-select active route if tracking
      if(tracking&&activeRuta){
        const upd = items.find(r=>r.id===activeRuta.id);
        if(upd) setActiveRuta(upd);
      }
    });
  },[chofer.id]);

  // Start/stop GPS tracking
  const startTracking = (ruta)=>{
    if(!("geolocation" in navigator)){showT("GPS no disponible en este dispositivo","err");return;}
    setActiveRuta(ruta);
    setTracking(true);
    // Update ruta status + chofer status = "En ruta"
    updateDoc(doc(db,"rutas",ruta.id),{status:"En curso",iniciadaEn:serverTimestamp()}).catch(()=>{});
    updateDoc(doc(db,"choferes",chofer.id),{status:"En ruta",rutaActivaId:ruta.id,rutaActivaNombre:ruta.nombre}).catch(()=>{});
    postAlert(ruta.id,chofer.id,chofer.nombre,"start","Inició la ruta: "+ruta.nombre);
    // Notifica al cliente que inició
    if(ruta.clienteTel&&ruta.clienteTel.replace(/\D/g,"").length===10){
      const trackUrl = `${window.location.origin}/track/${ruta.trackingId||ruta.id}`;
      const msg = `🚚 DMvimiento: ${chofer.nombre} inició la ruta "${ruta.nombre}". Sigue el recorrido en tiempo real: ${trackUrl}`;
      const waUrl = `https://wa.me/52${ruta.clienteTel.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`;
      setTimeout(()=>{if(confirm("¿Notificar al cliente que iniciaste la ruta por WhatsApp?"))window.open(waUrl,"_blank");},500);
    }
    // Start watch - sends GPS continuously
    // Geofence: construye bbox de tolerancia con buffer de 15km
    const geofence = buildRutaGeofence(ruta, 15);
    let lastGeofenceAlert = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos)=>{
        const {latitude:lat,longitude:lng,speed,heading,accuracy} = pos.coords;
        setDoc(doc(db,"driverLocations",chofer.id),{
          choferId:chofer.id,
          choferNombre:chofer.nombre,
          choferTel:chofer.tel,
          choferPlaca:chofer.placa||"",
          rutaId:ruta.id,
          rutaNombre:ruta.nombre,
          lat,lng,speed:speed||0,heading:heading||0,accuracy:accuracy||0,
          ts:serverTimestamp(),
        },{merge:true}).catch(()=>{});
        // Geofencing: si el chofer se sale de la zona autorizada, genera alerta
        // (máximo una alerta cada 5 minutos para no saturar)
        if(geofence&&!dentroBbox(lng,lat,geofence)){
          const now = Date.now();
          if(now-lastGeofenceAlert > 5*60*1000){
            lastGeofenceAlert = now;
            postAlert(ruta.id,chofer.id,chofer.nombre,"geofence","⚠️ Fuera de zona autorizada de ruta",{lat,lng}).catch(()=>{});
          }
        }
      },
      (err)=>{showT("Error GPS: "+err.message,"err");},
      {enableHighAccuracy:true,maximumAge:5000,timeout:30000}
    );
  };

  const stopTracking = async()=>{
    if(watchIdRef.current!==null){navigator.geolocation.clearWatch(watchIdRef.current);watchIdRef.current=null;}
    setTracking(false);
    if(activeRuta){
      const finished = activeRuta;
      await updateDoc(doc(db,"rutas",activeRuta.id),{status:"Completada",completadaEn:serverTimestamp(),progreso:100}).catch(()=>{});
      // Marcar chofer como Disponible de nuevo
      await updateDoc(doc(db,"choferes",chofer.id),{status:"Disponible",rutaActivaId:"",rutaActivaNombre:""}).catch(()=>{});
      await deleteDoc(doc(db,"driverLocations",chofer.id)).catch(()=>{});
      postAlert(activeRuta.id,chofer.id,chofer.nombre,"complete","Completó la ruta: "+activeRuta.nombre);
      // Notifica al cliente final
      if(activeRuta.clienteTel&&activeRuta.clienteTel.replace(/\D/g,"").length===10){
        const trackUrl = `${window.location.origin}/track/${activeRuta.trackingId||activeRuta.id}`;
        const msg = `🏁 DMvimiento: Ruta "${activeRuta.nombre}" completada con éxito. Ver detalles y evidencias: ${trackUrl}`;
        const waUrl = `https://wa.me/52${activeRuta.clienteTel.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`;
        setTimeout(()=>{if(confirm("¿Notificar al cliente que la ruta terminó?"))window.open(waUrl,"_blank");},500);
      }
      setActiveRuta(null);
      setJustFinished(finished); // dispara pantalla de celebración
    }
  };

  useEffect(()=>()=>{if(watchIdRef.current!==null)navigator.geolocation.clearWatch(watchIdRef.current);},[]);

  const [tabChofer,setTabChofer]=useState("hoy");
  const hoy = new Date().toISOString().slice(0,10);
  const rutasActivas = misRutas.filter(r=>r.status!=="Completada"&&r.status!=="Cancelada");
  const rutasCompletadas = misRutas.filter(r=>r.status==="Completada");
  const completadas = rutasCompletadas.length;

  // Completadas hoy (filtradas por día local)
  const rutasHoyCompl = rutasCompletadas.filter(r=>{
    const ts = r.completadaEn?.seconds;
    if(!ts) return false;
    const d = new Date(ts*1000);
    const ld = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    return ld===hoy;
  });

  // Agregados para vista "Hoy": todas las paradas de rutas activas consolidadas
  const paradasHoy = [];
  rutasActivas.forEach(r=>{
    const estados = (r.stopsStatus||[]).reduce((a,s)=>{a[s.idx]=s;return a;},{});
    (r.stops||[]).forEach((s,idx)=>{
      if(s.isOrigin) return;
      paradasHoy.push({
        rutaId: r.id,
        rutaNombre: r.nombre,
        cliente: r.cliente||"",
        city: s.city,
        pdv: s.pdv||0,
        puntos: s.puntos||[],
        status: estados[idx]?.status||"pendiente",
        idx,
      });
    });
  });
  const paradasPendientes = paradasHoy.filter(p=>p.status!=="entregado");
  const paradasEntregadas = paradasHoy.filter(p=>p.status==="entregado");
  const totalKmHoy = rutasActivas.reduce((a,r)=>a+(r.totalKm||0),0);
  const totalPDVHoy = paradasHoy.reduce((a,p)=>a+p.pdv,0);

  // Elige la próxima ruta pendiente (útil cuando termina una)
  const siguienteRuta = rutasActivas.find(r=>r.status!=="En curso")||rutasActivas[0]||null;

  return(
    <div style={{minHeight:"100vh",background:"#f1f4fb",fontFamily:SANS}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {/* Header */}
      <div style={{background:"#0a1628",color:"#fff",padding:"18px 20px",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:14,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:15,flexShrink:0}}>{(chofer.nombre||"?").slice(0,2).toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:DISP,fontWeight:800,fontSize:16}}>{chofer.nombre}</div>
            <div style={{fontSize:11,color:"#ffffff70",display:"flex",alignItems:"center",gap:8}}>
              {tracking&&<span className="pulse" style={{display:"flex",alignItems:"center",gap:4,color:GREEN,fontWeight:700}}><Radio size={10}/>EN VIVO</span>}
              <span>{chofer.placa||"Sin placa"}</span>
            </div>
          </div>
          <button onClick={onLogout} className="btn" style={{color:"#fff",background:"rgba(255,255,255,.1)",borderRadius:10,padding:"8px 10px",display:"flex",alignItems:"center",gap:5,fontSize:11}}><LogOut size={13}/></button>
        </div>
      </div>

      {/* Pantalla de celebración: "¡Ruta completada!" con CTAs */}
      {justFinished&&!activeRuta&&<ChoferRutaCompletada ruta={justFinished} siguienteRuta={siguienteRuta} onIniciarSiguiente={()=>{setJustFinished(null);if(siguienteRuta)startTracking(siguienteRuta);}} onDescansar={()=>{setJustFinished(null);setTabChofer("historial");}} onVolverHoy={()=>{setJustFinished(null);setTabChofer("hoy");}}/>}

      {/* Active route view */}
      {activeRuta?<ChoferRutaActiva ruta={activeRuta} chofer={chofer} tracking={tracking} onStop={stopTracking} showT={showT}/>
      :!justFinished&&<div style={{padding:"18px 16px"}}>
        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={{background:"#fff",borderRadius:14,padding:"14px 16px",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Pendientes hoy</div>
            <div style={{fontFamily:MONO,fontSize:28,fontWeight:800,color:A}}>{paradasPendientes.length}</div>
            <div style={{fontSize:10,color:MUTED,marginTop:2}}>{rutasActivas.length} ruta{rutasActivas.length===1?"":"s"}</div>
          </div>
          <div style={{background:"#fff",borderRadius:14,padding:"14px 16px",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Rutas hoy ✓</div>
            <div style={{fontFamily:MONO,fontSize:28,fontWeight:800,color:GREEN}}>{rutasHoyCompl.length}</div>
            <div style={{fontSize:10,color:MUTED,marginTop:2}}>{completadas} totales</div>
          </div>
        </div>

        {/* Tabs: Hoy · Rutas · Gastos · Historial · Perfil */}
        <div style={{display:"flex",gap:2,marginBottom:12,background:"#fff",padding:3,borderRadius:12,boxShadow:"0 1px 4px rgba(12,24,41,.04)",overflowX:"auto"}}>
          <button onClick={()=>setTabChofer("hoy")} className="btn" style={{flex:"1 0 auto",padding:"9px 8px",borderRadius:9,background:tabChofer==="hoy"?BLUE:"transparent",color:tabChofer==="hoy"?"#fff":MUTED,fontWeight:700,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",gap:3,whiteSpace:"nowrap"}}>
            <Calendar size={10}/>Hoy ({paradasPendientes.length})
          </button>
          <button onClick={()=>setTabChofer("activas")} className="btn" style={{flex:"1 0 auto",padding:"9px 8px",borderRadius:9,background:tabChofer==="activas"?A:"transparent",color:tabChofer==="activas"?"#fff":MUTED,fontWeight:700,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",gap:3,whiteSpace:"nowrap"}}>
            <Play size={10}/>Rutas ({rutasActivas.length})
          </button>
          <button onClick={()=>setTabChofer("gastos")} className="btn" style={{flex:"1 0 auto",padding:"9px 8px",borderRadius:9,background:tabChofer==="gastos"?AMBER:"transparent",color:tabChofer==="gastos"?"#fff":MUTED,fontWeight:700,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",gap:3,whiteSpace:"nowrap"}}>
            <DollarSign size={10}/>Gastos
          </button>
          <button onClick={()=>setTabChofer("historial")} className="btn" style={{flex:"1 0 auto",padding:"9px 8px",borderRadius:9,background:tabChofer==="historial"?GREEN:"transparent",color:tabChofer==="historial"?"#fff":MUTED,fontWeight:700,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",gap:3,whiteSpace:"nowrap"}}>
            <CheckCircle size={10}/>Historial ({rutasCompletadas.length})
          </button>
          <button onClick={()=>setTabChofer("perfil")} className="btn" style={{flex:"1 0 auto",padding:"9px 8px",borderRadius:9,background:tabChofer==="perfil"?VIOLET:"transparent",color:tabChofer==="perfil"?"#fff":MUTED,fontWeight:700,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",gap:3,whiteSpace:"nowrap"}}>
            <Shield size={10}/>Perfil
          </button>
        </div>

        {/* TAB: HOY — vista consolidada de todas las entregas del día */}
        {tabChofer==="hoy"&&(paradasHoy.length===0?<div style={{background:"#fff",borderRadius:14,padding:32,textAlign:"center",color:MUTED,fontSize:13,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
          <Calendar size={32} color={BD2} style={{marginBottom:8}}/>
          <div style={{fontWeight:700,color:TEXT,fontSize:14,marginBottom:3}}>No tienes entregas hoy</div>
          <div style={{fontSize:11,marginTop:4}}>Cuando admin te asigne una ruta aparecerá aquí automáticamente</div>
        </div>
        :<>
          {/* Resumen del día */}
          <div style={{background:"linear-gradient(135deg,"+BLUE+","+VIOLET+")",borderRadius:14,padding:16,marginBottom:12,color:"#fff",boxShadow:"0 4px 16px "+BLUE+"30"}}>
            <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",opacity:.75,marginBottom:10}}>📅 Tu día hoy · {new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              <div>
                <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,lineHeight:1}}>{paradasPendientes.length}</div>
                <div style={{fontSize:10,opacity:.85,marginTop:3}}>Por entregar</div>
              </div>
              <div>
                <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,lineHeight:1}}>{paradasEntregadas.length}</div>
                <div style={{fontSize:10,opacity:.85,marginTop:3}}>Entregadas</div>
              </div>
              <div>
                <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,lineHeight:1}}>{totalPDVHoy.toLocaleString()}</div>
                <div style={{fontSize:10,opacity:.85,marginTop:3}}>PDVs totales</div>
              </div>
            </div>
            {totalKmHoy>0&&<div style={{fontSize:11,marginTop:12,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.2)",opacity:.9,display:"flex",alignItems:"center",gap:6}}>
              <Globe size={11}/>{totalKmHoy.toLocaleString()} km totales · {rutasActivas.length} ruta{rutasActivas.length===1?"":"s"} asignada{rutasActivas.length===1?"":"s"}
            </div>}
          </div>

          {/* Agrupa por ruta para que se vea claro qué entregas son de cuál ruta */}
          {rutasActivas.map(r=>{
            const estados = (r.stopsStatus||[]).reduce((a,s)=>{a[s.idx]=s;return a;},{});
            const stopsEntrega = (r.stops||[]).map((s,idx)=>({...s,idx,status:estados[idx]?.status||"pendiente"})).filter(s=>!s.isOrigin);
            const pendCount = stopsEntrega.filter(s=>s.status!=="entregado").length;
            const sc={Programada:VIOLET,"En curso":BLUE,Completada:GREEN};
            const rc = sc[r.status]||MUTED;
            return(
              <div key={r.id} style={{background:"#fff",borderRadius:14,marginBottom:10,boxShadow:"0 1px 4px rgba(12,24,41,.04)",overflow:"hidden",border:"1px solid "+BORDER}}>
                {/* Header de la ruta */}
                <div style={{padding:"12px 14px",background:rc+"08",borderBottom:"1px solid "+rc+"15",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:30,height:30,borderRadius:9,background:rc+"18",display:"flex",alignItems:"center",justifyContent:"center"}}><Navigation size={14} color={rc}/></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:800,fontSize:13,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.nombre}</div>
                    {r.cliente&&<div style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.cliente} · {pendCount} por entregar</div>}
                  </div>
                  <Tag color={rc} sm>{r.status||"Programada"}</Tag>
                </div>
                {/* Lista de paradas con status */}
                <div style={{padding:"4px 0"}}>
                  {stopsEntrega.map((s,i)=>{
                    const c = s.status==="entregado"?GREEN:s.status==="llegue"?BLUE:s.status==="problema"?ROSE:A;
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<stopsEntrega.length-1?"1px solid "+BORDER+"80":"none"}}>
                        <div style={{width:26,height:26,borderRadius:"50%",background:c+"14",border:"2px solid "+c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:c,flexShrink:0}}>{i+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.city}</div>
                          <div style={{fontSize:10,color:MUTED}}>
                            {s.pdv>0?s.pdv+" PDVs":""}{s.puntos?.length>0?" · "+s.puntos.length+" punto"+(s.puntos.length===1?"":"s"):""}
                          </div>
                        </div>
                        <Tag color={c} sm>{s.status==="entregado"?"✓":s.status==="llegue"?"En sitio":s.status==="problema"?"⚠":"Pendiente"}</Tag>
                      </div>
                    );
                  })}
                </div>
                {/* Acción de la ruta */}
                <div style={{padding:"10px 14px",borderTop:"1px solid "+BORDER,background:"#fafbfd"}}>
                  <button onClick={()=>startTracking(r)} className="btn" style={{width:"100%",padding:"10px 0",borderRadius:10,background:r.status==="En curso"?"linear-gradient(135deg,"+BLUE+",#3b82f6)":"linear-gradient(135deg,"+GREEN+",#10b981)",color:"#fff",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    {r.status==="En curso"?<><Navigation size={14}/>Continuar ruta</>:<><Play size={14}/>Iniciar ruta</>}
                  </button>
                </div>
              </div>
            );
          })}
        </>)}

        {tabChofer==="activas"&&(rutasActivas.length===0?<div style={{background:"#fff",borderRadius:14,padding:32,textAlign:"center",color:MUTED,fontSize:13,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
          <Package size={32} color={BD2} style={{marginBottom:8}}/>
          <div>No tienes rutas asignadas</div>
          <div style={{fontSize:11,marginTop:4}}>Contacta a administración</div>
        </div>
        :rutasActivas.map(r=>{
          const sc={Programada:VIOLET,"En curso":BLUE,Completada:GREEN};
          const c = sc[r.status]||MUTED;
          return(
            <div key={r.id} className="ch" style={{background:"#fff",borderRadius:14,padding:16,marginBottom:10,boxShadow:"0 1px 4px rgba(12,24,41,.04)",border:"1px solid "+BORDER}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontWeight:700,fontSize:15}}>{r.nombre}</div>
                <Tag color={c} sm>{r.status||"Programada"}</Tag>
              </div>
              {r.cliente&&<div style={{fontSize:12,color:MUTED,marginBottom:8}}>{r.cliente}</div>}
              <div style={{display:"flex",gap:12,fontSize:11,color:MUTED,marginBottom:12}}>
                <span><MapPin size={11} style={{display:"inline",marginRight:3,verticalAlign:"text-bottom"}}/>{(r.stops||[]).length} paradas</span>
                <span><Package size={11} style={{display:"inline",marginRight:3,verticalAlign:"text-bottom"}}/>{(r.totalPDV||0).toLocaleString()} PDVs</span>
                {r.totalKm>0&&<span><Globe size={11} style={{display:"inline",marginRight:3,verticalAlign:"text-bottom"}}/>{r.totalKm.toLocaleString()} km</span>}
              </div>
              <button onClick={()=>startTracking(r)} className="btn" style={{width:"100%",background:"linear-gradient(135deg,"+(r.status==="En curso"?BLUE:GREEN)+","+(r.status==="En curso"?"#3b82f6":"#10b981")+")",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 16px "+(r.status==="En curso"?BLUE:GREEN)+"30"}}>
                {r.status==="En curso"?<><Navigation size={15}/>Continuar ruta</>:<><Play size={15}/>Iniciar ruta</>}
              </button>
            </div>
          );
        }))}

        {tabChofer==="historial"&&(rutasCompletadas.length===0?<div style={{background:"#fff",borderRadius:14,padding:32,textAlign:"center",color:MUTED,fontSize:13,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
          <CheckCircle size={32} color={BD2} style={{marginBottom:8}}/>
          <div>Sin rutas completadas</div>
        </div>
        :rutasCompletadas.map(r=>{
          const done = (r.stopsStatus||[]).filter(s=>s.status==="entregado").length;
          const fecha = r.completadaEn?.seconds?new Date(r.completadaEn.seconds*1000).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"}):"—";
          return(
            <div key={r.id} style={{background:"#fff",borderRadius:14,padding:14,marginBottom:10,boxShadow:"0 1px 4px rgba(12,24,41,.04)",border:"1px solid "+GREEN+"20"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontWeight:700,fontSize:14}}>{r.nombre}</div>
                <Tag color={GREEN} sm>✓ Completada</Tag>
              </div>
              {r.cliente&&<div style={{fontSize:11,color:MUTED,marginBottom:6}}>{r.cliente}</div>}
              <div style={{display:"flex",gap:12,fontSize:11,color:MUTED}}>
                <span><Calendar size={10} style={{display:"inline",marginRight:3,verticalAlign:"text-bottom"}}/>{fecha}</span>
                <span><CheckCircle size={10} style={{display:"inline",marginRight:3,verticalAlign:"text-bottom"}}/>{done} entregas</span>
              </div>
            </div>
          );
        }))}

        {/* TAB: GASTOS — combustible/casetas con foto ticket */}
        {tabChofer==="gastos"&&<ChoferGastos chofer={chofer} showT={showT}/>}

        {/* TAB: PERFIL — stats históricas del chofer */}
        {tabChofer==="perfil"&&<ChoferPerfil chofer={chofer} misRutas={misRutas} rutasCompletadas={rutasCompletadas} onLogout={onLogout}/>}
      </div>}
    </div>
  );
}

/* ChoferGastos — registro de combustible, casetas, viáticos con foto del ticket */
const GASTO_TIPOS = [
  {id:"gasolina", label:"Gasolina",  emoji:"⛽", color:"#f97316"},
  {id:"caseta",   label:"Caseta",    emoji:"🛣️", color:"#2563eb"},
  {id:"comida",   label:"Comida",    emoji:"🍽️", color:"#059669"},
  {id:"hotel",    label:"Hotel",     emoji:"🏨", color:"#7c3aed"},
  {id:"estacionamiento",label:"Estacion.",emoji:"🅿️",color:"#0891b2"},
  {id:"mantenimiento",label:"Taller",emoji:"🔧", color:"#d97706"},
  {id:"otro",     label:"Otro",      emoji:"📋", color:"#607080"},
];
function ChoferGastos({chofer,showT}){
  const [gastos,setGastos]=useState([]);
  const [loadG,setLoadG]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [tipo,setTipo]=useState("gasolina");
  const [monto,setMonto]=useState("");
  const [nota,setNota]=useState("");
  const [fotoFile,setFotoFile]=useState(null);
  const [fotoPreview,setFotoPreview]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    const q = query(collection(db,"gastosChofer"),where("choferId","==",chofer.id));
    return onSnapshot(q,s=>{
      setGastos(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.fechaTs?.seconds||0)-(a.fechaTs?.seconds||0)));
      setLoadG(false);
    });
  },[chofer.id]);

  const pickPhoto=(e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    setFotoFile(f);
    const r = new FileReader();
    r.onload = ev=>setFotoPreview(ev.target.result);
    r.readAsDataURL(f);
  };

  const resetForm=()=>{setTipo("gasolina");setMonto("");setNota("");setFotoFile(null);setFotoPreview("");setShowForm(false);};

  const handleSave = async()=>{
    const amount = parseFloat(monto);
    if(!amount||amount<=0){showT("Monto inválido","err");return;}
    setSaving(true);
    try{
      let ticketURL="";
      if(fotoFile){
        try{ticketURL = await uploadEvidencia(fotoFile);}catch(e){}
      }
      await addDoc(collection(db,"gastosChofer"),{
        choferId:chofer.id,
        choferNombre:chofer.nombre,
        choferTel:chofer.tel||"",
        tipo,
        monto:amount,
        nota:nota||"",
        ticketURL,
        fechaTs:serverTimestamp(),
        estado:"pendiente", // pendiente | reembolsado | rechazado (admin lo cambia)
        createdAt:serverTimestamp(),
      });
      showT("✓ Gasto registrado");
      resetForm();
    }catch(e){showT(e.message,"err");}
    setSaving(false);
  };

  const hoyStr = new Date().toISOString().slice(0,10);
  const gastosHoy = gastos.filter(g=>{
    const ts = g.fechaTs?.seconds;
    if(!ts) return false;
    return new Date(ts*1000).toISOString().slice(0,10)===hoyStr;
  });
  const totalHoy = gastosHoy.reduce((a,g)=>a+(g.monto||0),0);
  const totalMes = gastos.filter(g=>{
    const ts = g.fechaTs?.seconds;
    if(!ts) return false;
    const d = new Date(ts*1000);
    const now = new Date();
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }).reduce((a,g)=>a+(g.monto||0),0);
  const pendientes = gastos.filter(g=>g.estado==="pendiente").length;
  const pendientesMonto = gastos.filter(g=>g.estado==="pendiente").reduce((a,g)=>a+(g.monto||0),0);

  return(
    <>
      {/* Resumen */}
      <div style={{background:"linear-gradient(135deg,"+AMBER+",#f59e0b)",borderRadius:14,padding:16,marginBottom:12,color:"#fff",boxShadow:"0 4px 16px "+AMBER+"30"}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",opacity:.85,marginBottom:8}}>💰 Resumen</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div>
            <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,lineHeight:1}}>{fmt(totalHoy)}</div>
            <div style={{fontSize:10,opacity:.85,marginTop:3}}>Hoy · {gastosHoy.length} gastos</div>
          </div>
          <div>
            <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,lineHeight:1}}>{fmt(totalMes)}</div>
            <div style={{fontSize:10,opacity:.85,marginTop:3}}>Este mes</div>
          </div>
        </div>
        {pendientes>0&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.2)",fontSize:11}}>
          ⏳ {pendientes} pendiente{pendientes===1?"":"s"} de reembolso · {fmt(pendientesMonto)}
        </div>}
      </div>

      {/* Botón agregar */}
      {!showForm&&<button onClick={()=>setShowForm(true)} className="btn" style={{width:"100%",padding:"14px 0",borderRadius:12,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",fontFamily:DISP,fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7,boxShadow:"0 4px 16px "+A+"30",marginBottom:12}}>
        <Plus size={15}/>Registrar gasto nuevo
      </button>}

      {/* Form nuevo gasto */}
      {showForm&&<div style={{background:"#fff",borderRadius:14,padding:14,marginBottom:12,boxShadow:"0 4px 14px rgba(12,24,41,.08)",border:"1.5px solid "+A+"40"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontFamily:DISP,fontWeight:800,fontSize:14,color:TEXT}}>Nuevo gasto</div>
          <button onClick={resetForm} className="btn" style={{color:MUTED,padding:4}}><X size={14}/></button>
        </div>
        {/* Tipos */}
        <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Tipo</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:12}}>
          {GASTO_TIPOS.map(t=>(
            <button key={t.id} type="button" onClick={()=>setTipo(t.id)} className="btn" style={{padding:"8px 4px",borderRadius:9,border:"1.5px solid "+(tipo===t.id?t.color:BD2),background:tipo===t.id?t.color+"12":"#fff",color:tipo===t.id?t.color:TEXT,fontWeight:700,fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:18}}>{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
        {/* Monto */}
        <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Monto (MXN) *</div>
        <div style={{position:"relative",marginBottom:12}}>
          <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:MUTED,fontFamily:MONO,fontSize:16,fontWeight:700}}>$</span>
          <input type="number" inputMode="decimal" value={monto} onChange={e=>setMonto(e.target.value)} placeholder="0.00" style={{width:"100%",paddingLeft:28,paddingRight:13,paddingTop:12,paddingBottom:12,background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,fontFamily:MONO,fontSize:18,fontWeight:800,color:A}}/>
        </div>
        {/* Nota */}
        <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Nota (opcional)</div>
        <input value={nota} onChange={e=>setNota(e.target.value)} placeholder="Ej: Caseta México-Puebla" style={{width:"100%",padding:"10px 13px",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,fontSize:13,marginBottom:12}}/>
        {/* Ticket */}
        <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Foto del ticket</div>
        {fotoPreview?<div style={{position:"relative",borderRadius:10,overflow:"hidden",border:"1.5px solid "+BD2,marginBottom:12}}>
          <img src={fotoPreview} style={{width:"100%",maxHeight:200,objectFit:"cover",display:"block"}}/>
          <button onClick={()=>{setFotoFile(null);setFotoPreview("");}} className="btn" style={{position:"absolute",top:6,right:6,background:"rgba(12,24,41,.7)",color:"#fff",borderRadius:"50%",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center"}}><X size={13}/></button>
        </div>
        :<label htmlFor="gasto-foto" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"16px 10px",background:AMBER+"08",border:"2px dashed "+AMBER+"40",borderRadius:10,cursor:"pointer",color:AMBER,fontWeight:700,fontSize:12,marginBottom:12}}>
          <Camera size={15}/>Tomar foto ticket
          <input id="gasto-foto" type="file" accept="image/*" capture="environment" onChange={pickPhoto} style={{display:"none"}}/>
        </label>}
        <button onClick={handleSave} disabled={saving||!monto||parseFloat(monto)<=0} className="btn" style={{width:"100%",padding:"12px 0",borderRadius:11,background:!monto||parseFloat(monto)<=0?"#e0e0e0":"linear-gradient(135deg,"+GREEN+",#10b981)",color:"#fff",fontFamily:DISP,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          {saving?<><div className="spin" style={{width:14,height:14,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}}/>Guardando…</>:<><Check size={14}/>Registrar gasto</>}
        </button>
      </div>}

      {/* Lista de gastos */}
      {loadG&&<SkeletonRows n={3}/>}
      {!loadG&&gastos.length===0&&!showForm&&<div style={{background:"#fff",borderRadius:14,padding:32,textAlign:"center",color:MUTED,fontSize:13,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
        <DollarSign size={32} color={BD2} style={{marginBottom:8}}/>
        <div style={{fontWeight:700,color:TEXT,fontSize:14,marginBottom:3}}>Sin gastos registrados</div>
        <div style={{fontSize:11,marginTop:4}}>Registra combustible, casetas, etc.</div>
      </div>}
      {gastos.map(g=>{
        const t = GASTO_TIPOS.find(x=>x.id===g.tipo)||GASTO_TIPOS[GASTO_TIPOS.length-1];
        const fecha = g.fechaTs?.seconds?new Date(g.fechaTs.seconds*1000).toLocaleDateString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—";
        const estadoColor = g.estado==="reembolsado"?GREEN:g.estado==="rechazado"?ROSE:AMBER;
        const estadoLabel = g.estado==="reembolsado"?"✓ Reembolsado":g.estado==="rechazado"?"✕ Rechazado":"⏳ Pendiente";
        return(
          <div key={g.id} style={{background:"#fff",borderRadius:14,padding:12,marginBottom:8,boxShadow:"0 1px 4px rgba(12,24,41,.04)",display:"flex",alignItems:"center",gap:11,border:"1px solid "+BORDER}}>
            <div style={{width:40,height:40,borderRadius:10,background:t.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{t.emoji}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
                <div style={{fontWeight:700,fontSize:13,color:TEXT}}>{t.label}</div>
                <div style={{fontFamily:MONO,fontSize:15,fontWeight:900,color:t.color}}>{fmt(g.monto)}</div>
              </div>
              {g.nota&&<div style={{fontSize:11,color:MUTED,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.nota}</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4,gap:6}}>
                <div style={{fontSize:10,color:MUTED}}>{fecha}</div>
                <Tag color={estadoColor} sm>{estadoLabel}</Tag>
              </div>
            </div>
            {g.ticketURL&&<img src={g.ticketURL} alt="ticket" style={{width:40,height:40,borderRadius:8,objectFit:"cover",flexShrink:0,cursor:"pointer"}} onClick={()=>{const w=window.open();w.document.write(`<img src="${g.ticketURL}" style="max-width:100%"/>`);}}/>}
          </div>
        );
      })}
    </>
  );
}

/* Perfil del chofer — stats totales + checkin/checkout + datos + logout */
function ChoferPerfil({chofer,misRutas,rutasCompletadas,onLogout}){
  // Checkin/Checkout — jornadas del chofer (horas trabajadas)
  const [jornadaActiva,setJornadaActiva]=useState(null);
  const [jornadasHoy,setJornadasHoy]=useState([]);
  const hoyStr = new Date().toISOString().slice(0,10);
  useEffect(()=>{
    const q = query(collection(db,"jornadas"),where("choferId","==",chofer.id));
    return onSnapshot(q,s=>{
      const items = s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.inTs?.seconds||0)-(a.inTs?.seconds||0));
      const activa = items.find(j=>!j.outTs);
      setJornadaActiva(activa||null);
      const today = items.filter(j=>{
        const ts = j.inTs?.seconds;
        if(!ts) return false;
        const d = new Date(ts*1000);
        return d.toISOString().slice(0,10)===hoyStr;
      });
      setJornadasHoy(today);
    });
  },[chofer.id]);
  const checkin = async()=>{
    if(jornadaActiva){return;}
    await addDoc(collection(db,"jornadas"),{choferId:chofer.id,choferNombre:chofer.nombre,choferTel:chofer.tel||"",inTs:serverTimestamp(),outTs:null,fechaStr:hoyStr,createdAt:serverTimestamp()});
  };
  const checkout = async()=>{
    if(!jornadaActiva) return;
    if(!confirm("¿Cerrar jornada?")) return;
    await updateDoc(doc(db,"jornadas",jornadaActiva.id),{outTs:serverTimestamp()});
  };
  const horasHoy = jornadasHoy.reduce((a,j)=>{
    const inT = j.inTs?.seconds, outT = j.outTs?.seconds||Date.now()/1000;
    if(inT) return a+(outT-inT)/3600;
    return a;
  },0);

  // Recálculo de stats históricas
  const totalEntregas = rutasCompletadas.reduce((a,r)=>a+((r.stopsStatus||[]).filter(s=>s.status==="entregado").length),0);
  const totalKm = rutasCompletadas.reduce((a,r)=>a+(r.totalKm||0),0);
  const totalHoras = rutasCompletadas.reduce((a,r)=>{
    const ini = r.iniciadaEn?.seconds, fin = r.completadaEn?.seconds;
    if(ini&&fin) return a+(fin-ini)/3600;
    return a;
  },0);
  // Mejor día
  const byDay = {};
  rutasCompletadas.forEach(r=>{
    const ts = r.completadaEn?.seconds;
    if(!ts) return;
    const d = new Date(ts*1000);
    const ld = d.toISOString().slice(0,10);
    const e = (r.stopsStatus||[]).filter(s=>s.status==="entregado").length;
    byDay[ld] = (byDay[ld]||0)+e;
  });
  const mejorDia = Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];
  // Porcentaje de entregas completadas (vs problemas)
  const problemas = rutasCompletadas.reduce((a,r)=>a+((r.stopsStatus||[]).filter(s=>s.status==="problema").length),0);
  const successRate = (totalEntregas+problemas)>0?Math.round(totalEntregas/(totalEntregas+problemas)*100):100;
  const primeraFecha = rutasCompletadas.reduce((a,r)=>{const ts=r.completadaEn?.seconds;if(!ts) return a;return a===null||ts<a?ts:a;},null);
  const antiguedadDias = primeraFecha?Math.floor((Date.now()/1000-primeraFecha)/86400):0;

  return(
    <>
      {/* Avatar + datos */}
      <div style={{background:"linear-gradient(135deg,"+VIOLET+",#9d5cff)",borderRadius:16,padding:"22px 18px",marginBottom:14,color:"#fff",display:"flex",alignItems:"center",gap:14,boxShadow:"0 6px 20px "+VIOLET+"40"}}>
        <div style={{width:58,height:58,borderRadius:18,background:"rgba(255,255,255,.22)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:22,flexShrink:0}}>{(chofer.nombre||"?").slice(0,2).toUpperCase()}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:DISP,fontWeight:800,fontSize:18,lineHeight:1.2}}>{chofer.nombre}</div>
          <div style={{fontSize:11,opacity:.85,marginTop:3}}>{chofer.tel}</div>
          <div style={{fontSize:11,opacity:.85}}>{chofer.placa||"Sin placa"}{chofer.vehiculo?" · "+chofer.vehiculo:""}</div>
          {antiguedadDias>0&&<div style={{fontSize:10,marginTop:4,opacity:.75}}>{antiguedadDias} días activo en DMvimiento</div>}
        </div>
      </div>

      {/* Checkin / Checkout de jornada */}
      <div style={{background:"#fff",borderRadius:14,padding:14,marginBottom:14,boxShadow:"0 1px 4px rgba(12,24,41,.04)",border:jornadaActiva?"2px solid "+GREEN+"45":"1px solid "+BORDER}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase"}}>⏰ Jornada laboral</div>
          {jornadaActiva&&<Tag color={GREEN} sm><span className="pulse">● </span>ACTIVA</Tag>}
        </div>
        {jornadaActiva?<>
          <div style={{fontSize:12,color:TEXT,marginBottom:4}}>
            Entrada: <strong>{jornadaActiva.inTs?.seconds?new Date(jornadaActiva.inTs.seconds*1000).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"—"}</strong>
          </div>
          <div style={{fontSize:12,color:TEXT,marginBottom:10}}>
            Tiempo transcurrido: <strong style={{fontFamily:MONO,color:GREEN}}>{horasHoy.toFixed(2)} h</strong>
          </div>
          <button onClick={checkout} className="btn" style={{width:"100%",padding:"11px 0",borderRadius:10,background:"linear-gradient(135deg,"+ROSE+",#f43f5e)",color:"#fff",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Square size={13}/>Cerrar jornada
          </button>
        </>:<>
          <div style={{fontSize:12,color:MUTED,marginBottom:10}}>
            {jornadasHoy.length>0?"Hoy trabajaste "+horasHoy.toFixed(2)+" h en "+jornadasHoy.length+" jornada"+(jornadasHoy.length===1?"":"s"):"Aún no has iniciado jornada hoy"}
          </div>
          <button onClick={checkin} className="btn" style={{width:"100%",padding:"11px 0",borderRadius:10,background:"linear-gradient(135deg,"+GREEN+",#10b981)",color:"#fff",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Play size={13}/>Iniciar jornada (checkin)
          </button>
        </>}
      </div>

      {/* Stats hero grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:"#fff",borderRadius:14,padding:"14px 16px",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
          <div style={{fontSize:22}}>📦</div>
          <div style={{fontFamily:MONO,fontSize:26,fontWeight:900,color:A,lineHeight:1,marginTop:4}}>{totalEntregas.toLocaleString()}</div>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>Entregas totales</div>
        </div>
        <div style={{background:"#fff",borderRadius:14,padding:"14px 16px",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
          <div style={{fontSize:22}}>🏁</div>
          <div style={{fontFamily:MONO,fontSize:26,fontWeight:900,color:GREEN,lineHeight:1,marginTop:4}}>{rutasCompletadas.length}</div>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>Rutas completadas</div>
        </div>
        <div style={{background:"#fff",borderRadius:14,padding:"14px 16px",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
          <div style={{fontSize:22}}>🛣️</div>
          <div style={{fontFamily:MONO,fontSize:26,fontWeight:900,color:BLUE,lineHeight:1,marginTop:4}}>{Math.round(totalKm).toLocaleString()}</div>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>Km recorridos</div>
        </div>
        <div style={{background:"#fff",borderRadius:14,padding:"14px 16px",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
          <div style={{fontSize:22}}>⏱️</div>
          <div style={{fontFamily:MONO,fontSize:26,fontWeight:900,color:VIOLET,lineHeight:1,marginTop:4}}>{totalHoras>0?totalHoras.toFixed(1):"0"}</div>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>Horas en ruta</div>
        </div>
      </div>

      {/* Success rate bar */}
      <div style={{background:"#fff",borderRadius:14,padding:14,marginBottom:10,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:TEXT}}>Tasa de entregas exitosas</div>
          <div style={{fontFamily:MONO,fontSize:16,fontWeight:900,color:successRate>=95?GREEN:successRate>=85?AMBER:ROSE}}>{successRate}%</div>
        </div>
        <MiniBar pct={successRate} color={successRate>=95?GREEN:successRate>=85?AMBER:ROSE} h={8}/>
        <div style={{fontSize:10,color:MUTED,marginTop:6}}>{totalEntregas} entregadas · {problemas} con incidente</div>
      </div>

      {/* Mejor día */}
      {mejorDia&&<div style={{background:"linear-gradient(135deg,"+A+"10,"+A+"22)",border:"1px solid "+A+"35",borderRadius:14,padding:14,marginBottom:10}}>
        <div style={{fontSize:10,fontWeight:800,color:A,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>🏆 Mejor día</div>
        <div style={{fontFamily:DISP,fontWeight:800,fontSize:16,color:TEXT}}>{new Date(mejorDia[0]+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"short"})}</div>
        <div style={{fontSize:12,color:MUTED,marginTop:2}}>{mejorDia[1]} entregas en un solo día</div>
      </div>}

      {/* Logout */}
      <button onClick={()=>{if(confirm("¿Cerrar sesión?"))onLogout();}} className="btn" style={{width:"100%",marginTop:14,padding:"13px 0",borderRadius:11,background:"#fff",border:"1.5px solid "+ROSE+"30",color:ROSE,fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
        <LogOut size={14}/>Cerrar sesión
      </button>
      <div style={{fontSize:9,color:MUTED,textAlign:"center",marginTop:10,letterSpacing:"0.05em"}}>DMvimiento · App Chofer v2.2</div>
    </>
  );
}

/* Pantalla post-completar ruta — celebración + CTAs para siguiente ruta o descansar */
function ChoferRutaCompletada({ruta,siguienteRuta,onIniciarSiguiente,onDescansar,onVolverHoy}){
  const entregas = (ruta.stopsStatus||[]).filter(s=>s.status==="entregado").length;
  const totalParadas = (ruta.stops||[]).filter(s=>!s.isOrigin).length;
  const duracionMin = ruta.iniciadaEn?.seconds && ruta.completadaEn?.seconds
    ? Math.round(((ruta.completadaEn.seconds-ruta.iniciadaEn.seconds)/60))
    : null;
  const horas = duracionMin?Math.floor(duracionMin/60):0;
  const mins = duracionMin?duracionMin%60:0;
  return(
    <div style={{padding:"20px 16px",minHeight:"calc(100vh - 80px)",display:"flex",flexDirection:"column",gap:14}}>
      {/* Hero celebración */}
      <div className="pi" style={{background:"linear-gradient(135deg,"+GREEN+",#10b981)",color:"#fff",borderRadius:20,padding:"32px 22px",textAlign:"center",boxShadow:"0 12px 40px "+GREEN+"55"}}>
        <div style={{fontSize:54,marginBottom:8,lineHeight:1}}>🎉</div>
        <div style={{fontFamily:DISP,fontWeight:900,fontSize:24,letterSpacing:"-0.02em",marginBottom:4}}>¡Ruta completada!</div>
        <div style={{fontSize:13,opacity:.9,marginBottom:16}}>{ruta.nombre}</div>
        <div style={{display:"grid",gridTemplateColumns:duracionMin?"repeat(3,1fr)":"repeat(2,1fr)",gap:10,maxWidth:320,margin:"0 auto"}}>
          <div style={{background:"rgba(255,255,255,.16)",borderRadius:12,padding:"10px 6px"}}>
            <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,lineHeight:1}}>{entregas}/{totalParadas}</div>
            <div style={{fontSize:9,opacity:.85,marginTop:3,letterSpacing:"0.05em",textTransform:"uppercase"}}>Entregas</div>
          </div>
          {ruta.totalKm>0&&<div style={{background:"rgba(255,255,255,.16)",borderRadius:12,padding:"10px 6px"}}>
            <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,lineHeight:1}}>{ruta.totalKm.toLocaleString()}</div>
            <div style={{fontSize:9,opacity:.85,marginTop:3,letterSpacing:"0.05em",textTransform:"uppercase"}}>Km</div>
          </div>}
          {duracionMin!==null&&<div style={{background:"rgba(255,255,255,.16)",borderRadius:12,padding:"10px 6px"}}>
            <div style={{fontFamily:MONO,fontSize:22,fontWeight:900,lineHeight:1}}>{horas>0?horas+"h "+mins+"m":mins+"m"}</div>
            <div style={{fontSize:9,opacity:.85,marginTop:3,letterSpacing:"0.05em",textTransform:"uppercase"}}>Duración</div>
          </div>}
        </div>
      </div>

      {/* CTA siguiente ruta */}
      {siguienteRuta?<div style={{background:"#fff",borderRadius:16,padding:18,boxShadow:"0 4px 16px rgba(12,24,41,.06)",border:"2px solid "+A+"28"}}>
        <div style={{fontSize:10,fontWeight:800,color:A,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
          <Navigation size={12}/>Siguiente ruta
        </div>
        <div style={{fontFamily:DISP,fontWeight:800,fontSize:18,color:TEXT,marginBottom:3}}>{siguienteRuta.nombre}</div>
        {siguienteRuta.cliente&&<div style={{fontSize:12,color:MUTED,marginBottom:10}}>{siguienteRuta.cliente}</div>}
        <div style={{display:"flex",gap:12,fontSize:11,color:MUTED,marginBottom:14,flexWrap:"wrap"}}>
          <span><MapPin size={11} style={{display:"inline",marginRight:3,verticalAlign:"text-bottom"}}/>{(siguienteRuta.stops||[]).filter(s=>!s.isOrigin).length} paradas</span>
          <span><Package size={11} style={{display:"inline",marginRight:3,verticalAlign:"text-bottom"}}/>{(siguienteRuta.totalPDV||0).toLocaleString()} PDVs</span>
          {siguienteRuta.totalKm>0&&<span><Globe size={11} style={{display:"inline",marginRight:3,verticalAlign:"text-bottom"}}/>{siguienteRuta.totalKm.toLocaleString()} km</span>}
        </div>
        <button onClick={onIniciarSiguiente} className="btn" style={{width:"100%",padding:"14px 0",borderRadius:12,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",fontFamily:DISP,fontWeight:800,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 6px 20px "+A+"40"}}>
          <Play size={16}/>Iniciar siguiente ruta
        </button>
      </div>
      :<div style={{background:"#fff",borderRadius:16,padding:24,textAlign:"center",boxShadow:"0 1px 4px rgba(12,24,41,.04)",border:"1.5px dashed "+BD2}}>
        <CheckCircle size={36} color={GREEN} style={{marginBottom:10}}/>
        <div style={{fontFamily:DISP,fontWeight:800,fontSize:16,color:TEXT,marginBottom:4}}>No hay más rutas pendientes</div>
        <div style={{fontSize:12,color:MUTED,lineHeight:1.5}}>Excelente trabajo. Cuando tu administrador te asigne una ruta nueva, aparecerá aquí automáticamente.</div>
      </div>}

      {/* Botones secundarios */}
      <div style={{display:"flex",gap:8}}>
        <button onClick={onVolverHoy} className="btn" style={{flex:1,padding:"12px 0",borderRadius:11,background:"#fff",border:"1.5px solid "+BD2,color:TEXT,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <Calendar size={13}/>Ver mi día
        </button>
        <button onClick={onDescansar} className="btn" style={{flex:1,padding:"12px 0",borderRadius:11,background:"#fff",border:"1.5px solid "+BD2,color:TEXT,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <CheckCircle size={13}/>Ver historial
        </button>
      </div>
    </div>
  );
}

/* Tipos de incidentes con templates de mensaje al cliente */
const INCIDENT_TYPES = [
  {id:"ausente",   label:"Cliente ausente",     emoji:"👤", template:"No había quien recibiera el pedido"},
  {id:"direccion", label:"Dirección incorrecta",emoji:"📍", template:"La dirección proporcionada es incorrecta / no existe"},
  {id:"acceso",    label:"Acceso restringido",  emoji:"🚫", template:"No se permitió el acceso al lugar de entrega"},
  {id:"devolucion",label:"Devolución",          emoji:"↩️", template:"Cliente rechazó el pedido"},
  {id:"danado",    label:"Producto dañado",     emoji:"📦", template:"Pedido llegó con daños"},
  {id:"otro",      label:"Otro",                emoji:"⚠️", template:""},
];

function ChoferRutaActiva({ruta,chofer,tracking,onStop,showT}){
  const [stops,setStops]=useState(()=>{
    // Si ya hay stopsStatus persistido (reanudando ruta), úsalo
    const persisted = (ruta.stopsStatus||[]).reduce((a,s)=>{a[s.idx]=s;return a;},{});
    return (ruta.stops||[]).map((s,i)=>{
      const p = persisted[i];
      return {...s,idx:i,status:p?.status||(i===0&&s.isOrigin?"origen":"pendiente"),fotoURL:p?.fotoURL||"",firmaURL:p?.firmaURL||"",receptor:p?.receptor||"",notas:p?.notas||""};
    });
  });
  const [modalStop,setModalStop]=useState(null);
  const [comentario,setComentario]=useState("");
  const [receptor,setReceptor]=useState("");
  const [fotoFile,setFotoFile]=useState(null);
  const [fotoPreview,setFotoPreview]=useState("");
  const [firmaData,setFirmaData]=useState("");
  const [incidentType,setIncidentType]=useState("ausente");
  const [submitting,setSubmitting]=useState(false);
  const [myLoc,setMyLoc]=useState(null); // Posición actual (fallback si no hay tracking)
  const miniMapRef=useRef(null);
  const miniMapContRef=useRef(null);
  const myMarkerRef=useRef(null);

  // Obtiene ubicación en vivo (además del tracking)
  useEffect(()=>{
    if(!("geolocation" in navigator)) return;
    const wid = navigator.geolocation.watchPosition(
      (pos)=>setMyLoc({lat:pos.coords.latitude,lng:pos.coords.longitude}),
      ()=>{},
      {enableHighAccuracy:true,maximumAge:10000,timeout:20000}
    );
    return()=>navigator.geolocation.clearWatch(wid);
  },[]);

  const pickPhoto = (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Llamada 1-tap
  const callTel = (tel)=>{
    if(!tel) return;
    const clean = tel.toString().replace(/\D/g,"");
    if(clean.length<8){showT("Teléfono no válido","err");return;}
    window.location.href = `tel:+52${clean}`;
  };

  // Genera link WhatsApp del cliente con mensaje prellenado
  const notifyCliente = (tipo, stop, fotoURL="", notas="", incidentLabel="")=>{
    if(!ruta.clienteTel||ruta.clienteTel.replace(/\D/g,"").length!==10) return;
    const trackUrl = `${window.location.origin}/track/${ruta.trackingId||ruta.id}`;
    const emoji = tipo==="arrival"?"📍":tipo==="delivered"?"✅":tipo==="issue"?"⚠️":"🚚";
    let msg = "";
    if(tipo==="arrival") msg = `${emoji} DMvimiento: El chofer ${chofer.nombre} llegó a ${stop.city}. Puedes verlo en tiempo real: ${trackUrl}`;
    else if(tipo==="delivered") msg = `${emoji} DMvimiento: Entrega completada en ${stop.city}${notas?" · "+notas:""}${fotoURL?"\n📸 Con evidencia fotográfica.":""}\nVer todo: ${trackUrl}`;
    else if(tipo==="issue") msg = `${emoji} DMvimiento: Incidencia en ${stop.city}${incidentLabel?" — "+incidentLabel:""}: ${notas}\nTracking: ${trackUrl}`;
    const waUrl = `https://wa.me/52${ruta.clienteTel.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl,"_blank");
  };

  const updateStopStatus = async (stopIdx, newStatus, notas="", fotoURL="", receptorNombre="", firmaURL="", incidentCategory="")=>{
    const nuevo = stops.map(s=>s.idx===stopIdx?{...s,status:newStatus,notas,fotoURL,firmaURL,receptor:receptorNombre,incidentCategory,ts:Date.now()}:s);
    setStops(nuevo);
    const done = nuevo.filter(s=>s.status==="entregado").length;
    const totalNonOrigen = nuevo.filter(s=>s.status!=="origen"&&!s.isOrigin).length;
    const prog = totalNonOrigen>0?Math.round(done/totalNonOrigen*100):0;
    await updateDoc(doc(db,"rutas",ruta.id),{progreso:prog,stopsStatus:nuevo.map(s=>({idx:s.idx,status:s.status,notas:s.notas||"",fotoURL:s.fotoURL||"",firmaURL:s.firmaURL||"",receptor:s.receptor||"",incidentCategory:s.incidentCategory||"",ts:s.ts||0}))}).catch(()=>{});
    const stop = nuevo.find(s=>s.idx===stopIdx);
    if(newStatus==="llegue") postAlert(ruta.id,chofer.id,chofer.nombre,"arrival","Llegó a "+(stop.city||"parada "+(stopIdx+1)),{stopIdx});
    if(newStatus==="entregado") postAlert(ruta.id,chofer.id,chofer.nombre,"delivered","Entregó en "+(stop.city||"parada "+(stopIdx+1))+(notas?" · "+notas:""),{stopIdx,notas});
    if(newStatus==="problema") postAlert(ruta.id,chofer.id,chofer.nombre,"issue","Problema en "+(stop.city||"parada "+(stopIdx+1))+(incidentCategory?" ["+incidentCategory+"]":"")+": "+notas,{stopIdx,notas,incidentCategory});
  };

  const openNavigation = (stop, punto=null)=>{
    // Si hay punto específico con coordenadas, usar esas
    if(punto&&punto.lat&&punto.lng){
      const url = `https://www.google.com/maps/dir/?api=1&destination=${punto.lat},${punto.lng}&travelmode=driving`;
      window.open(url,"_blank");
      return;
    }
    if(punto&&punto.address){
      const q = encodeURIComponent(punto.address);
      const url = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
      window.open(url,"_blank");
      return;
    }
    const q = encodeURIComponent(stop.city||"");
    const url = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
    window.open(url,"_blank");
  };

  const done = stops.filter(s=>s.status==="entregado").length;
  const totalEntregas = stops.filter(s=>s.status!=="origen"&&!s.isOrigin).length;
  const allDone = done>0 && done===totalEntregas;

  // Siguiente parada pendiente (o "en sitio")
  const siguiente = stops.find(s=>!s.isOrigin&&s.status!=="entregado"&&s.status!=="origen");

  // ETA al siguiente stop (Haversine / 40km-h como proxy rápido sin API call)
  const etaNextMin = (()=>{
    if(!siguiente||!myLoc) return null;
    const punto = (siguiente.puntos||[]).find(p=>p.lat&&p.lng);
    if(!punto) return null;
    const d = distKm(myLoc.lat,myLoc.lng,punto.lat,punto.lng);
    return Math.max(1,Math.round(d/40*60));
  })();

  // Optimización de orden de paradas (nearest-neighbor desde ubicación actual)
  const [optimizing,setOptimizing]=useState(false);
  const optimizarOrden = async()=>{
    const pendientes = stops.filter(s=>!s.isOrigin&&s.status!=="entregado");
    if(pendientes.length<3){showT("Necesitas al menos 3 paradas pendientes para optimizar","warn");return;}
    if(!myLoc){showT("Esperando ubicación GPS…","warn");return;}
    setOptimizing(true);
    try{
      // Greedy nearest-neighbor desde mi ubicación
      const withCoord = pendientes.map(s=>{
        const p = (s.puntos||[]).find(x=>x.lat&&x.lng);
        return p?{stop:s,lat:p.lat,lng:p.lng}:null;
      }).filter(Boolean);
      if(withCoord.length<2){showT("Las paradas no tienen coordenadas — pide al admin que las agregue","err");setOptimizing(false);return;}
      let cur = {lat:myLoc.lat,lng:myLoc.lng};
      const orden = [];
      const pool = [...withCoord];
      while(pool.length){
        let bestI = 0, bestD = Infinity;
        pool.forEach((c,i)=>{
          const d = distKm(cur.lat,cur.lng,c.lat,c.lng);
          if(d<bestD){bestD=d;bestI=i;}
        });
        const [picked] = pool.splice(bestI,1);
        orden.push(picked.stop.idx);
        cur = {lat:picked.lat,lng:picked.lng};
      }
      // Reordenar stops: origen primero + entregadas al final + optimizadas en medio
      const origen = stops.filter(s=>s.isOrigin||s.status==="origen");
      const entregadas = stops.filter(s=>s.status==="entregado"&&!s.isOrigin);
      const optOrder = orden.map(idx=>stops.find(s=>s.idx===idx)).filter(Boolean);
      const merged = [...origen,...optOrder,...entregadas].map((s,newIdx)=>({...s,idx:newIdx}));
      setStops(merged);
      // Persiste el nuevo orden de stops en la ruta
      await updateDoc(doc(db,"rutas",ruta.id),{
        stops: merged.map(s=>({city:s.city,pdv:s.pdv||0,km:s.km||0,addr:s.addr||"",isOrigin:!!s.isOrigin,puntos:s.puntos||[]})),
        stopsStatus: merged.map(s=>({idx:s.idx,status:s.status,notas:s.notas||"",fotoURL:s.fotoURL||"",firmaURL:s.firmaURL||"",receptor:s.receptor||"",ts:s.ts||0})),
        optimizedAt: serverTimestamp(),
      }).catch(()=>{});
      showT("✓ Orden optimizado por distancia");
    }catch(e){showT("Error: "+e.message,"err");}
    setOptimizing(false);
  };

  // Mini mapa con GPS
  useEffect(()=>{
    if(!MAPBOX_TOKEN||!miniMapContRef.current||miniMapRef.current) return;
    const center = myLoc?[myLoc.lng,myLoc.lat]:MX_CENTER;
    const m = new mapboxgl.Map({
      container: miniMapContRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: 13,
      attributionControl:false,
      interactive:true,
    });
    m.addControl(new mapboxgl.NavigationControl({showCompass:false}),"top-right");
    miniMapRef.current = m;
    // Paint stops
    m.on("load",()=>{
      const bnds = new mapboxgl.LngLatBounds();
      stops.forEach((s,i)=>{
        (s.puntos||[]).forEach(p=>{
          if(!p.lat||!p.lng) return;
          const c = s.status==="entregado"?GREEN:s.status==="llegue"?BLUE:s.status==="problema"?ROSE:s.isOrigin?MUTED:A;
          const el = document.createElement("div");
          el.style.cssText = `width:26px;height:26px;border-radius:50%;background:${c};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);color:#fff;font-weight:800;font-size:10px;display:flex;align-items:center;justify-content:center;font-family:${MONO}`;
          el.textContent = s.isOrigin?"🏠":String(i);
          new mapboxgl.Marker(el).setLngLat([p.lng,p.lat]).addTo(m);
          bnds.extend([p.lng,p.lat]);
        });
      });
      if(myLoc){bnds.extend([myLoc.lng,myLoc.lat]);}
      if(!bnds.isEmpty()) m.fitBounds(bnds,{padding:50,maxZoom:14,duration:0});
    });
    return()=>{try{m.remove();}catch(e){}miniMapRef.current=null;};
  },[]);

  // Update user marker
  useEffect(()=>{
    if(!miniMapRef.current||!myLoc) return;
    if(myMarkerRef.current){
      myMarkerRef.current.setLngLat([myLoc.lng,myLoc.lat]);
    }else{
      const el = document.createElement("div");
      el.style.cssText = `width:20px;height:20px;border-radius:50%;background:${BLUE};border:3px solid #fff;box-shadow:0 0 0 6px ${BLUE}30,0 3px 10px rgba(0,0,0,.3);`;
      myMarkerRef.current = new mapboxgl.Marker(el).setLngLat([myLoc.lng,myLoc.lat]).addTo(miniMapRef.current);
    }
  },[myLoc]);

  return(
    <div style={{paddingBottom:150}}>
      {/* Progress + acciones rápidas */}
      <div style={{background:"#fff",padding:"12px 16px 10px",borderBottom:"1px solid "+BORDER}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:DISP,fontWeight:800,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ruta.nombre}</div>
            <div style={{fontSize:11,color:MUTED,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ruta.cliente||"Sin cliente"}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
            <div style={{fontFamily:MONO,fontSize:20,fontWeight:800,color:A,lineHeight:1}}>{done}/{totalEntregas}</div>
            <div style={{fontSize:10,color:MUTED}}>entregas</div>
          </div>
        </div>
        <MiniBar pct={totalEntregas>0?done/totalEntregas*100:0} color={GREEN} h={6}/>
        {/* Acciones rápidas: llamar cliente + optimizar */}
        <div style={{display:"flex",gap:6,marginTop:10}}>
          {ruta.clienteTel&&<button onClick={()=>callTel(ruta.clienteTel)} className="btn" style={{flex:1,padding:"8px 0",borderRadius:9,background:BLUE+"0e",border:"1px solid "+BLUE+"28",color:BLUE,fontWeight:700,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <Phone size={12}/>Llamar cliente
          </button>}
          <button onClick={optimizarOrden} disabled={optimizing} className="btn" style={{flex:1,padding:"8px 0",borderRadius:9,background:VIOLET+"0e",border:"1px solid "+VIOLET+"28",color:VIOLET,fontWeight:700,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <Zap size={12}/>{optimizing?"Optimizando…":"Optimizar recorrido"}
          </button>
        </div>
      </div>

      {/* Sticky CTA "Próxima parada" — visible siempre hasta completar */}
      {siguiente&&<div style={{position:"sticky",top:72,zIndex:40,margin:"10px 14px 0",background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:14,padding:"12px 14px",boxShadow:"0 6px 22px "+A+"45",display:"flex",alignItems:"center",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",opacity:.9,marginBottom:2}}>{siguiente.status==="llegue"?"🎯 En sitio":"🧭 Próxima parada"}</div>
          <div style={{fontWeight:800,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{siguiente.city}</div>
          <div style={{fontSize:10,opacity:.9,display:"flex",gap:8,flexWrap:"wrap"}}>
            {siguiente.pdv>0&&<span>{siguiente.pdv} PDVs</span>}
            {(siguiente.puntos||[]).length>0&&<span>· {siguiente.puntos.length} punto{siguiente.puntos.length===1?"":"s"}</span>}
            {etaNextMin!==null&&<span>· ETA ~{etaNextMin}min</span>}
          </div>
        </div>
        <button onClick={()=>openNavigation(siguiente,(siguiente.puntos||[])[0]||null)} className="btn" style={{background:"rgba(255,255,255,.22)",color:"#fff",borderRadius:11,padding:"10px 14px",fontFamily:SANS,fontWeight:800,fontSize:12,display:"flex",alignItems:"center",gap:5,flexShrink:0,backdropFilter:"blur(6px)"}}>
          <Navigation size={14}/>Ir
        </button>
      </div>}

      {/* Mapa mini con ubicación en vivo */}
      {MAPBOX_TOKEN&&<div style={{margin:"10px 14px",borderRadius:14,overflow:"hidden",border:"1px solid "+BORDER,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
        <div ref={miniMapContRef} style={{width:"100%",height:180}}/>
      </div>}

      {/* Stops */}
      <div style={{padding:"14px 14px"}}>
        {stops.map((s,i)=>{
          const isOrigen = s.status==="origen";
          const sc = s.status==="entregado"?GREEN:s.status==="llegue"?BLUE:s.status==="problema"?ROSE:isOrigen?MUTED:VIOLET;
          const tienePuntos = (s.puntos||[]).length>0;
          return(
            <div key={i} style={{background:"#fff",borderRadius:14,padding:14,marginBottom:10,border:"1.5px solid "+(s.status==="llegue"?BLUE+"50":BORDER),boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:isOrigen?(tienePuntos?10:0):10}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:sc+"14",border:"2px solid "+sc,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:800,fontSize:12,color:sc,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.city}</div>
                  {s.pdv>0&&<div style={{fontSize:11,color:MUTED}}>{s.pdv} PDVs {tienePuntos?"· "+s.puntos.length+" puntos":""}</div>}
                  {s.notas&&<div style={{fontSize:11,color:sc,marginTop:2}}>📝 {s.notas}</div>}
                </div>
                <Tag color={sc} sm>{isOrigen?"Origen":s.status==="entregado"?"✓ Entregado":s.status==="llegue"?"En sitio":s.status==="problema"?"⚠ Problema":"Pendiente"}</Tag>
              </div>
              {/* Puntos específicos dentro de la ciudad */}
              {tienePuntos&&<div style={{marginBottom:s.status!=="entregado"?10:0}}>
                {s.puntos.map((p,pi)=>(
                  <div key={p.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",background:VIOLET+"06",border:"1px solid "+VIOLET+"20",borderRadius:9,marginBottom:6}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:VIOLET,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0,marginTop:2}}>{pi+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                      <div style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.address}</div>
                      {p.notas&&<div style={{fontSize:11,color:AMBER,background:AMBER+"10",padding:"5px 8px",borderRadius:6,marginTop:5,fontWeight:600,lineHeight:1.4,border:"1px solid "+AMBER+"28"}}>⚠ {p.notas}</div>}
                      {p.telContacto&&<button onClick={()=>callTel(p.telContacto)} className="btn" style={{marginTop:4,color:BLUE,background:BLUE+"10",border:"1px solid "+BLUE+"30",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}><Phone size={9}/>{p.telContacto}</button>}
                    </div>
                    {!isOrigen&&<button onClick={()=>openNavigation(s,p)} className="btn" style={{color:"#fff",background:BLUE,borderRadius:7,padding:"6px 10px",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:4,flexShrink:0}}><Navigation size={10}/>Ir</button>}
                  </div>
                ))}
              </div>}
              {!isOrigen&&s.status!=="entregado"&&<div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>openNavigation(s)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:BLUE+"0e",border:"1.5px solid "+BLUE+"28",color:BLUE,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Navigation size={13}/>Navegar ciudad</button>
                {s.status==="pendiente"&&<button onClick={async()=>{
                  await updateStopStatus(i,"llegue");
                  if(ruta.clienteTel) notifyCliente("arrival",s);
                }} className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:BLUE,color:"#fff",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><MapPin size={13}/>Llegué</button>}
                {s.status==="llegue"&&<>
                  <button onClick={()=>setModalStop({...s,action:"entregado"})} className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:GREEN,color:"#fff",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><CheckCircle size={13}/>Entregué</button>
                  <button onClick={()=>setModalStop({...s,action:"problema"})} className="btn" style={{padding:"10px 14px",borderRadius:10,background:ROSE+"10",border:"1.5px solid "+ROSE+"30",color:ROSE,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}><AlertCircle size={13}/></button>
                </>}
              </div>}
            </div>
          );
        })}
      </div>

      {/* Sticky bottom controls */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid "+BORDER,padding:"10px 14px",display:"flex",gap:8,boxShadow:"0 -4px 16px rgba(12,24,41,.08)",zIndex:50}}>
        <button onClick={async()=>{
          if(!confirm("⚠️ ENVIAR SOS?\n\nSe notificará al administrador de inmediato con tu ubicación actual. Solo usa esto en emergencia.")) return;
          try{navigator.vibrate&&navigator.vibrate([400,100,400]);}catch(e){}
          const coords = myLoc||{lat:0,lng:0};
          await postAlert(ruta.id,chofer.id,chofer.nombre,"sos","🚨 SOS EMERGENCIA - Chofer solicita ayuda inmediata",{lat:coords.lat,lng:coords.lng,timestamp:Date.now(),critical:true}).catch(()=>{});
          showT("🚨 SOS enviado al administrador");
        }} className="btn" style={{padding:"12px 14px",borderRadius:11,background:"linear-gradient(135deg,#dc2626,#ef4444)",color:"#fff",fontFamily:DISP,fontWeight:900,fontSize:14,display:"flex",alignItems:"center",gap:5,boxShadow:"0 6px 18px #dc262655"}}>
          <AlertCircle size={15}/>SOS
        </button>
        <button onClick={()=>{if(confirm("¿Terminar ruta y regresar al inicio?"))onStop();}} className="btn" style={{flex:1,padding:"12px 0",borderRadius:11,background:allDone?"linear-gradient(135deg,"+GREEN+",#10b981)":ROSE+"10",border:allDone?"none":"1.5px solid "+ROSE+"30",color:allDone?"#fff":ROSE,fontFamily:DISP,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
          {allDone?<><Flag size={14}/>Finalizar ruta</>:<><Square size={13}/>Terminar</>}
        </button>
      </div>

      {/* Confirmation modal */}
      {modalStop&&<Modal title={modalStop.action==="entregado"?"Confirmar entrega":"Reportar incidente"} onClose={()=>{setModalStop(null);setComentario("");setFotoFile(null);setFotoPreview("");setReceptor("");setFirmaData("");setIncidentType("ausente");}} icon={modalStop.action==="entregado"?CheckCircle:AlertCircle} iconColor={modalStop.action==="entregado"?GREEN:ROSE}>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,color:MUTED,marginBottom:4}}>Parada</div>
          <div style={{fontWeight:700,fontSize:15}}>{modalStop.city}</div>
        </div>
        {/* INCIDENTE: categorías */}
        {modalStop.action==="problema"&&<div style={{marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Tipo de incidente</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {INCIDENT_TYPES.map(t=>(
              <button key={t.id} type="button" onClick={()=>{setIncidentType(t.id);if(!comentario&&t.template)setComentario(t.template);}} className="btn" style={{padding:"9px 10px",borderRadius:10,border:"1.5px solid "+(incidentType===t.id?ROSE:BD2),background:incidentType===t.id?ROSE+"12":"#fff",color:incidentType===t.id?ROSE:TEXT,fontWeight:700,fontSize:11,textAlign:"left",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:14}}>{t.emoji}</span>{t.label}
              </button>
            ))}
          </div>
        </div>}
        {modalStop.action==="entregado"&&<>
          {/* Escáner de código de barras / QR (opcional, si el navegador lo soporta) */}
          <BarcodeQuickScan onScan={(code)=>{
            setComentario(prev=>prev?prev+" · Cód: "+code:"Cód: "+code);
          }}/>
          <div style={{marginBottom:11}}>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Nombre de quien recibió <span style={{color:ROSE}}>*</span></div>
            <input value={receptor} onChange={e=>setReceptor(e.target.value)} placeholder="Juan Pérez" style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,padding:"10px 13px",fontSize:14}}/>
          </div>
        </>}
        <Txt label={modalStop.action==="entregado"?"Comentarios / Observaciones":"Detalle del incidente"} value={comentario} onChange={e=>setComentario(e.target.value)} placeholder={modalStop.action==="entregado"?"Sin observaciones":"Explica con más detalle…"}/>
        {/* Foto evidencia */}
        <div style={{marginTop:13}}>
          <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>
            {modalStop.action==="entregado"?"Foto de evidencia":"Foto del incidente (opcional)"}
          </div>
          {fotoPreview?<div style={{position:"relative",borderRadius:12,overflow:"hidden",border:"1.5px solid "+BD2}}>
            <img src={fotoPreview} alt="preview" style={{width:"100%",display:"block",maxHeight:260,objectFit:"cover"}}/>
            <button onClick={()=>{setFotoFile(null);setFotoPreview("");}} className="btn" style={{position:"absolute",top:8,right:8,background:"rgba(12,24,41,.7)",color:"#fff",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14}/></button>
          </div>
          :<label htmlFor={"foto-"+modalStop.idx} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"22px 14px",background:A+"06",border:"2px dashed "+A+"40",borderRadius:12,cursor:"pointer",color:A,fontWeight:700,fontSize:13}}>
            <Camera size={18}/>Tomar foto
            <input id={"foto-"+modalStop.idx} type="file" accept="image/*" capture="environment" onChange={pickPhoto} style={{display:"none"}}/>
          </label>}
        </div>
        {/* Firma digital — solo para entregas */}
        {modalStop.action==="entregado"&&<div style={{marginTop:13}}>
          <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Firma de quien recibió <span style={{color:ROSE}}>*</span></div>
          <SignaturePad onChange={setFirmaData}/>
        </div>}
        <button onClick={async()=>{
          setSubmitting(true);
          try{
            let fotoURL = "";
            if(fotoFile){
              try{fotoURL = await uploadEvidencia(fotoFile);}
              catch(e){
                if(!confirm("No se pudo procesar la foto. ¿Continuar sin foto?\n\nError: "+e.message)){
                  setSubmitting(false);return;
                }
              }
            }
            const incident = INCIDENT_TYPES.find(t=>t.id===incidentType);
            const incidentLabel = modalStop.action==="problema"?(incident?.label||""):"";
            const notasFull = modalStop.action==="entregado"
              ? [receptor?"Recibió: "+receptor:"",comentario].filter(Boolean).join(" · ")
              : [incidentLabel,comentario].filter(Boolean).join(" — ");
            await updateStopStatus(modalStop.idx,modalStop.action,notasFull,fotoURL,receptor,firmaData,incidentLabel);
            // Notifica al cliente
            if(ruta.clienteTel) notifyCliente(modalStop.action==="entregado"?"delivered":"issue",modalStop,fotoURL,notasFull,incidentLabel);
            showT(modalStop.action==="entregado"?"✓ Entrega confirmada con firma":"⚠ Incidente reportado");
          }catch(e){showT(e.message,"err");}
          setSubmitting(false);
          setModalStop(null);setComentario("");setFotoFile(null);setFotoPreview("");setReceptor("");setFirmaData("");setIncidentType("ausente");
        }} disabled={submitting||(modalStop.action==="entregado"&&(!receptor.trim()||!firmaData))} className="btn" style={{width:"100%",marginTop:14,background:modalStop.action==="entregado"&&(!receptor.trim()||!firmaData)?"#e0e0e0":(modalStop.action==="entregado"?"linear-gradient(135deg,"+GREEN+",#10b981)":"linear-gradient(135deg,"+ROSE+",#f43f5e)"),color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISP,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
          {submitting?<><div className="spin" style={{width:14,height:14,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}}/>Enviando…</>:modalStop.action==="entregado"&&(!receptor.trim()||!firmaData)?"Falta receptor y firma":<><CheckCircle size={14}/>Confirmar</>}
        </button>
      </Modal>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRACKING PÚBLICO — /track/:trackingId (tipo FedEx/Uber Eats)
   ═══════════════════════════════════════════════════════════════════════════ */
function ClientTracking({trackingId}){
  const [ruta,setRuta]=useState(null);
  const [driverLoc,setDriverLoc]=useState(null);
  const [loading,setLoading]=useState(true);
  const [notFound,setNotFound]=useState(false);
  const [photoModal,setPhotoModal]=useState(null);
  const mapRef=useRef(null);
  const mapCont=useRef(null);
  const markersRef=useRef([]);
  const driverMarkerRef=useRef(null);

  // Busca la ruta por trackingId
  useEffect(()=>{
    const q = query(collection(db,"rutas"),where("trackingId","==",trackingId));
    const unsub = onSnapshot(q,s=>{
      if(s.empty){setNotFound(true);setLoading(false);return;}
      const r = {id:s.docs[0].id,...s.docs[0].data()};
      setRuta(r);
      setLoading(false);
    });
    return()=>unsub();
  },[trackingId]);

  // Live driver location
  useEffect(()=>{
    if(!ruta?.choferId) return;
    const unsub = onSnapshot(doc(db,"driverLocations",ruta.choferId),s=>{
      if(s.exists()){setDriverLoc({id:s.id,...s.data()});}
    });
    return()=>unsub();
  },[ruta?.choferId]);

  // Init map
  useEffect(()=>{
    if(!MAPBOX_TOKEN||!mapCont.current||mapRef.current||!ruta)return;
    mapRef.current = new mapboxgl.Map({
      container:mapCont.current,
      style:"mapbox://styles/mapbox/streets-v12",
      center:MX_CENTER,
      zoom:5,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(),"top-right");
    mapRef.current.on("load",()=>{
      // Línea del chofer al próximo punto (estilo Uber)
      mapRef.current.addSource("live-route",{type:"geojson",data:{type:"Feature",geometry:{type:"LineString",coordinates:[]}}});
      mapRef.current.addLayer({id:"live-route-casing",type:"line",source:"live-route",paint:{"line-color":"#fff","line-width":8,"line-opacity":.9}});
      mapRef.current.addLayer({id:"live-route-layer",type:"line",source:"live-route",paint:{"line-color":BLUE,"line-width":5,"line-opacity":1}});
    });
    return()=>{mapRef.current?.remove();mapRef.current=null;};
  },[ruta]);

  // Paint stops
  useEffect(()=>{
    if(!mapRef.current||!ruta)return;
    markersRef.current.forEach(m=>m.remove());
    markersRef.current = [];
    const bounds = new mapboxgl.LngLatBounds();
    const stopStates = (ruta.stopsStatus||[]).reduce((a,s)=>{a[s.idx]=s;return a;},{});
    (ruta.stops||[]).forEach((s,ci)=>{
      (s.puntos||[]).forEach((p,pi)=>{
        if(!p.lat||!p.lng)return;
        const st = stopStates[ci];
        const color = st?.status==="entregado"?GREEN:st?.status==="llegue"?BLUE:st?.status==="problema"?ROSE:s.isOrigin?MUTED:A;
        const el = document.createElement("div");
        el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(12,24,41,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;font-family:${MONO};cursor:pointer;`;
        el.textContent = String(ci)+"."+String(pi+1);
        const popup = new mapboxgl.Popup({offset:18,closeButton:false}).setHTML(`<div style="font-family:${SANS};padding:4px;max-width:220px"><div style="font-weight:700;font-size:13px">${p.name}</div><div style="font-size:11px;color:#607080">${p.address}</div></div>`);
        const m = new mapboxgl.Marker(el).setLngLat([p.lng,p.lat]).setPopup(popup).addTo(mapRef.current);
        markersRef.current.push(m);
        bounds.extend([p.lng,p.lat]);
      });
    });
    if(!bounds.isEmpty()) mapRef.current.fitBounds(bounds,{padding:60,maxZoom:14,duration:400});
  },[ruta]);

  // Driver marker live + línea + AUTO-FOLLOW tipo Uber/Rappi
  useEffect(()=>{
    if(!mapRef.current) return;
    if(!driverLoc?.lat||!driverLoc?.lng){
      if(driverMarkerRef.current){driverMarkerRef.current.remove();driverMarkerRef.current=null;}
      if(mapRef.current.isStyleLoaded()){
        const s = mapRef.current.getSource("live-route");
        if(s) s.setData({type:"Feature",geometry:{type:"LineString",coordinates:[]}});
      }
      return;
    }
    const stale = Date.now()/1000-(driverLoc.ts?.seconds||0)>300;
    if(stale){
      if(driverMarkerRef.current){driverMarkerRef.current.remove();driverMarkerRef.current=null;}
      if(mapRef.current.isStyleLoaded()){
        const s = mapRef.current.getSource("live-route");
        if(s) s.setData({type:"Feature",geometry:{type:"LineString",coordinates:[]}});
      }
      return;
    }
    if(driverMarkerRef.current){
      driverMarkerRef.current.setLngLat([driverLoc.lng,driverLoc.lat]);
    }else{
      const el = document.createElement("div");
      el.style.cssText = `width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,${A},#fb923c);border:4px solid #fff;box-shadow:0 8px 24px ${A}90;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:26px;cursor:pointer;animation:pulse 2s ease infinite;z-index:100;`;
      el.textContent = "🚚";
      driverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([driverLoc.lng,driverLoc.lat]).addTo(mapRef.current);
    }
    // AUTO-FOLLOW: centra en el chofer con transición suave
    mapRef.current.easeTo({center:[driverLoc.lng,driverLoc.lat],zoom:Math.max(mapRef.current.getZoom(),13),duration:800});
    // Línea azul al próximo punto
    if(ruta&&mapRef.current.isStyleLoaded()){
      const stopStates = (ruta.stopsStatus||[]).reduce((a,s)=>{a[s.idx]=s;return a;},{});
      let siguiente = null;
      (ruta.stops||[]).forEach((s,ci)=>{
        if(siguiente||s.isOrigin) return;
        const st=stopStates[ci];
        if(st?.status==="entregado") return;
        (s.puntos||[]).forEach(p=>{
          if(!siguiente&&p.lat&&p.lng) siguiente = {lat:p.lat,lng:p.lng};
        });
      });
      const src = mapRef.current.getSource("live-route");
      if(src){
        if(siguiente){
          src.setData({type:"Feature",geometry:{type:"LineString",coordinates:[[driverLoc.lng,driverLoc.lat],[siguiente.lng,siguiente.lat]]}});
        }else{
          src.setData({type:"Feature",geometry:{type:"LineString",coordinates:[]}});
        }
      }
    }
  },[driverLoc,ruta]);

  if(loading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f1f4fb"}}><Skeleton w={220} h={20}/></div>;
  if(notFound) return(
    <div style={{minHeight:"100vh",background:"#f1f4fb",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{textAlign:"center",maxWidth:340}}>
        <AlertCircle size={48} color={ROSE} style={{marginBottom:12}}/>
        <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:22,color:TEXT}}>Ruta no encontrada</h1>
        <p style={{color:MUTED,fontSize:13,marginTop:8}}>El código de tracking "{trackingId}" no existe o fue eliminado.</p>
      </div>
    </div>
  );

  const stopStates = (ruta.stopsStatus||[]).reduce((a,s)=>{a[s.idx]=s;return a;},{});
  const totalStops = (ruta.stops||[]).filter(s=>!s.isOrigin).length;
  const done = Object.values(stopStates).filter(s=>s.status==="entregado").length;
  const pct = totalStops>0?Math.round(done/totalStops*100):0;
  const etaEstado = ruta.status==="Completada"?"Completada":ruta.status==="En curso"?"En ruta":"Programada";
  const sc = {Completada:GREEN,"En curso":BLUE,Programada:VIOLET};
  const estadoColor = sc[etaEstado]||MUTED;

  return(
    <div style={{minHeight:"100vh",background:"#f1f4fb",fontFamily:SANS,paddingBottom:20}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0a1628,#1e293b)",color:"#fff",padding:"22px 20px"}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:36,height:36,borderRadius:11,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:14}}>DM</div>
            <div>
              <div style={{fontFamily:DISP,fontWeight:800,fontSize:15}}>DMvimiento Tracking</div>
              <div style={{fontSize:10,color:"#ffffff70",fontFamily:MONO,letterSpacing:"0.1em"}}>#{trackingId}</div>
            </div>
          </div>
          <h1 style={{fontFamily:DISP,fontWeight:900,fontSize:22,letterSpacing:"-0.02em",marginTop:4}}>{ruta.nombre}</h1>
          {ruta.cliente&&<div style={{fontSize:12,color:"#ffffff90",marginTop:3}}>Cliente: {ruta.cliente}</div>}
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:14,flexWrap:"wrap"}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:6,background:estadoColor+"25",color:"#fff",border:"1px solid "+estadoColor+"60",borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:700}}>
              <div className={ruta.status==="En curso"?"pulse":""} style={{width:7,height:7,borderRadius:"50%",background:estadoColor}}/>
              {etaEstado.toUpperCase()}
            </span>
            <span style={{fontFamily:MONO,fontSize:13,fontWeight:700}}>{done}/{totalStops} entregas · {pct}%</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{background:"#fff",padding:"12px 20px",borderBottom:"1px solid "+BORDER}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <MiniBar pct={pct} color={GREEN} h={8}/>
        </div>
      </div>

      {/* MAPA PRINCIPAL — LO PRIMERO QUE VE EL CLIENTE (estilo Uber/Rappi) */}
      {MAPBOX_TOKEN&&<div style={{position:"relative"}}>
        <div ref={mapCont} style={{width:"100%",height:"45vh",minHeight:300}}/>
        {/* Badge EN VIVO sobre el mapa */}
        {driverLoc&&!!(Date.now()/1000-(driverLoc.ts?.seconds||0)<300)&&<div style={{position:"absolute",top:14,left:14,zIndex:10,background:"rgba(12,24,41,.85)",backdropFilter:"blur(8px)",borderRadius:12,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
          <div className="pulse" style={{width:10,height:10,borderRadius:"50%",background:GREEN,boxShadow:"0 0 10px "+GREEN}}/>
          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#fff"}}>{ruta.choferNombre||"Chofer"} EN VIVO</div>
            {driverLoc.speed>0&&<div style={{fontSize:10,color:"#ffffff80",fontFamily:MONO}}>{Math.round(driverLoc.speed*3.6)} km/h</div>}
          </div>
        </div>}
        {/* Leyenda de colores */}
        <div style={{position:"absolute",bottom:10,left:14,right:14,zIndex:10,background:"rgba(255,255,255,.92)",backdropFilter:"blur(6px)",borderRadius:10,padding:"6px 12px",display:"flex",gap:12,fontSize:10,justifyContent:"center"}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:"50%",background:A}}/>🚚 Chofer</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:"50%",background:GREEN}}/>Entregado</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:"50%",background:BLUE}}/>En sitio</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:"50%",background:A}}/>Pendiente</span>
        </div>
      </div>}

      <div style={{maxWidth:800,margin:"0 auto",padding:"16px 16px"}}>
        {/* Chofer info */}
        {ruta.choferNombre&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,padding:14,marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:44,height:44,borderRadius:14,background:"linear-gradient(135deg,"+A+"22,"+VIOLET+"22)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:800,fontSize:15,color:A}}>{(ruta.choferNombre||"?").slice(0,2).toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Tu chofer</div>
            <div style={{fontWeight:700,fontSize:14}}>{ruta.choferNombre}</div>
            <div style={{fontSize:11,color:MUTED}}>{ruta.choferPlaca||""} · {ruta.vehiculoLabel||""}</div>
          </div>
          {driverLoc&&Date.now()/1000-(driverLoc.ts?.seconds||0)<300&&<div className="pulse" style={{display:"flex",alignItems:"center",gap:5,color:GREEN,fontSize:11,fontWeight:700}}>
            <Radio size={12}/>EN VIVO
          </div>}
          {ruta.choferTel&&<a href={"tel:"+ruta.choferTel} className="btn" style={{background:GREEN,color:"#fff",borderRadius:10,padding:"8px 12px",textDecoration:"none",display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700}}><Phone size={13}/>Llamar</a>}
        </div>}

        {/* Mapa principal ahora está arriba en full-width */}

        {/* Stops with evidence */}
        <div style={{fontSize:11,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10,paddingLeft:4}}>Seguimiento de entregas</div>
        {(ruta.stops||[]).map((s,ci)=>{
          const st = stopStates[ci];
          const isOrigen = s.isOrigin;
          const color = st?.status==="entregado"?GREEN:st?.status==="llegue"?BLUE:st?.status==="problema"?ROSE:isOrigen?MUTED:A;
          return(
            <div key={ci} style={{background:"#fff",borderRadius:14,padding:14,marginBottom:10,border:"1px solid "+BORDER,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:s.puntos?.length>0||st?"10":"0"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:color+"14",border:"2px solid "+color,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:800,fontSize:12,color}}>{ci+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{s.city}</div>
                  {s.pdv>0&&<div style={{fontSize:11,color:MUTED}}>{s.pdv} PDVs</div>}
                </div>
                <Tag color={color} sm>{isOrigen?"Origen":st?.status==="entregado"?"✓ Entregado":st?.status==="llegue"?"En sitio":st?.status==="problema"?"⚠ Problema":"Pendiente"}</Tag>
              </div>
              {st&&(st.receptor||st.notas||st.fotoURL)&&<div style={{background:"#f8fafd",borderRadius:10,padding:"10px 12px",marginBottom:8,marginTop:6}}>
                {st.receptor&&<div style={{fontSize:12}}><strong>Recibió:</strong> {st.receptor}</div>}
                {st.notas&&<div style={{fontSize:12,color:MUTED,marginTop:3}}>📝 {st.notas}</div>}
                {st.ts&&<div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginTop:4}}>{new Date(st.ts).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"})}</div>}
                {st.fotoURL&&<button onClick={()=>setPhotoModal(st.fotoURL)} className="btn" style={{marginTop:8,display:"flex",alignItems:"center",gap:6,background:A+"10",border:"1.5px solid "+A+"30",color:A,borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700}}><Camera size={12}/>Ver evidencia</button>}
              </div>}
              {s.puntos?.length>0&&<div style={{marginTop:6}}>
                {s.puntos.map((p,pi)=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderTop:pi>0?"1px solid "+BORDER:"none"}}>
                    <MapPin size={11} color={VIOLET} style={{flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                      <div style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.address}</div>
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          );
        })}

        <div style={{textAlign:"center",marginTop:20,padding:"16px",color:MUTED,fontSize:10,borderTop:"1px solid "+BORDER+"60"}}>
          🚚 DMvimiento Logistics · Actualización en tiempo real
        </div>
      </div>

      {/* Photo modal */}
      {photoModal&&<div onClick={()=>setPhotoModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer"}}>
        <button onClick={()=>setPhotoModal(null)} className="btn" style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,.15)",color:"#fff",borderRadius:"50%",width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center"}}><X size={20}/></button>
        <img src={photoModal} alt="evidencia" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:12}}/>
      </div>}
    </div>
  );
}

/* ─── ROOT APP ───────────────────────────────────────────────────────────── */
export default function App(){
  const path = typeof window!=="undefined"?window.location.pathname:"";
  // /chofer route — driver PWA
  if(path.startsWith("/chofer")){
    return(<><style>{CSS}</style><ChoferApp/></>);
  }
  // /track/:id route — public tracking page
  const trackMatch = path.match(/^\/track\/([A-Z0-9]+)/i);
  if(trackMatch){
    return(<><style>{CSS}</style><ClientTracking trackingId={trackMatch[1].toUpperCase()}/></>);
  }

  const [view,setView]=useState("dashboard");
  const [cots,setCots]=useState([]);
  const [facts,setFacts]=useState([]);
  const [rutas,setRutas]=useState([]);
  const [entregas,setEntregas]=useState([]);
  const [viat,setViat]=useState([]);
  const [clientes,setClientes]=useState([]);
  const [prospectos,setProspectos]=useState([]);
  const [choferes,setChoferes]=useState([]);
  const [fbOk,setFbOk]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [searchOpen,setSearchOpen]=useState(false);
  const [installPrompt,setInstallPrompt]=useState(null);
  const [showInstallBanner,setShowInstallBanner]=useState(false);

  // PWA install prompt
  useEffect(()=>{
    const h=(e)=>{e.preventDefault();setInstallPrompt(e);
      if(!localStorage.getItem("dmov_install_dismissed")) setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt",h);
    return()=>window.removeEventListener("beforeinstallprompt",h);
  },[]);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"cotizaciones"),s=>{setCots(s.docs.map(d=>({id:d.id,...d.data()})));setFbOk(true);});
    const u2=onSnapshot(collection(db,"facturas"),s=>setFacts(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3=onSnapshot(collection(db,"rutas"),s=>setRutas(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u4=onSnapshot(collection(db,"entregas"),s=>setEntregas(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u5=onSnapshot(collection(db,"viaticos"),s=>setViat(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u6=onSnapshot(collection(db,"cuentas"),s=>setClientes(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u7=onSnapshot(collection(db,"prospeccion"),s=>setProspectos(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u8=onSnapshot(collection(db,"choferes"),s=>setChoferes(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();u3();u4();u5();u6();u7();u8();};
  },[]);

  // Cmd+K shortcut
  useEffect(()=>{
    const h=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setSearchOpen(o=>!o);}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  // Responsive sidebar
  useEffect(()=>{
    const h=()=>{if(window.innerWidth<768)setSidebarOpen(false);};
    h();window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);
  },[]);

  const VIEWS={
    dashboard:<Dashboard setView={setView} cots={cots} facts={facts} rutas={rutas} entregas={entregas} viat={viat} clientes={clientes} prospectos={prospectos}/>,
    cotizador:<Cotizador onSaved={()=>setView("dashboard")}/>,
    presupuestos:<Presupuestos/>,
    prospeccion:<Prospeccion/>,
    choferes:<Choferes/>,
    tracking:<LiveTracking/>,
    rutas:<PlanificadorRutas/>,
    nacional:<PlanificadorNacional/>,
    facturas:<Facturas/>,
    viaticos:<Viaticos/>,
    clientes:<Clientes/>,
    entregas:<Entregas/>,
  };

  return(
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",minHeight:"100vh",background:"#f1f4fb",color:TEXT,fontFamily:SANS}}>
        <Sidebar view={view} setView={v=>{setView(v);if(window.innerWidth<768)setSidebarOpen(false);}} stats={{cot:cots.length,fac:facts.length,rut:rutas.length,fb:fbOk}} open={sidebarOpen} setOpen={setSidebarOpen}/>
        <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:"100vh",overflow:"hidden"}}>
          <TopBar view={view} setView={setView} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} setSearchOpen={setSearchOpen}/>
          <main style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
            {VIEWS[view]||VIEWS.dashboard}
          </main>
        </div>
      </div>
      {searchOpen&&<SearchPalette cots={cots} facts={facts} rutas={rutas} clientes={clientes} entregas={entregas} onSelect={v=>setView(v)} onClose={()=>setSearchOpen(false)}/>}
      {showInstallBanner&&installPrompt&&<div style={{position:"fixed",bottom:16,right:16,zIndex:200,background:"#fff",borderRadius:14,padding:"14px 18px",boxShadow:"0 16px 50px rgba(12,24,41,.2)",border:"1.5px solid "+A+"30",display:"flex",alignItems:"center",gap:12,maxWidth:380}}>
        <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:14,color:"#fff",flexShrink:0}}>DM</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:13}}>Instalar app DMvimiento</div>
          <div style={{fontSize:11,color:MUTED}}>Acceso rápido desde tu home screen</div>
        </div>
        <button onClick={async()=>{installPrompt.prompt();const r=await installPrompt.userChoice;if(r.outcome==="accepted"){localStorage.setItem("dmov_install_dismissed","1");}setShowInstallBanner(false);setInstallPrompt(null);}} className="btn" style={{background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:9,padding:"8px 14px",fontSize:12,fontWeight:700}}>Instalar</button>
        <button onClick={()=>{localStorage.setItem("dmov_install_dismissed","1");setShowInstallBanner(false);}} className="btn" style={{color:MUTED,fontSize:10}}>✕</button>
      </div>}
    </>
  );
}
