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
import XLSX from "xlsx-js-style";
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
  /* Municipios EdoMex zona conurbada (todos abrazados al ZMVM) */
  "Naucalpan":[-99.30,19.45,-99.13,19.55],
  "Tlalnepantla":[-99.27,19.50,-99.13,19.60],
  "Atizapán de Zaragoza":[-99.32,19.52,-99.20,19.62],
  "Cuautitlán Izcalli":[-99.30,19.60,-99.16,19.72],
  "Cuautitlán":[-99.22,19.65,-99.10,19.72],
  "Tultitlán":[-99.22,19.62,-99.10,19.72],
  "Coacalco":[-99.13,19.62,-99.04,19.70],
  "Ecatepec":[-99.12,19.55,-98.95,19.70],
  "Nezahualcóyotl":[-99.05,19.38,-98.95,19.46],
  "Chimalhuacán":[-99.00,19.39,-98.88,19.48],
  "Los Reyes La Paz":[-99.02,19.34,-98.92,19.40],
  "Ixtapaluca":[-99.00,19.25,-98.82,19.35],
  "Chalco":[-98.97,19.20,-98.82,19.32],
  "Valle de Chalco":[-99.00,19.27,-98.92,19.34],
  "Texcoco":[-98.95,19.45,-98.80,19.58],
  "Nicolás Romero":[-99.36,19.60,-99.25,19.72],
  "Tepotzotlán":[-99.30,19.66,-99.17,19.78],
  "Huehuetoca":[-99.30,19.78,-99.10,19.92],
  "Zumpango":[-99.18,19.75,-99.00,19.88],
  "Tecámac":[-99.06,19.65,-98.92,19.76],
  "Lerma":[-99.55,19.22,-99.40,19.40],
  "Metepec":[-99.65,19.20,-99.50,19.32],
  "Atlacomulco":[-99.95,19.75,-99.80,19.90],
  "Tenancingo":[-99.65,18.93,-99.50,19.05],
  "Valle de Bravo":[-100.20,19.13,-100.05,19.30],
  "Ixtlahuaca":[-99.85,19.50,-99.70,19.65],
  "Tejupilco":[-100.25,18.85,-100.05,19.05],
  /* Otras ciudades nuevas con bbox para precisión geográfica */
  "Cabo San Lucas":[-109.95,22.85,-109.85,22.95],
  "San José del Cabo":[-109.78,23.02,-109.65,23.12],
  "Loreto":[-111.40,25.95,-111.25,26.10],
  "Manzanillo":[-104.40,19.00,-104.25,19.15],
  "Uruapan":[-102.10,19.35,-101.95,19.50],
  "Pátzcuaro":[-101.65,19.45,-101.55,19.58],
  "Tehuacán":[-97.45,18.40,-97.30,18.55],
  "Atlixco":[-98.50,18.85,-98.35,19.00],
  "Cuautla":[-98.99,18.75,-98.85,18.90],
  "Cholula":[-98.35,19.00,-98.20,19.12],
  "Córdoba":[-97.05,18.85,-96.85,18.95],
  "Tula":[-99.45,20.00,-99.30,20.13],
  "Tulancingo":[-98.45,20.00,-98.30,20.15],
  "Tuxpan":[-97.50,20.90,-97.30,21.05],
  "Salamanca":[-101.25,20.50,-101.10,20.65],
  "San Miguel de Allende":[-100.80,20.85,-100.65,20.98],
  "Dolores Hidalgo":[-100.95,21.10,-100.80,21.25],
  "Guanajuato (capital)":[-101.32,21.00,-101.20,21.10],
  "Pénjamo":[-101.78,20.35,-101.65,20.50],
  "Lagos de Moreno":[-101.95,21.30,-101.80,21.45],
  "Tepatitlán":[-102.85,20.75,-102.70,20.90],
  "Zapopan":[-103.50,20.65,-103.30,20.85],
  "Tlaquepaque":[-103.40,20.55,-103.25,20.70],
  "Lázaro Cárdenas":[-102.25,17.90,-102.10,18.05],
  "Tehuantepec":[-95.30,16.27,-95.15,16.40],
  "Salina Cruz":[-95.27,16.10,-95.10,16.25],
  "Huatulco":[-96.20,15.70,-95.95,15.85],
  "Puerto Escondido":[-97.13,15.80,-96.98,15.95],
  "San Cristóbal de las Casas":[-92.70,16.68,-92.55,16.80],
  "Comitán":[-92.20,16.18,-92.05,16.30],
  "Palenque":[-92.10,17.45,-91.95,17.58],
  "Tulum":[-87.50,20.10,-87.35,20.25],
  "Playa del Carmen":[-87.15,20.55,-86.95,20.75],
  "Bacalar":[-88.45,18.60,-88.30,18.75],
  "Progreso":[-89.75,21.20,-89.60,21.35],
  "Ciudad del Carmen":[-91.95,18.55,-91.75,18.70],
  "Cabo San Lucas":[-109.95,22.85,-109.85,22.95],
  "Nogales":[-111.05,31.25,-110.90,31.40],
  "Nuevo Laredo":[-99.65,27.40,-99.45,27.60],
  "San Pedro Garza García":[-100.43,25.62,-100.35,25.72],
  "San Nicolás":[-100.32,25.72,-100.22,25.82],
  "Apodaca":[-100.22,25.72,-100.10,25.85],
  "Santa Catarina":[-100.55,25.62,-100.42,25.72],
  "Guadalupe NL":[-100.30,25.65,-100.18,25.78],
  "Linares":[-99.65,24.78,-99.50,24.92],
  "Guasave":[-108.55,25.50,-108.40,25.65],
  "Navojoa":[-109.50,27.00,-109.35,27.15],
  "Guaymas":[-110.95,27.85,-110.80,28.05],
  "Mante":[-99.05,22.65,-98.90,22.80],
  "Ciudad Valles":[-99.10,21.95,-98.95,22.10],
  "Matehuala":[-100.70,23.60,-100.55,23.75],
  "Fresnillo":[-102.95,23.13,-102.80,23.25],
  "Cuauhtémoc":[-106.95,28.35,-106.80,28.50],
  "Delicias":[-105.55,28.13,-105.40,28.25],
  "Tequila":[-103.90,20.85,-103.75,21.00],
  "Tequisquiapan":[-99.95,20.45,-99.80,20.62],
  "Bahía de Banderas":[-105.40,20.65,-105.25,20.85],
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
@keyframes pulseHalo{0%,100%{opacity:.85;transform:scale(1.45)}50%{opacity:.25;transform:scale(2.3)}}
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
.hide-mobile{display:initial}
.show-mobile{display:none}
.hamburger-btn{display:none!important}
.mobile-backdrop{display:none;position:fixed;inset:0;background:rgba(12,24,41,.55);z-index:199;backdrop-filter:blur(3px)}
/* Safe-area para iPhone con notch */
.safe-pad-top{padding-top:env(safe-area-inset-top,0)}
.safe-pad-bottom{padding-bottom:env(safe-area-inset-bottom,0)}
@media(max-width:1280px){
  .g4{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:1024px){
  .g4{grid-template-columns:repeat(2,1fr);gap:10px}
  .g3{grid-template-columns:repeat(2,1fr)}
  .g2-side{grid-template-columns:1fr;gap:12px}
}
@media(max-width:768px){
  .g4,.g3,.g2{grid-template-columns:repeat(2,1fr);gap:8px}
  .g2-side{grid-template-columns:1fr}
  .hide-mobile{display:none!important}
  .show-mobile{display:initial!important}
  .btn{min-height:40px}
  .sidebar-desktop{transform:translateX(-100%);position:fixed;z-index:200;top:0;bottom:0;box-shadow:0 0 40px rgba(0,0,0,.5)}
  .sidebar-desktop.open{transform:translateX(0)}
  .mobile-backdrop{display:block}
  .hamburger-btn{display:flex!important}
  /* Reducir padding interno de todas las vistas principales */
  main > div{padding-left:14px!important;padding-right:14px!important}
  main > div[style*="padding: 28px 32px"], main > div[style*="padding:28px 32px"]{padding:18px 14px!important}
  main > div[style*="padding: 24px 28px"], main > div[style*="padding:24px 28px"]{padding:16px 14px!important}
  main h1{font-size:22px!important}
  /* Tablas scroll horizontal con borde visible */
  table{min-width:600px}
  .table-wrap{border-radius:12px}
  /* Textos de KPI más compactos */
  .kpi-card-value{font-size:18px!important}
  /* TopBar */
  .topbar-search{max-width:none!important}
  .topbar-search span:first-of-type{display:none}
}
@media(max-width:480px){
  .g4,.g3{grid-template-columns:1fr}
  .g4.g4-force-2,.g3.g3-force-2{grid-template-columns:repeat(2,1fr)}
  .g4,.g3,.g2{gap:8px}
  main h1{font-size:19px!important;letter-spacing:-0.02em!important}
  main > div{padding:14px 12px!important}
  .btn{font-size:12px}
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
/* Helper: calcula tarifas por km basado en estructura promedio del tarifario.
   Usado para las ciudades que se agregan masivamente sin precio publicado.
   - Local zone (<50km): usa estructura urbana CDMX
   - Foráneo: tarifa = base + km * factor
   Los precios pueden ajustarse manualmente después en el módulo de admin. */
const _T = (km,zona="foraneo")=>{
  if(zona==="local-edomex"){
    // Zona conurbada CDMX/EdoMex (<50km) — usa estructura local CDMX con pequeño extra por km
    return {km,eur:2500+km*30,cam:3200+km*45,kra:3600+km*50};
  }
  if(zona==="metro-edomex"){
    // Edomex zona metro extendida 50-120km
    return {km,eur:Math.round(2500+km*38),cam:Math.round(3200+km*60),kra:Math.round(3600+km*68)};
  }
  if(km<200){
    // Foráneo cercano
    return {km,eur:Math.round(2500+km*32),cam:Math.round(3500+km*55),kra:Math.round(4000+km*62)};
  }
  if(km<500){
    return {km,eur:Math.round(km*32),cam:Math.round(km*48),kra:Math.round(km*54)};
  }
  if(km<1000){
    return {km,eur:Math.round(km*30),cam:Math.round(km*42),kra:Math.round(km*46)};
  }
  // Largo
  return {km,eur:Math.round(km*28),cam:Math.round(km*38),kra:Math.round(km*42)};
};

const TAR = [
  /* ═══ CDMX Y ZONA METROPOLITANA ═══ */
  {c:"Ciudad de México",km:0,eur:2500,cam:3200,kra:3600,local:true},
  {c:"Estado de México",km:30,eur:3400,cam:4500,kra:5100,local:true},
  // Municipios EdoMex zona conurbada (servicio local extendido)
  {c:"Naucalpan",...{..._T(15,"local-edomex"),km:15},local:true},
  {c:"Tlalnepantla",...{..._T(18,"local-edomex"),km:18},local:true},
  {c:"Atizapán de Zaragoza",...{..._T(25,"local-edomex"),km:25},local:true},
  {c:"Cuautitlán Izcalli",...{..._T(30,"local-edomex"),km:30},local:true},
  {c:"Cuautitlán",...{..._T(33,"local-edomex"),km:33},local:true},
  {c:"Tultitlán",...{..._T(28,"local-edomex"),km:28},local:true},
  {c:"Coacalco",...{..._T(28,"local-edomex"),km:28},local:true},
  {c:"Ecatepec",...{..._T(20,"local-edomex"),km:20},local:true},
  {c:"Nezahualcóyotl",...{..._T(15,"local-edomex"),km:15},local:true},
  {c:"Chimalhuacán",...{..._T(22,"local-edomex"),km:22},local:true},
  {c:"Los Reyes La Paz",...{..._T(23,"local-edomex"),km:23},local:true},
  {c:"Ixtapaluca",...{..._T(35,"local-edomex"),km:35},local:true},
  {c:"Chalco",...{..._T(38,"local-edomex"),km:38},local:true},
  {c:"Valle de Chalco",...{..._T(32,"local-edomex"),km:32},local:true},
  {c:"Texcoco",...{..._T(42,"local-edomex"),km:42},local:true},
  {c:"Nicolás Romero",...{..._T(28,"local-edomex"),km:28},local:true},
  {c:"Tepotzotlán",..._T(38,"metro-edomex")},
  {c:"Huehuetoca",..._T(50,"metro-edomex")},
  {c:"Zumpango",..._T(55,"metro-edomex")},
  {c:"Tecámac",..._T(38,"metro-edomex")},
  {c:"Lerma",..._T(55,"metro-edomex")},
  {c:"Metepec",..._T(70,"metro-edomex")},
  {c:"Atlacomulco",..._T(110,"metro-edomex")},
  {c:"Tenancingo",..._T(95,"metro-edomex")},
  {c:"Valle de Bravo",..._T(140,"metro-edomex")},
  {c:"Ixtlahuaca",..._T(95,"metro-edomex")},
  {c:"Tejupilco",..._T(160,"metro-edomex")},
  // CDMX original cities ya en el tarifario
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

  /* ═══ NUEVOS DESTINOS NACIONALES ═══ */
  // Bajío y Centro
  {c:"San Miguel de Allende",..._T(280)},
  {c:"Dolores Hidalgo",..._T(290)},
  {c:"Guanajuato (capital)",..._T(360)},
  {c:"Salamanca",..._T(303)},
  {c:"Pénjamo",..._T(345)},
  {c:"Acámbaro",..._T(245)},
  {c:"La Piedad",..._T(395)},
  {c:"Lagos de Moreno",..._T(465)},
  {c:"Tepatitlán",..._T(513)},
  {c:"Ocotlán",..._T(515)},
  {c:"Ciudad Guzmán",..._T(615)},
  {c:"Tequila",..._T(605)},
  // Morelos
  {c:"Cuautla",..._T(106)},
  {c:"Yautepec",..._T(105)},
  {c:"Jojutla",..._T(125)},
  {c:"Temixco",..._T(95)},
  // Puebla
  {c:"Cholula",..._T(125)},
  {c:"Atlixco",..._T(150)},
  {c:"Tehuacán",..._T(245)},
  {c:"Teziutlán",..._T(235)},
  {c:"Huejotzingo",..._T(110)},
  // Hidalgo
  {c:"Tula",..._T(85)},
  {c:"Tulancingo",..._T(125)},
  {c:"Actopan",..._T(140)},
  {c:"Huejutla",..._T(345)},
  // Querétaro adicional
  {c:"El Marqués",..._T(220)},
  {c:"Corregidora",..._T(215)},
  {c:"Tequisquiapan",..._T(180)},
  {c:"San Juan del Río Oeste",..._T(165)},
  // Tlaxcala
  {c:"Apetatitlán",..._T(118)},
  {c:"Calpulalpan",..._T(145)},
  // Veracruz
  {c:"Córdoba",..._T(265)},
  {c:"Cardel",..._T(385)},
  {c:"Catemaco",..._T(495)},
  {c:"Tuxtepec",..._T(530)},
  {c:"Coatepec",..._T(335)},
  // Oaxaca
  {c:"Tehuantepec",..._T(720)},
  {c:"Salina Cruz",..._T(740)},
  {c:"Pinotepa Nacional",..._T(660)},
  {c:"Huatulco",..._T(795)},
  {c:"Puerto Escondido",..._T(745)},
  {c:"Juchitán",..._T(735)},
  // Chiapas
  {c:"San Cristóbal de las Casas",..._T(1095)},
  {c:"Comitán",..._T(1170)},
  {c:"Palenque",..._T(1100)},
  {c:"Tonalá",..._T(1095)},
  // Guerrero
  {c:"Zihuatanejo",..._T(645)},
  {c:"Ixtapa",..._T(650)},
  {c:"Cuajinicuilapa",..._T(540)},
  // Michoacán
  {c:"Uruapan",..._T(420)},
  {c:"Pátzcuaro",..._T(370)},
  {c:"Lázaro Cárdenas",..._T(625)},
  {c:"Apatzingán",..._T(480)},
  {c:"Sahuayo",..._T(465)},
  {c:"Zitácuaro",..._T(155)},
  // Jalisco adicional
  {c:"Zapopan",..._T(545)},
  {c:"Tlaquepaque",..._T(540)},
  {c:"Tonalá Jal.",..._T(548)},
  {c:"Chapala",..._T(595)},
  // Colima adicional
  {c:"Manzanillo",..._T(840)},
  {c:"Tecomán",..._T(795)},
  // Nayarit
  {c:"Bahía de Banderas",..._T(885)},
  {c:"Compostela",..._T(815)},
  {c:"Acaponeta",..._T(900)},
  // Sinaloa
  {c:"Guasave",..._T(1395)},
  {c:"Escuinapa",..._T(1015)},
  {c:"El Rosario",..._T(1075)},
  // Sonora
  {c:"Navojoa",..._T(1735)},
  {c:"Guaymas",..._T(1815)},
  {c:"Empalme",..._T(1820)},
  {c:"Nogales",..._T(2185)},
  {c:"Agua Prieta",..._T(2100)},
  {c:"Caborca",..._T(2295)},
  {c:"San Luis Río Colorado",..._T(2470)},
  // Baja California
  {c:"Rosarito",..._T(2865)},
  {c:"Tecate",..._T(2790)},
  {c:"San Felipe",..._T(2845)},
  // Baja California Sur
  {c:"Cabo San Lucas",..._T(4360)},
  {c:"San José del Cabo",..._T(4385)},
  {c:"Loreto",..._T(3865)},
  // Coahuila
  {c:"Nueva Rosita",..._T(1120)},
  {c:"Sabinas",..._T(1140)},
  {c:"Acuña",..._T(1300)},
  {c:"Frontera",..._T(1015)},
  {c:"Parras",..._T(880)},
  // Nuevo León adicional
  {c:"San Pedro Garza García",..._T(940)},
  {c:"San Nicolás",..._T(940)},
  {c:"Guadalupe NL",..._T(940)},
  {c:"Apodaca",..._T(950)},
  {c:"Santa Catarina",..._T(945)},
  {c:"Linares",..._T(1100)},
  {c:"Sabinas Hidalgo",..._T(1015)},
  {c:"Cadereyta NL",..._T(975)},
  // Tamaulipas adicional
  {c:"Nuevo Laredo",..._T(1120)},
  {c:"Río Bravo",..._T(990)},
  {c:"Altamira",..._T(485)},
  {c:"Mante",..._T(635)},
  {c:"Madero",..._T(490)},
  {c:"Soto la Marina",..._T(800)},
  // San Luis Potosí adicional
  {c:"Ciudad Valles",..._T(625)},
  {c:"Matehuala",..._T(615)},
  {c:"Río Verde",..._T(545)},
  // Zacatecas adicional
  {c:"Fresnillo",..._T(660)},
  {c:"Jerez",..._T(665)},
  {c:"Sombrerete",..._T(770)},
  // Chihuahua adicional
  {c:"Cuauhtémoc",..._T(1640)},
  {c:"Delicias",..._T(1430)},
  {c:"Parral",..._T(1235)},
  {c:"Camargo",..._T(1290)},
  // Durango adicional
  {c:"Santiago Papasquiaro",..._T(1075)},
  {c:"El Salto",..._T(975)},
  {c:"Lerdo",..._T(990)},
  // Aguascalientes adicional
  {c:"Jesús María",..._T(525)},
  {c:"Calvillo",..._T(545)},
  {c:"Rincón de Romos",..._T(550)},
  // Yucatán
  {c:"Progreso",..._T(1365)},
  {c:"Valladolid",..._T(1480)},
  {c:"Tizimín",..._T(1530)},
  {c:"Umán",..._T(1340)},
  // Quintana Roo
  {c:"Playa del Carmen",..._T(1580)},
  {c:"Tulum",..._T(1605)},
  {c:"Bacalar",..._T(1395)},
  {c:"Mahahual",..._T(1455)},
  {c:"Holbox",..._T(1715)},
  {c:"Isla Mujeres",..._T(1660)},
  // Tabasco
  {c:"Cárdenas",..._T(815)},
  {c:"Comalcalco",..._T(845)},
  {c:"Macuspana",..._T(810)},
  {c:"Paraíso",..._T(820)},
  // Campeche
  {c:"Ciudad del Carmen",..._T(1075)},
  {c:"Champotón",..._T(1110)},
  {c:"Escárcega",..._T(1075)},
];

const VEHK = [
  {k:"eur",label:"Eurovan 1T",    cap:"8 m³", crew:1,icon:"🚐"},
  {k:"cam",label:"Camioneta 3.5T",cap:"16 m³",crew:1,icon:"🚛"},
  {k:"kra",label:"Krafter",       cap:"20 m³",crew:1,icon:"🚐"},
];

/* ═══════════════════════════════════════════════════════════════════════════
   MAPEO CLIENTE → EMPRESA QUE FACTURA → PLAN
   Single source of truth. Editable desde aqui o desde el modulo Clientes
   (la oficina pide que las facturas se emitan a la empresa correcta + plan).
   ─────────────────────────────────────────────────────────────────────────── */
const CLIENTE_PLANES = [
  {
    id:"actnow",
    aliases:["ACTNOW","ACT NOW","CAMPARI","APEROL","APPEROL"],
    cliente:"Actnow",
    empresa:"PROMOCIONES AMERICA LATINA SA DE CV",
    plan:"210201 PL → Campari Promotores",
    planSolicitud:"P-210201 Campari Promotores",
    rfc:"PAL030731427",
    domicilio1:"AVENIDA INSURGENTES SUR 1814 INT 601, COL FLORIDA",
    domicilio2:"ALVARO OBREGON, CIUDAD DE MEXICO CP. 01030",
    regimenFiscal:"(601) GENERAL DE LEY PERSONAS MORALES",
    color:"#dc2626",
  },
  {
    id:"scj",
    aliases:["SCJ","S.C.J.","SCJ PROMOTORES","SCJ JOHNSON"],
    cliente:"SCJ",
    empresa:"MARKETING AND PROMOTIONS SA DE CV",
    plan:"10344 MAP → SCJ Promotores Operación",
    planSolicitud:"P-10344 MAP SCJ Promotores Operación",
    rfc:"MAP_RFC_PENDIENTE", // ⚠ pendiente capturar — editable desde admin
    domicilio1:"PENDIENTE - CAPTURAR DOMICILIO",
    domicilio2:"",
    regimenFiscal:"(601) GENERAL DE LEY PERSONAS MORALES",
    color:"#2563eb",
  },
  {
    id:"canon",
    aliases:["CANON","CANNON"],
    cliente:"Canon",
    empresa:"GMAP OPERADORA SA DE CV",
    plan:"202003 GMAP → Canon Promotores",
    planSolicitud:"P-202003 GMAP Canon Promotores",
    rfc:"GMAP_RFC_PENDIENTE",
    domicilio1:"PENDIENTE - CAPTURAR DOMICILIO",
    domicilio2:"",
    regimenFiscal:"(601) GENERAL DE LEY PERSONAS MORALES",
    color:"#059669",
  },
  {
    id:"robots",
    aliases:["ROBOTS","BOTMATE","POD ROBOTS","ROBOT","BOT"],
    cliente:"Robots / POD",
    empresa:"PROMOTOR ON DEMAND SA DE CV",
    plan:"212802 POD Robots",
    planSolicitud:"P-212802 POD Robots",
    rfc:"POD_RFC_PENDIENTE",
    domicilio1:"PENDIENTE - CAPTURAR DOMICILIO",
    domicilio2:"",
    regimenFiscal:"(601) GENERAL DE LEY PERSONAS MORALES",
    color:"#7c3aed",
  },
  {
    id:"map_varios",
    aliases:["MAP","SOFIA TRUEBA","SOFIA","TRUEBA","ALEJANDRA TRUEBA","VARIOS"],
    cliente:"MAP / Sofía Trueba",
    empresa:"MARKETING AND PROMOTION",
    plan:"12801 MAP → Varios 2011",
    planSolicitud:"P-12801 MAP Varios 2011",
    rfc:"MAP2_RFC_PENDIENTE",
    domicilio1:"PENDIENTE - CAPTURAR DOMICILIO",
    domicilio2:"",
    regimenFiscal:"(601) GENERAL DE LEY PERSONAS MORALES",
    color:"#d97706",
  },
];

/* Constantes "siempre iguales" que aparecen en cada solicitud de factura.
   Editables aquí si la oficina cambia algún catalogo SAT. */
const SOLICITUD_FACTURA_CONFIG = {
  empresaEmisora: "D EN MOVIMIENTO",
  ciudadExpedicion: "ESTA FACTURA SE EXPIDE EN LA CIUDAD DE MEXICO",
  metodoPago: "PPD (PAGO EN PARCIALIDADES O DIFERIDO)",
  formaPago: "99 (POR DEFINIR)",
  usoCFDI: "G01 (ADQUISICION DE MERCANCIA)",
  claveProductoServicio: "81141601 Logística Maniobras terrestre",
  atn: "IVAN CADAVIECO",
  numeroPlanDmovimiento: "PLAN 142804 SERVICIOS DE LOGISTICA",
};

/* Quita acentos y normaliza para matching tolerante */
const _norm = (s)=>(s||"").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
/* Busca el plan correspondiente al cliente (matching fuzzy por alias) */
function lookupPlanForCliente(rawCliente){
  if(!rawCliente) return null;
  const q = _norm(rawCliente);
  // Match exacto o por alias contenido
  for(const cp of CLIENTE_PLANES){
    if(cp.aliases.some(a=>{
      const an = _norm(a);
      // Match si el query contiene el alias o viceversa (mínimo 3 chars para evitar falsos positivos)
      if(an.length<3) return q===an;
      return q===an||q.includes(an)||an.includes(q);
    })) return cp;
  }
  return null;
}

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
const NUM_FMT = '#,##0.00;\\(#,##0.00\\);\\-';
const PCT_FMT = '0.0%;\\(0.0%\\);\\-';
// Paleta oficial — replica formato Botmate (oficina)
const XC = {
  // Fondos
  TITLE_BG:   "1F3864", // azul marino header
  SUBTITLE_BG:"F2F2F2", // gris claro leyenda
  HEADER_BG:  "2E75B6", // azul medio headers columnas
  MONTH_BG:   "D9E1F2", // azul claro separador mes
  SUBTOTAL_BG:"D6E4F0", // azul muy claro subtotal
  ROW_ALT:    "F5F5F5", // zebra gris
  ROW_WHITE:  "FFFFFF",
  // Status chips
  OK_BG:      "C6EFCE", // verde claro PAGADO
  OK_TX:      "276221",
  WARN_BG:    "FFEB9C", // amarillo claro PENDIENTE
  WARN_TX:    "9C5700",
  BAD_BG:     "FFC7CE", // rojo claro VENCIDO / POR COBRAR
  BAD_TX:     "9C0006",
  // Texto categorías P&L
  INCOME_TX:  "276221", // verde ingresos
  COST_TX:    "185FA5", // azul costos
  TOTAL_TX:   "1F3864", // marino totales
  MUTED_TX:   "888888",
  WHITE:      "FFFFFF",
  // Costos categorizados
  SUELDOS_BG: "D6E8F7", SUELDOS_TX:"185FA5",
  REDES_BG:   "D8F0E8", REDES_TX:  "0F6E56",
  PROG_BG:    "FCE8CC", PROG_TX:   "854F0B",
};
// Estilos base reutilizables
const BORDER_THIN = {top:{style:"thin",color:{rgb:"CCCCCC"}},bottom:{style:"thin",color:{rgb:"CCCCCC"}},left:{style:"thin",color:{rgb:"CCCCCC"}},right:{style:"thin",color:{rgb:"CCCCCC"}}};
const styleTitle = {font:{name:"Arial",sz:14,bold:true,color:{rgb:XC.WHITE}},fill:{patternType:"solid",fgColor:{rgb:XC.TITLE_BG}},alignment:{horizontal:"center",vertical:"center"}};
const styleSubtitle = {font:{name:"Arial",sz:8,color:{rgb:"444444"}},fill:{patternType:"solid",fgColor:{rgb:XC.SUBTITLE_BG}},alignment:{horizontal:"left",vertical:"center"}};
const styleColHeader = {font:{name:"Arial",sz:9,bold:true,color:{rgb:XC.WHITE}},fill:{patternType:"solid",fgColor:{rgb:XC.HEADER_BG}},alignment:{horizontal:"center",vertical:"center",wrapText:true},border:BORDER_THIN};
const styleMonthRow = {font:{name:"Arial",sz:10,bold:true,color:{rgb:XC.TITLE_BG}},fill:{patternType:"solid",fgColor:{rgb:XC.MONTH_BG}},alignment:{horizontal:"left",vertical:"center"},border:BORDER_THIN};
const styleSubtotalRow = {font:{name:"Arial",sz:9,bold:true,color:{rgb:XC.TITLE_BG}},fill:{patternType:"solid",fgColor:{rgb:XC.SUBTOTAL_BG}},alignment:{horizontal:"right",vertical:"center"},border:BORDER_THIN};
const styleSubtotalLabel = {...styleSubtotalRow,alignment:{horizontal:"left",vertical:"center"}};
const styleGrandTotal = {font:{name:"Arial",sz:11,bold:true,color:{rgb:XC.WHITE}},fill:{patternType:"solid",fgColor:{rgb:XC.TITLE_BG}},alignment:{horizontal:"right",vertical:"center"},border:BORDER_THIN};
const styleGrandTotalLabel = {...styleGrandTotal,alignment:{horizontal:"left",vertical:"center"}};
const styleCell = (row,opts={})=>({
  font:{name:"Arial",sz:9,color:{rgb:opts.color||"222222"},bold:!!opts.bold},
  fill:{patternType:"solid",fgColor:{rgb:opts.bg||(row%2===0?XC.ROW_WHITE:XC.ROW_ALT)}},
  alignment:{horizontal:opts.align||"left",vertical:"center",wrapText:!!opts.wrap},
  border:BORDER_THIN,
  ...(opts.nf?{numFmt:opts.nf}:{}),
});
const styleStatusChip = (status)=>{
  const s = (status||"").toUpperCase();
  if(s==="PAGADO"||s==="PAGADA") return {bg:XC.OK_BG,color:XC.OK_TX,text:"PAGADO"};
  if(s==="PENDIENTE") return {bg:XC.WARN_BG,color:XC.WARN_TX,text:"PENDIENTE"};
  if(s==="VENCIDA"||s==="VENCIDO"||s==="POR COBRAR"||s==="CANCELADA") return {bg:XC.BAD_BG,color:XC.BAD_TX,text:s==="CANCELADA"?"CANCELADA":(s==="VENCIDA"||s==="VENCIDO"?"VENCIDA":"POR COBRAR")};
  return {bg:"E0E0E0",color:"555555",text:s||"—"};
};
// Aplica un estilo a una celda concreta, creando la celda si no existe
function setCell(ws, addr, value, style, numFmt){
  if(value===undefined||value===null||value==="") value="";
  const isNum = typeof value==="number";
  ws[addr] = {t: isNum?"n":"s", v: value};
  if(numFmt) ws[addr].z = numFmt;
  if(style) ws[addr].s = {...style, ...(numFmt?{numFmt}:{})};
}
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
function buildAOA(header, rows){ return [header, ...rows]; }

/* ═══════ HELPER: construye una hoja "Relación de Facturas" con formato Botmate
   Genera secciones por mes, subtotales, chips de estatus, grand totals.
   Retorna la hoja (ws) lista para appendear al workbook. */
function buildRelacionFacturasSheet(facts, brand, year){
  const MESES_FULL=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  const MESES_ABBR=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const ws = {};
  const merges = [];
  const rowHeights = [];
  let r = 0;

  // ROW 1: Título (merged A:J)
  setCell(ws,"A"+(r+1),`REPORTE DE FACTURACIÓN  —  ${brand}  |  ${year}`,styleTitle);
  merges.push({s:{r,c:0},e:{r,c:9}});
  rowHeights[r]=32; r++;

  // ROW 2: Leyenda (merged A:J)
  setCell(ws,"A"+(r+1),"  LEYENDA:   ■ PAGADO   ■ PENDIENTE   ■ POR COBRAR (operación cerrada, depósito en proceso)",styleSubtitle);
  merges.push({s:{r,c:0},e:{r,c:9}});
  rowHeights[r]=16; r++;

  // ROW 3: Headers columnas
  const headers = ["#","CLIENTE / EMPRESA","DESCRIPCIÓN / PLAN","# FACTURA","FECHA FACTURA","PERIODO / DEPÓSITO","SUBTOTAL (s/IVA)","IVA (16%)","TOTAL (c/IVA)","ESTATUS"];
  headers.forEach((h,i)=>setCell(ws,XLSX.utils.encode_cell({r,c:i}),h,styleColHeader));
  rowHeights[r]=28; r++;

  // Agrupa facturas por mes+año
  const grouped = {};
  facts.forEach(f=>{
    const m = f.mesOp||"";
    const a = f.anio||year;
    const idx = MESES_ABBR.indexOf(m);
    if(idx<0) return;
    const key = a+"-"+String(idx).padStart(2,"0");
    if(!grouped[key]) grouped[key]={anio:a,mes:MESES_FULL[idx],mesIdx:idx,items:[]};
    grouped[key].items.push(f);
  });
  const orderedKeys = Object.keys(grouped).sort();

  let gSub=0,gIva=0,gTot=0,rowNumber=0;
  orderedKeys.forEach(key=>{
    const grp = grouped[key];
    // Fila de mes (merged A:J)
    setCell(ws,"A"+(r+1),`${grp.mes} ${grp.anio}`,styleMonthRow);
    for(let c=1;c<10;c++) setCell(ws,XLSX.utils.encode_cell({r,c}),"",styleMonthRow);
    merges.push({s:{r,c:0},e:{r,c:9}});
    rowHeights[r]=20; r++;
    let mSub=0,mIva=0,mTot=0;
    const startR = r;
    grp.items.forEach(f=>{
      rowNumber++;
      const sub = Number(f.subtotal||f.monto||0);
      const iva = Number(f.ivaAmt||f.iva||0);
      const tot = Number(f.total||0);
      mSub+=sub; mIva+=iva; mTot+=tot;
      const zebra = r%2===0?XC.ROW_WHITE:XC.ROW_ALT;
      const cellBase = {bg:zebra};
      // Fecha legible
      let fechaStr = f.fechaEmision||"";
      if(!fechaStr&&f.createdAt?.seconds){
        const d = new Date(f.createdAt.seconds*1000);
        fechaStr = String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
      }
      setCell(ws,XLSX.utils.encode_cell({r,c:0}),rowNumber,styleCell(r,{...cellBase,align:"center"}));
      setCell(ws,XLSX.utils.encode_cell({r,c:1}),f.empresa||f.cliente||"",styleCell(r,cellBase));
      setCell(ws,XLSX.utils.encode_cell({r,c:2}),f.plan?(f.plan+(f.servicio?" "+f.servicio:"")):(f.servicio||""),styleCell(r,cellBase));
      setCell(ws,XLSX.utils.encode_cell({r,c:3}),f.folio||"",styleCell(r,{...cellBase,align:"center"}));
      setCell(ws,XLSX.utils.encode_cell({r,c:4}),fechaStr,styleCell(r,{...cellBase,align:"center"}));
      setCell(ws,XLSX.utils.encode_cell({r,c:5}),f.periodo||f.solicitante||"",styleCell(r,cellBase));
      setCell(ws,XLSX.utils.encode_cell({r,c:6}),sub,styleCell(r,{...cellBase,align:"right"}),MONEY_FMT);
      setCell(ws,XLSX.utils.encode_cell({r,c:7}),iva,styleCell(r,{...cellBase,align:"right"}),MONEY_FMT);
      setCell(ws,XLSX.utils.encode_cell({r,c:8}),tot,styleCell(r,{...cellBase,align:"right",bold:true}),MONEY_FMT);
      const chip = styleStatusChip(f.status);
      setCell(ws,XLSX.utils.encode_cell({r,c:9}),chip.text,{
        font:{name:"Arial",sz:9,bold:true,color:{rgb:chip.color}},
        fill:{patternType:"solid",fgColor:{rgb:chip.bg}},
        alignment:{horizontal:"center",vertical:"center"},
        border:BORDER_THIN,
      });
      rowHeights[r]=22; r++;
    });
    gSub+=mSub; gIva+=mIva; gTot+=mTot;
    // Subtotal mes (A:F merged)
    setCell(ws,XLSX.utils.encode_cell({r,c:0}),`SUBTOTAL  ${grp.mes} ${grp.anio}`,styleSubtotalLabel);
    for(let c=1;c<6;c++) setCell(ws,XLSX.utils.encode_cell({r,c}),"",styleSubtotalRow);
    merges.push({s:{r,c:0},e:{r,c:5}});
    // Formulas para subtotales
    setCell(ws,XLSX.utils.encode_cell({r,c:6}),{t:"n",f:`SUM(G${startR+1}:G${r})`,v:mSub},styleSubtotalRow,MONEY_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:7}),{t:"n",f:`SUM(H${startR+1}:H${r})`,v:mIva},styleSubtotalRow,MONEY_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:8}),{t:"n",f:`SUM(I${startR+1}:I${r})`,v:mTot},styleSubtotalRow,MONEY_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:9}),"",styleSubtotalRow);
    rowHeights[r]=20; r++;
    // Separador
    r++;
  });

  // Grand totals
  const factsCurrentYear = facts.filter(f=>(f.anio||year)==year);
  const pipelineYear = year+1;
  const factsPipeline = facts.filter(f=>(f.anio||year)==pipelineYear);
  const sumY = factsCurrentYear.reduce((a,f)=>({s:a.s+Number(f.subtotal||f.monto||0),i:a.i+Number(f.ivaAmt||f.iva||0),t:a.t+Number(f.total||0)}),{s:0,i:0,t:0});
  const sumP = factsPipeline.reduce((a,f)=>({s:a.s+Number(f.subtotal||f.monto||0),i:a.i+Number(f.ivaAmt||f.iva||0),t:a.t+Number(f.total||0)}),{s:0,i:0,t:0});
  const addTotal = (label,s,i,t,style)=>{
    setCell(ws,XLSX.utils.encode_cell({r,c:0}),label,style.label);
    for(let c=1;c<6;c++) setCell(ws,XLSX.utils.encode_cell({r,c}),"",style.row);
    merges.push({s:{r,c:0},e:{r,c:5}});
    setCell(ws,XLSX.utils.encode_cell({r,c:6}),s,style.row,MONEY_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:7}),i,style.row,MONEY_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:8}),t,style.row,MONEY_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:9}),"",style.row);
    rowHeights[r]=22; r++;
  };
  if(sumY.t>0) addTotal(`TOTAL FACTURADO ${year}`,sumY.s,sumY.i,sumY.t,{label:styleSubtotalLabel,row:styleSubtotalRow});
  if(sumP.t>0) addTotal(`TOTAL PIPELINE ${pipelineYear} (s/IVA proyectado)`,sumP.s,sumP.i,sumP.t,{label:styleSubtotalLabel,row:styleSubtotalRow});
  addTotal(`GRAN TOTAL GENERAL ${year}${sumP.t>0?" + "+pipelineYear:""}`,gSub,gIva,gTot,{label:styleGrandTotalLabel,row:styleGrandTotal});

  // Final
  ws["!ref"] = "A1:J"+r;
  ws["!cols"] = [{wch:5},{wch:26},{wch:36},{wch:13},{wch:15},{wch:28},{wch:15},{wch:13},{wch:15},{wch:13}];
  ws["!merges"] = merges;
  ws["!rows"] = rowHeights.map(h=>({hpt:h||15}));
  ws["!freeze"] = {xSplit:0,ySplit:3};
  return ws;
}

/* ═══════ HELPER: Hoja "Resumen P&L" formato Botmate */
function buildResumenPLSheet(facts, viat, brand, year){
  const MESES_FULL=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  const MESES_ABBR=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const ws = {};
  const merges = [];
  const rowHeights = [];
  let r = 0;

  // Título
  setCell(ws,"A"+(r+1),`RESUMEN P&L  —  ${brand}  |  ${year}`,styleTitle);
  merges.push({s:{r,c:0},e:{r,c:7}});
  rowHeights[r]=22; r++;
  // Subtítulo
  setCell(ws,"A"+(r+1),"  Ingresos facturados (sin IVA) vs Costos operativos reales  |  Fuente: Facturación + Viáticos DMvimiento",styleSubtitle);
  merges.push({s:{r,c:0},e:{r,c:7}});
  rowHeights[r]=14; r++;
  // Headers
  const headers = ["MES","INGRESOS\n(sin IVA)","SUELDOS","VIÁTICOS\n/ COMBUST.","OPERACIÓN\n/ BRANDEOS","TOTAL\nCOSTOS","UTILIDAD\nBRUTA","MARGEN %"];
  headers.forEach((h,i)=>setCell(ws,XLSX.utils.encode_cell({r,c:i}),h,styleColHeader));
  rowHeights[r]=28; r++;

  // Clasificación viáticos — adaptado a categorías DMOV
  const catSueldo = (v)=>(/sueldo|salario|nomina|n[óo]mina|apoyo gerencial|apoyo admin/i.test(v.concepto||v.tipo||v.descripcion||""));
  const catViatico = (v)=>(/comida|hotel|gasolina|caseta|peaje|viatico/i.test(v.concepto||v.tipo||v.descripcion||""));

  let gIn=0,gS=0,gR=0,gP=0,gC=0,gU=0;
  for(let mi=0;mi<12;mi++){
    const mAbbr = MESES_ABBR[mi];
    const mFull = MESES_FULL[mi];
    const monthFacts = facts.filter(f=>(f.mesOp===mAbbr&&(f.anio||year)==year));
    const ingreso = monthFacts.reduce((a,f)=>a+Number(f.subtotal||f.monto||0),0);
    // Costos del mes — matchea por mes de createdAt/fecha
    const monthViat = viat.filter(v=>{
      const ts = v.fecha?new Date(v.fecha).getTime():(v.createdAt?.seconds?v.createdAt.seconds*1000:0);
      if(!ts) return false;
      const d = new Date(ts);
      return d.getMonth()===mi && d.getFullYear()==year;
    });
    const cSueldo = monthViat.filter(catSueldo).reduce((a,v)=>a+Number(v.monto||0),0);
    const cViat = monthViat.filter(catViatico).reduce((a,v)=>a+Number(v.monto||0),0);
    const cOtro = monthViat.reduce((a,v)=>a+Number(v.monto||0),0)-cSueldo-cViat;
    const totalC = cSueldo+cViat+cOtro;
    const util = ingreso-totalC;
    const margen = ingreso>0?util/ingreso:null;
    gIn+=ingreso; gS+=cSueldo; gR+=cViat; gP+=cOtro; gC+=totalC; gU+=util;
    const zebra = r%2===0?XC.ROW_WHITE:XC.ROW_ALT;
    setCell(ws,XLSX.utils.encode_cell({r,c:0}),mFull,{...styleCell(r,{bg:zebra,bold:true,color:XC.TOTAL_TX}),alignment:{horizontal:"center",vertical:"center"}});
    setCell(ws,XLSX.utils.encode_cell({r,c:1}),ingreso,styleCell(r,{bg:zebra,align:"right",color:XC.INCOME_TX}),NUM_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:2}),cSueldo,styleCell(r,{bg:zebra,align:"right",color:XC.COST_TX}),NUM_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:3}),cViat,styleCell(r,{bg:zebra,align:"right",color:XC.COST_TX}),NUM_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:4}),cOtro,styleCell(r,{bg:zebra,align:"right",color:XC.COST_TX}),NUM_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:5}),totalC,styleCell(r,{bg:zebra,align:"right",bold:true,color:XC.TOTAL_TX}),NUM_FMT);
    // Utilidad con color
    if(util>=0){
      setCell(ws,XLSX.utils.encode_cell({r,c:6}),util,{font:{name:"Arial",sz:9,bold:true,color:{rgb:XC.OK_TX}},fill:{patternType:"solid",fgColor:{rgb:XC.OK_BG}},alignment:{horizontal:"right",vertical:"center"},border:BORDER_THIN,numFmt:NUM_FMT},NUM_FMT);
    }else{
      setCell(ws,XLSX.utils.encode_cell({r,c:6}),util,{font:{name:"Arial",sz:9,bold:true,color:{rgb:XC.BAD_TX}},fill:{patternType:"solid",fgColor:{rgb:XC.BAD_BG}},alignment:{horizontal:"right",vertical:"center"},border:BORDER_THIN,numFmt:NUM_FMT},NUM_FMT);
    }
    // Margen
    if(margen===null){
      setCell(ws,XLSX.utils.encode_cell({r,c:7}),"N/A",{font:{name:"Arial",sz:9,color:{rgb:XC.MUTED_TX}},fill:{patternType:"solid",fgColor:{rgb:XC.BAD_BG}},alignment:{horizontal:"center",vertical:"center"},border:BORDER_THIN});
    }else{
      const col = margen>=0?XC.OK_TX:XC.BAD_TX;
      const bg = margen>=0?XC.OK_BG:XC.BAD_BG;
      setCell(ws,XLSX.utils.encode_cell({r,c:7}),margen,{font:{name:"Arial",sz:9,bold:true,color:{rgb:col}},fill:{patternType:"solid",fgColor:{rgb:bg}},alignment:{horizontal:"right",vertical:"center"},border:BORDER_THIN,numFmt:PCT_FMT},PCT_FMT);
    }
    rowHeights[r]=20; r++;
  }
  // Total
  const mT = gIn>0?gU/gIn:null;
  setCell(ws,XLSX.utils.encode_cell({r,c:0}),`TOTAL ${year}`,styleGrandTotalLabel);
  setCell(ws,XLSX.utils.encode_cell({r,c:1}),gIn,styleGrandTotal,NUM_FMT);
  setCell(ws,XLSX.utils.encode_cell({r,c:2}),gS,styleGrandTotal,NUM_FMT);
  setCell(ws,XLSX.utils.encode_cell({r,c:3}),gR,styleGrandTotal,NUM_FMT);
  setCell(ws,XLSX.utils.encode_cell({r,c:4}),gP,styleGrandTotal,NUM_FMT);
  setCell(ws,XLSX.utils.encode_cell({r,c:5}),gC,styleGrandTotal,NUM_FMT);
  setCell(ws,XLSX.utils.encode_cell({r,c:6}),gU,styleGrandTotal,NUM_FMT);
  if(mT===null) setCell(ws,XLSX.utils.encode_cell({r,c:7}),"N/A",styleGrandTotal);
  else setCell(ws,XLSX.utils.encode_cell({r,c:7}),mT,styleGrandTotal,PCT_FMT);
  rowHeights[r]=22; r++;
  // Nota
  setCell(ws,"A"+(r+1),"* Meses sin ingresos = sin factura emitida ese mes  |  Costos incluyen viáticos, combustible y operación",styleSubtitle);
  merges.push({s:{r,c:0},e:{r,c:7}});
  rowHeights[r]=14; r++;

  ws["!ref"] = "A1:H"+r;
  ws["!cols"] = [{wch:18},{wch:16},{wch:14},{wch:15},{wch:15},{wch:14},{wch:15},{wch:13}];
  ws["!merges"] = merges;
  ws["!rows"] = rowHeights.map(h=>({hpt:h||15}));
  ws["!freeze"] = {xSplit:0,ySplit:3};
  return ws;
}

/* ═══════ HELPER: Hoja "Costos Operativos" formato Botmate
   Lista con categorización por concepto + colores por tipo + subtotales mes */
function buildCostosOperativosSheet(viat, brand, year){
  const MESES_FULL=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  const ws = {};
  const merges = [];
  const rowHeights = [];
  let r = 0;

  // Título
  setCell(ws,"A"+(r+1),`REPORTE DE COSTOS OPERATIVOS  —  ${brand}  |  ${year}`,styleTitle);
  merges.push({s:{r,c:0},e:{r,c:7}});
  rowHeights[r]=22; r++;
  setCell(ws,"A"+(r+1),"  Fuente: Viáticos & Gastos  |  Clasificación: Sueldos / Viáticos-Combustible / Operación-Brandeos",styleSubtitle);
  merges.push({s:{r,c:0},e:{r,c:7}});
  rowHeights[r]=14; r++;
  // Headers
  const headers = ["#","CONCEPTO","PROVEEDOR","DESCRIPCIÓN / REFERENCIA","SUELDOS","VIÁTICOS / COMB.","OPERACIÓN / BRANDEOS","TOTAL MES"];
  headers.forEach((h,i)=>setCell(ws,XLSX.utils.encode_cell({r,c:i}),h,styleColHeader));
  rowHeights[r]=20; r++;

  // Clasificar cada viático en bucket + ordenar por mes
  const clasificar = (v)=>{
    const t = ((v.concepto||"")+" "+(v.tipo||"")+" "+(v.descripcion||"")).toLowerCase();
    if(/sueldo|salario|nomina|n[óo]mina|apoyo gerencial|apoyo admin/i.test(t)) return "sueldo";
    if(/comida|hotel|gasolina|caseta|peaje|viatico/i.test(t)) return "viatico";
    return "operacion";
  };
  const getDate = (v)=>{
    if(v.fecha) return new Date(v.fecha);
    if(v.createdAt?.seconds) return new Date(v.createdAt.seconds*1000);
    return new Date();
  };
  const yearViat = viat.filter(v=>{
    const d = getDate(v);
    return d.getFullYear()==year;
  }).sort((a,b)=>getDate(a)-getDate(b));

  // Agrupar por mes
  const byMonth = {};
  for(let i=0;i<12;i++) byMonth[i]=[];
  yearViat.forEach(v=>byMonth[getDate(v).getMonth()].push(v));

  let idx = 0, gS=0, gV=0, gO=0, gT=0;
  for(let mi=0;mi<12;mi++){
    const items = byMonth[mi];
    if(items.length===0) continue;
    // Header mes (merged A:H)
    setCell(ws,XLSX.utils.encode_cell({r,c:0}),`${MESES_FULL[mi]} ${year}`,styleMonthRow);
    for(let c=1;c<8;c++) setCell(ws,XLSX.utils.encode_cell({r,c}),"",styleMonthRow);
    merges.push({s:{r,c:0},e:{r,c:7}});
    rowHeights[r]=20; r++;
    let mS=0,mV=0,mO=0,mT=0;
    const startR = r;
    items.forEach(v=>{
      idx++;
      const cat = clasificar(v);
      const monto = Number(v.monto||0);
      const conceptoLabel = cat==="sueldo"?"Sueldos":cat==="viatico"?"Viáticos / Comb.":"Operación / Brandeos";
      const palette = cat==="sueldo"?{bg:XC.SUELDOS_BG,tx:XC.SUELDOS_TX}:cat==="viatico"?{bg:XC.REDES_BG,tx:XC.REDES_TX}:{bg:XC.PROG_BG,tx:XC.PROG_TX};
      const baseStyle = {bg:palette.bg};
      setCell(ws,XLSX.utils.encode_cell({r,c:0}),idx,styleCell(r,{...baseStyle,align:"center"}));
      setCell(ws,XLSX.utils.encode_cell({r,c:1}),conceptoLabel,styleCell(r,{...baseStyle,bold:true,color:palette.tx}));
      setCell(ws,XLSX.utils.encode_cell({r,c:2}),v.proveedor||v.chofer||v.responsable||"",styleCell(r,baseStyle));
      setCell(ws,XLSX.utils.encode_cell({r,c:3}),v.descripcion||v.concepto||v.notas||"",styleCell(r,baseStyle));
      if(cat==="sueldo"){ setCell(ws,XLSX.utils.encode_cell({r,c:4}),monto,styleCell(r,{...baseStyle,align:"right",color:palette.tx}),NUM_FMT); mS+=monto; }
      else setCell(ws,XLSX.utils.encode_cell({r,c:4}),"",styleCell(r,baseStyle));
      if(cat==="viatico"){ setCell(ws,XLSX.utils.encode_cell({r,c:5}),monto,styleCell(r,{...baseStyle,align:"right",color:palette.tx}),NUM_FMT); mV+=monto; }
      else setCell(ws,XLSX.utils.encode_cell({r,c:5}),"",styleCell(r,baseStyle));
      if(cat==="operacion"){ setCell(ws,XLSX.utils.encode_cell({r,c:6}),monto,styleCell(r,{...baseStyle,align:"right",color:palette.tx}),NUM_FMT); mO+=monto; }
      else setCell(ws,XLSX.utils.encode_cell({r,c:6}),"",styleCell(r,baseStyle));
      setCell(ws,XLSX.utils.encode_cell({r,c:7}),monto,styleCell(r,{...baseStyle,align:"right",color:palette.tx}),NUM_FMT);
      mT+=monto;
      rowHeights[r]=15; r++;
    });
    gS+=mS; gV+=mV; gO+=mO; gT+=mT;
    // Subtotal mes (A:D merged)
    setCell(ws,XLSX.utils.encode_cell({r,c:0}),`SUBTOTAL  ${MESES_FULL[mi]} ${year}`,styleSubtotalLabel);
    for(let c=1;c<4;c++) setCell(ws,XLSX.utils.encode_cell({r,c}),"",styleSubtotalRow);
    merges.push({s:{r,c:0},e:{r,c:3}});
    setCell(ws,XLSX.utils.encode_cell({r,c:4}),mS,styleSubtotalRow,NUM_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:5}),mV,styleSubtotalRow,NUM_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:6}),mO,styleSubtotalRow,NUM_FMT);
    setCell(ws,XLSX.utils.encode_cell({r,c:7}),mT,styleSubtotalRow,NUM_FMT);
    rowHeights[r]=20; r++;
  }
  // Gran total
  setCell(ws,XLSX.utils.encode_cell({r,c:0}),`TOTAL GENERAL  COSTOS ${year}`,styleGrandTotalLabel);
  for(let c=1;c<4;c++) setCell(ws,XLSX.utils.encode_cell({r,c}),"",styleGrandTotal);
  merges.push({s:{r,c:0},e:{r,c:3}});
  setCell(ws,XLSX.utils.encode_cell({r,c:4}),gS,styleGrandTotal,NUM_FMT);
  setCell(ws,XLSX.utils.encode_cell({r,c:5}),gV,styleGrandTotal,NUM_FMT);
  setCell(ws,XLSX.utils.encode_cell({r,c:6}),gO,styleGrandTotal,NUM_FMT);
  setCell(ws,XLSX.utils.encode_cell({r,c:7}),gT,styleGrandTotal,NUM_FMT);
  rowHeights[r]=22; r++;

  ws["!ref"] = "A1:H"+r;
  ws["!cols"] = [{wch:5},{wch:20},{wch:26},{wch:38},{wch:15},{wch:16},{wch:17},{wch:15}];
  ws["!merges"] = merges;
  ws["!rows"] = rowHeights.map(h=>({hpt:h||15}));
  ws["!freeze"] = {xSplit:0,ySplit:3};
  return ws;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOLICITUD DE FACTURA — formato exacto que pide la oficina
   Replica 1:1 el template del cliente con datos auto-llenados desde
   CLIENTE_PLANES + factura. La oficina solo recibe el XLSX y lo facturan.
   ═══════════════════════════════════════════════════════════════════════════ */
function downloadSolicitudFacturaXLSX(factura){
  const wb = XLSX.utils.book_new();
  const ws = {};
  // Identifica el cliente por empresa o por id guardado
  const matched = CLIENTE_PLANES.find(cp=>
    (factura._clienteId&&cp.id===factura._clienteId)||
    cp.empresa.toLowerCase().trim()===(factura.empresa||"").toLowerCase().trim()
  ) || lookupPlanForCliente(factura.empresa||factura.cliente||factura.solicitante||"");

  if(!matched){
    alert("Cliente no identificado. Asegúrate de que la factura tenga una empresa conocida (Actnow, SCJ, Canon, Robots, MAP/Sofía).");
    return;
  }
  const cfg = SOLICITUD_FACTURA_CONFIG;

  // Estilos base
  const titleStyle = {
    font:{name:"Calibri",sz:14,bold:true,color:{rgb:"FF0000"}},
    fill:{patternType:"solid",fgColor:{rgb:"FFFF00"}},
    alignment:{horizontal:"center",vertical:"center"},
    border:{top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}},
  };
  const labelStyle = {
    font:{name:"Calibri",sz:11,bold:true,color:{rgb:"000000"}},
    fill:{patternType:"solid",fgColor:{rgb:"92D050"}},
    alignment:{horizontal:"center",vertical:"center",wrapText:true},
    border:{top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}},
  };
  const valStyle = {
    font:{name:"Calibri",sz:11,bold:false,color:{rgb:"000000"}},
    alignment:{horizontal:"left",vertical:"center",wrapText:true},
    border:{top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}},
  };
  const valBoldStyle = {...valStyle, font:{...valStyle.font, bold:true}};
  const moneyStyle = {
    ...valStyle,
    alignment:{horizontal:"right",vertical:"center"},
    numFmt:'"$"#,##0.00',
  };
  const moneyBoldStyle = {...moneyStyle, font:{...moneyStyle.font, bold:true}};
  const dateStyle = {
    ...valStyle,
    alignment:{horizontal:"center",vertical:"center"},
    numFmt:"dd/mm/yyyy",
  };
  const ciudadStyle = {
    font:{name:"Calibri",sz:10,bold:true,italic:true,color:{rgb:"000000"}},
    alignment:{horizontal:"center",vertical:"center"},
  };
  const importeHeaderStyle = {
    font:{name:"Calibri",sz:11,bold:true},
    fill:{patternType:"solid",fgColor:{rgb:"D9D9D9"}},
    alignment:{horizontal:"center",vertical:"center"},
    border:{top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}},
  };

  const setS = (addr,val,style,nf)=>{
    const isNum = typeof val==="number";
    const isDate = val instanceof Date;
    ws[addr] = {t: isNum?"n":(isDate?"d":"s"), v: val};
    if(nf) ws[addr].z = nf;
    if(style){
      ws[addr].s = {...style};
      if(nf) ws[addr].s.numFmt = nf;
    }
  };

  const merges = [];
  const subtotal = Number(factura.subtotal||factura.monto||0);
  const ivaAmt = Number(factura.ivaAmt||factura.iva||0);
  const total = Number(factura.total||subtotal+ivaAmt);
  const periodo = `${factura.mesOp||""}-${factura.anio||new Date().getFullYear()}`.toUpperCase();
  const fechaSolicitud = new Date(); // Hoy

  // ROW 1 — TÍTULO (B1:F1 merged, amarillo + rojo)
  setS("B1","REQUISITOS DE SOLICITUD DE FACTURAS",titleStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:0,c}),"",titleStyle);
  merges.push({s:{r:0,c:1},e:{r:0,c:5}});

  // ROW 2 — EMPRESA DE DONDE SE FACTURA (siempre "D EN MOVIMIENTO")
  setS("A2","EMPRESA DE DONDE SE FACTURA:",labelStyle);
  setS("B2",cfg.empresaEmisora,valBoldStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:1,c}),"",valBoldStyle);
  merges.push({s:{r:1,c:1},e:{r:1,c:5}});

  // ROW 3 — Ciudad expedición (col D)
  setS("D3",cfg.ciudadExpedicion,ciudadStyle);

  // ROW 4 — espaciador

  // ROW 5 — RAZON SOCIAL CLIENTE | FECHA
  setS("A5","RAZON SOCIAL CLIENTE:",labelStyle);
  setS("B5",matched.empresa,valBoldStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:4,c}),"",valBoldStyle);
  merges.push({s:{r:4,c:1},e:{r:4,c:5}});
  setS("G5","FECHA",labelStyle);

  // ROW 6 — fecha valor
  setS("G6",fechaSolicitud,dateStyle,"dd/mm/yyyy");

  // ROW 7 — DOMICILIO FISCAL (col A merged A7:A8)
  setS("A7","DOMICILIO FISCAL:",labelStyle);
  setS("A8","",labelStyle);
  merges.push({s:{r:6,c:0},e:{r:7,c:0}});
  setS("B7",matched.domicilio1||"",valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:6,c}),"",valStyle);
  merges.push({s:{r:6,c:1},e:{r:6,c:5}});
  setS("B8",matched.domicilio2||"",valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:7,c}),"",valStyle);
  merges.push({s:{r:7,c:1},e:{r:7,c:5}});

  // ROW 9 — REGIMEN FISCAL
  setS("A9","REGIMEN FISCAL",labelStyle);
  setS("B9",matched.regimenFiscal||"",valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:8,c}),"",valStyle);
  merges.push({s:{r:8,c:1},e:{r:8,c:5}});

  // ROW 10 — RFC
  setS("A10","RFC:",labelStyle);
  setS("B10",matched.rfc||"",valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:9,c}),"",valStyle);
  merges.push({s:{r:9,c:1},e:{r:9,c:5}});

  // ROW 11 — espaciador

  // ROW 12 — METODO DE PAGO
  setS("A12","METODO DE PAGO:",labelStyle);
  setS("B12",cfg.metodoPago,valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:11,c}),"",valStyle);
  merges.push({s:{r:11,c:1},e:{r:11,c:5}});

  // ROW 13 — FORMA DE PAGO
  setS("A13","FORMA DE PAGO:",labelStyle);
  setS("B13",cfg.formaPago,valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:12,c}),"",valStyle);
  merges.push({s:{r:12,c:1},e:{r:12,c:5}});

  // ROW 14 — USO DE CFDI
  setS("A14","USO DE CFDI:",labelStyle);
  setS("B14",cfg.usoCFDI,valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:13,c}),"",valStyle);
  merges.push({s:{r:13,c:1},e:{r:13,c:5}});

  // ROW 15 — CLAVE DEL PRODUCTO O SERVICIO
  setS("A15","\"CLAVE DEL PRODUCTO O SERVICIO\":",labelStyle);
  setS("B15",cfg.claveProductoServicio,valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:14,c}),"",valStyle);
  merges.push({s:{r:14,c:1},e:{r:14,c:5}});

  // ROW 16 — espaciador

  // ROW 17 — PRESUPUESTO + Importe header (col G)
  setS("A17","PRESUPUESTO:",labelStyle);
  setS("G17","Importe",importeHeaderStyle);

  // ROW 18 — AT'N
  setS("A18","AT´N:",labelStyle);
  setS("B18",cfg.atn,valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:17,c}),"",valStyle);
  merges.push({s:{r:17,c:1},e:{r:17,c:5}});

  // ROW 19 — NUMERO DE PLAN DMOVIMIENTO
  setS("A19","NUMERO DE PLAN DMOVIMIENTO:",labelStyle);
  setS("B19",cfg.numeroPlanDmovimiento,valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:18,c}),"",valStyle);
  merges.push({s:{r:18,c:1},e:{r:18,c:5}});

  // ROW 20 — ENTRE EMPRESAS AMBOS No. DE PLAN (← este es el plan del cliente)
  setS("A20","ENTRE EMPRESAS AMBOS No. DE PLAN:",labelStyle);
  setS("B20",matched.planSolicitud||matched.plan,valBoldStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:19,c}),"",valBoldStyle);
  merges.push({s:{r:19,c:1},e:{r:19,c:5}});

  // ROW 21 — DESCRIPCION / CONCEPTO + monto en col G
  setS("A21","DESCRIPCION / CONCEPTO:",labelStyle);
  setS("B21",factura.servicio||"",valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:20,c}),"",valStyle);
  merges.push({s:{r:20,c:1},e:{r:20,c:5}});
  setS("G21",subtotal,moneyStyle,'"$"#,##0.00');

  // ROW 22 — PERIODO
  setS("A22","PERIODO:",labelStyle);
  setS("B22",periodo,valStyle);
  for(let c=2;c<=5;c++) setS(XLSX.utils.encode_cell({r:21,c}),"",valStyle);
  merges.push({s:{r:21,c:1},e:{r:21,c:5}});

  // ROW 23 — espaciador

  // ROWS 24-26 — Subtotal / IVA / Total
  setS("F24","Subtotal",valBoldStyle);
  setS("G24",subtotal,moneyBoldStyle,'"$"#,##0.00');
  setS("F25","IVA",valBoldStyle);
  setS("G25",ivaAmt,moneyBoldStyle,'"$"#,##0.00');
  setS("F26","Total",{...valBoldStyle,fill:{patternType:"solid",fgColor:{rgb:"FFFF00"}}});
  setS("G26",total,{...moneyBoldStyle,fill:{patternType:"solid",fgColor:{rgb:"FFFF00"}}},'"$"#,##0.00');

  // Configura columnas y rows
  ws["!ref"] = "A1:H29";
  ws["!cols"] = [
    {wch:34.5}, // A — labels
    {wch:21},   // B — values
    {wch:13.5}, // C
    {wch:14.5}, // D
    {wch:14},   // E
    {wch:14},   // F — totals labels
    {wch:21},   // G — fecha + montos
    {wch:5},    // H
  ];
  ws["!rows"] = [
    {hpt:20},{hpt:18},{hpt:16},{hpt:8},{hpt:18},{hpt:18},{hpt:18},{hpt:18},
    {hpt:18},{hpt:18},{hpt:8},{hpt:18},{hpt:18},{hpt:18},{hpt:18},{hpt:8},
    {hpt:18},{hpt:18},{hpt:18},{hpt:18},{hpt:22},{hpt:18},{hpt:8},{hpt:18},
    {hpt:18},{hpt:22},
  ];
  ws["!merges"] = merges;

  XLSX.utils.book_append_sheet(wb,ws,(matched.cliente||"Solicitud").slice(0,30));

  // Descarga
  const fechaTag = fechaSolicitud.toISOString().slice(0,10);
  const filename = `Solicitud_${matched.cliente.replace(/\s+/g,"_")}_${factura.folio||"sin-folio"}_${fechaTag}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ═══════ REPORTE EJECUTIVO DE FACTURACIÓN — FORMATO OFICINA (Botmate-style) ═══════
// Reemplaza el export anterior con el formato exacto que pide la oficina:
// 3 hojas con formato profesional, colores, merges, subtotales por mes, chips de status.
function exportFacturasXLSX(facts, mesFiltro){
  if(!facts || facts.length===0){alert("No hay facturas para exportar");return;}
  const BRAND = "DMVIMIENTO";
  const anio = new Date().getFullYear();
  const fechaTag = new Date().toISOString().slice(0,10);
  const wb = XLSX.utils.book_new();

  // Obtén los viáticos también para las hojas P&L + Costos
  // (los datos ya están en Firestore vía onSnapshot del componente — pero aquí no tenemos acceso directo,
  //  así que el caller los puede pasar. Si no, usamos array vacío.)
  const viat = window.__DMOV_VIATICOS__ || [];

  // Hoja 1: Relación de Facturas (formato oficina)
  const ws1 = buildRelacionFacturasSheet(facts, BRAND, anio);
  XLSX.utils.book_append_sheet(wb, ws1, "Relación de Facturas");

  // Hoja 2: Resumen P&L
  const ws2 = buildResumenPLSheet(facts, viat, BRAND, anio);
  XLSX.utils.book_append_sheet(wb, ws2, `Resumen P&L ${anio}`);

  // Hoja 3: Costos Operativos (si hay datos)
  if(viat.length>0){
    const ws3 = buildCostosOperativosSheet(viat, BRAND, anio);
    XLSX.utils.book_append_sheet(wb, ws3, `Costos ${anio}`);
  }

  // Descargar
  const mesTag = mesFiltro?"_"+mesFiltro:"";
  XLSX.writeFile(wb, `DMOV_Reporte_Facturacion${mesTag}_${fechaTag}.xlsx`);
}

// ═══════ FIN exportFacturasXLSX (formato oficina) — código legacy eliminado ═══════
function _legacyExportFacturasXLSX_disabled(facts, mesFiltro){
  const anio = new Date().getFullYear();
  const wb = XLSX.utils.book_new();
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const fechaReporte = new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"});

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
    <div className="glass noprint" style={{position:"sticky",top:0,zIndex:100,minHeight:56,display:"flex",alignItems:"center",gap:10,padding:"0 16px",borderBottom:"1px solid "+BORDER+"80"}}>
      <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="btn hamburger-btn" title="Menú" style={{width:40,height:40,borderRadius:10,border:"1px solid "+BD2,alignItems:"center",justifyContent:"center",color:MUTED,flexShrink:0}}><Menu size={20}/></button>
      <div style={{display:"flex",alignItems:"center",gap:9,flex:"0 0 auto",minWidth:0}}>
        <div style={{width:30,height:30,borderRadius:9,background:A+"12",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={15} color={A}/></div>
        <span style={{fontFamily:DISP,fontWeight:700,fontSize:15,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur.label}</span>
      </div>
      <button onClick={()=>setSearchOpen(true)} className="btn topbar-search" style={{flex:1,maxWidth:420,margin:"0 auto",display:"flex",alignItems:"center",gap:10,padding:"8px 16px",borderRadius:11,border:"1.5px solid "+BD2,background:"#fff",cursor:"pointer",minWidth:0}}>
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
    {id:"facturas",    label:"Facturación",       icon:FileText},
    {id:"viaticos",    label:"Viáticos & Gastos", icon:Zap},
    {id:"gastosAdmin", label:"Gastos Choferes",   icon:DollarSign, badge:"NEW"},
    {id:"jornadas",    label:"Jornadas & Horas",  icon:Clock, badge:"NEW"},
    {id:"chat",        label:"Chat interno",      icon:Send, badge:"NEW"},
    {id:"alertas",     label:"Centro de Alertas", icon:Bell, badge:"NEW"},
    {id:"clientes",    label:"Clientes",          icon:Building2},
  ]},
];
function Sidebar({view,setView,stats,open,setOpen}){
  const isMobile = typeof window!=="undefined"&&window.innerWidth<768;
  const w = isMobile?260:(open?220:64);
  const showFull = open||isMobile;
  return(
    <aside className={"noprint sidebar-desktop"+(open?" open":"")} style={{width:w,flexShrink:0,background:"#0a1628",display:"flex",flexDirection:"column",minHeight:"100vh",padding:"0 "+(showFull?"10px":"6px")+" 16px",transition:"width .22s cubic-bezier(.22,1,.36,1),padding .22s",overflow:"hidden",paddingTop:"env(safe-area-inset-top,0)"}}>
      <div style={{padding:showFull?"20px 6px 14px":"20px 0 14px",borderBottom:"1px solid #ffffff14",marginBottom:6,display:"flex",alignItems:"center",gap:10,justifyContent:showFull?"flex-start":"center"}}>
        <div style={{width:36,height:36,borderRadius:11,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:15,color:"#fff",flexShrink:0}}>DM</div>
        {showFull&&<div style={{flex:1,minWidth:0}}><div style={{fontFamily:DISP,fontWeight:800,fontSize:14,color:"#fff",letterSpacing:"-0.02em",whiteSpace:"nowrap"}}>DMvimiento</div><div style={{fontSize:9,color:"#ffffff60",fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",whiteSpace:"nowrap"}}>LOGISTICS OS v2.2</div></div>}
        {showFull&&isMobile&&<button onClick={()=>setOpen(false)} className="btn" style={{width:32,height:32,borderRadius:8,background:"rgba(255,255,255,.08)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X size={16}/></button>}
      </div>
      {showFull&&<button onClick={()=>!isMobile&&setOpen(false)} className="btn" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"1px solid #ffffff14",marginBottom:10,color:"#ffffff60",fontSize:11,whiteSpace:"nowrap"}}><Search size={12}/><span style={{flex:1,textAlign:"left"}}>Buscar… ⌘K</span></button>}
      <nav style={{flex:1,overflowY:"auto"}}>
        {NAV_SECTIONS.map(({section,items})=>(
          <div key={section} style={{marginBottom:8}}>
            {showFull&&<div style={{fontSize:9,fontWeight:800,color:"#ffffff30",letterSpacing:"0.12em",padding:"6px 10px 4px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{section}</div>}
            {items.map(({id,label,icon:Icon,badge})=>{
              const a=view===id;
              return(
                <button key={id} onClick={()=>setView(id)} className="btn" title={showFull?"":label} style={{width:"100%",display:"flex",alignItems:"center",gap:showFull?9:0,padding:showFull?"10px 10px":"10px 0",borderRadius:9,marginBottom:1,cursor:"pointer",transition:"all .15s",background:a?A+"22":"transparent",justifyContent:showFull?"flex-start":"center",position:"relative"}}>
                  {a&&<div style={{position:"absolute",left:0,top:"20%",bottom:"20%",width:3,borderRadius:4,background:A,transition:"all .15s"}}/>}
                  <Icon size={showFull?16:15} color={a?A:"#ffffff70"} strokeWidth={a?2.5:2}/>
                  {showFull&&<span style={{fontSize:13,fontWeight:a?700:500,color:a?A:"#ffffff90",flex:1,textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>}
                  {showFull&&badge&&<span style={{fontSize:8,fontWeight:800,background:a?A:badge==="NEW"?VIOLET:A,color:"#fff",borderRadius:6,padding:"1px 5px",letterSpacing:"0.05em"}}>{badge}</span>}
                  {!showFull&&a&&<div style={{position:"absolute",right:-2,width:5,height:5,borderRadius:"50%",background:A}}/>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{borderTop:"1px solid #ffffff14",paddingTop:10,marginTop:4}}>
        {showFull?<div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
          {[["",GREEN,"En línea",stats.fb],[stats.cot+"","#fff","cots",null],[stats.fac+"","#fff","facts",null]].map(([ic,c,l,blink])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
              {blink!==undefined&&<div className={blink?"pulse":""} style={{width:5,height:5,borderRadius:"50%",background:blink?GREEN:ROSE}}/>}
              <span style={{fontSize:9,color:"#ffffff50",fontFamily:MONO}}>{ic} {l}</span>
            </div>
          ))}
        </div>:<div style={{display:"flex",justifyContent:"center"}}><div className={stats.fb?"pulse":""} style={{width:6,height:6,borderRadius:"50%",background:stats.fb?GREEN:ROSE}}/></div>}
        {!isMobile&&<button onClick={()=>setOpen(!open)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 0",marginTop:8,borderRadius:8,border:"1px solid #ffffff10",color:"#ffffff50"}}>
          <ChevronLeft size={14} style={{transition:"transform .2s",transform:open?"":"rotate(180deg)"}}/>
          {open&&<span style={{fontSize:10,fontWeight:600}}>Colapsar</span>}
        </button>}
      </div>
    </aside>
  );
}
/* ─── DASHBOARD ──────────────────────────────────────────────────────────── */
function Dashboard({setView,cots,facts,rutas,entregas,viat=[],clientes=[],prospectos=[]}){
  // KPIs operativos adicionales (gastos choferes, jornadas activas, SOS)
  const [gastosChofer,setGastosChofer]=useState([]);
  const [jornadas,setJornadas]=useState([]);
  const [alertasItems,setAlertas]=useState([]);
  useEffect(()=>{
    const u1=onSnapshot(collection(db,"gastosChofer"),s=>setGastosChofer(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2=onSnapshot(collection(db,"jornadas"),s=>setJornadas(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3=onSnapshot(collection(db,"alertas"),s=>setAlertas(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();u3();};
  },[]);
  const gastosPendientes = gastosChofer.filter(g=>g.estado==="pendiente").reduce((a,g)=>a+(g.monto||0),0);
  const gastosHoy = gastosChofer.filter(g=>{const ts=g.fechaTs?.seconds;if(!ts) return false;return new Date(ts*1000).toDateString()===new Date().toDateString();}).reduce((a,g)=>a+(g.monto||0),0);
  const jornadasActivas = jornadas.filter(j=>!j.outTs).length;
  const sosSinAtender = alertasItems.filter(a=>a.type==="sos"&&!a.atendida).length;
  const alertasCriticas = alertasItems.filter(a=>(a.type==="sos"||a.type==="geofence")&&!a.atendida).length;

  const totalFac=facts.reduce((a,f)=>a+(f.total||0),0);
  const cobrado=facts.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0);
  const pendiente=facts.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+(f.total||0),0);
  // Cartera vencida — facturas con fechaVenc < hoy y status != Pagada
  const hoyTs = Date.now();
  const cartera = facts.filter(f=>{
    if(f.status==="Pagada"||f.status==="Cancelada") return false;
    if(!f.fechaVenc) return false;
    return new Date(f.fechaVenc).getTime() < hoyTs;
  });
  const carteraVencida = cartera.reduce((a,f)=>a+(f.total||0),0);
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

      {/* Fila nueva: Operaciones choferes + alertas */}
      <div className="g4" style={{marginBottom:16}}>
        <div onClick={()=>setView("alertas")} className="ch" style={{background:sosSinAtender>0?"linear-gradient(135deg,#dc2626,#ef4444)":alertasCriticas>0?"linear-gradient(135deg,"+ROSE+","+ROSE+"dd)":"#fff",border:sosSinAtender>0||alertasCriticas>0?"none":"1px solid "+BORDER,borderRadius:14,padding:"14px 16px",cursor:"pointer",color:sosSinAtender>0||alertasCriticas>0?"#fff":TEXT,boxShadow:sosSinAtender>0?"0 6px 20px #dc262655":"0 1px 4px rgba(12,24,41,.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{width:34,height:34,borderRadius:10,background:sosSinAtender>0||alertasCriticas>0?"rgba(255,255,255,.22)":ROSE+"14",display:"flex",alignItems:"center",justifyContent:"center"}}><Bell size={15} color={sosSinAtender>0||alertasCriticas>0?"#fff":ROSE}/></div>
            {sosSinAtender>0&&<span className="pulse" style={{fontSize:9,fontWeight:900,letterSpacing:"0.1em"}}>● SOS</span>}
          </div>
          <div style={{fontFamily:MONO,fontSize:24,fontWeight:800,marginTop:8,lineHeight:1}}>{alertasCriticas}</div>
          <div style={{fontSize:10,fontWeight:700,opacity:sosSinAtender>0||alertasCriticas>0?.9:1,color:sosSinAtender>0||alertasCriticas>0?"#fff":MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3}}>Alertas críticas</div>
          <div style={{fontSize:10,opacity:.85,marginTop:2}}>{sosSinAtender>0?sosSinAtender+" SOS activos":alertasItems.filter(a=>!a.atendida).length+" sin atender"}</div>
        </div>
        <KpiCard icon={DollarSign} color={AMBER} label="Gastos chofer pendientes" value={fmtK(gastosPendientes)} sub={gastosChofer.filter(g=>g.estado==="pendiente").length+" reembolsos"} onClick={()=>setView("gastosAdmin")}/>
        <KpiCard icon={Clock} color={GREEN} label="Jornadas activas" value={jornadasActivas} sub={jornadas.filter(j=>{const ts=j.inTs?.seconds;if(!ts) return false;return new Date(ts*1000).toDateString()===new Date().toDateString();}).length+" jornadas hoy"} onClick={()=>setView("jornadas")}/>
        <KpiCard icon={AlertCircle} color={ROSE} label="Cartera vencida" value={fmtK(carteraVencida)} sub={cartera.length+" facturas"} onClick={()=>setView("facturas")}/>
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
  const [recurrente,setRecurrente]=useState(false);
  const [recurrenciaFrec,setRecurrenciaFrec]=useState("mensual"); // semanal/quincenal/mensual
  const [plantillas,setPlantillas]=useState([]);
  const [showPlantillas,setShowPlantillas]=useState(false);
  const [showComparador,setShowComparador]=useState(false);
  const showT=(m,t="ok")=>setToast({msg:m,type:t});

  useEffect(()=>onSnapshot(collection(db,"plantillasCotizador"),s=>{
    setPlantillas(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  }),[]);

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
      const vencimiento = new Date(Date.now()+15*86400000).toISOString().slice(0,10);
      await addDoc(collection(db,"cotizaciones"),{
        ...q,
        recurrente: !!recurrente,
        recurrenciaFrec: recurrente?recurrenciaFrec:"",
        vigenciaHasta: vencimiento,
        status: "Pendiente",
        createdAt:serverTimestamp(),
      });
      showT("✓ Cotización guardada — "+q.folio+(recurrente?" (recurrente "+recurrenciaFrec+")":""));
      onSaved&&onSaved();
    }catch(e){showT(e.message,"err");}
  };

  // Guardar config actual como plantilla
  const guardarPlantilla = async()=>{
    const nombre = prompt("Nombre de la plantilla (ej: 'Ruta CDMX-Monterrey semanal'):");
    if(!nombre||!nombre.trim()) return;
    const snapshot = {
      nombre: nombre.trim(),
      modo,
      plazo,
      local:{veh:lVeh,urg:lUrg,ayud:lAyud,res:lRes,puntos:lPuntos},
      foraneo:{veh:fVeh,ciudades:fCiudades,urg:fUrg,mani:fMani,numAyud:fNumAyud,res:fRes,extra:fExtra},
      masivo:{veh:mVeh,maxDia:mMaxDia,personas:mPersonas,ayud:mAyud,urg:mUrg,ciudades:mCiudades},
      createdAt: serverTimestamp(),
    };
    try{
      await addDoc(collection(db,"plantillasCotizador"),snapshot);
      showT("✓ Plantilla guardada");
    }catch(e){showT(e.message,"err");}
  };

  // Cargar plantilla
  const cargarPlantilla = (p)=>{
    setModo(p.modo||"local");
    setPlazo(p.plazo||3);
    if(p.local){
      setLVeh(p.local.veh||"cam");
      setLUrg(!!p.local.urg);setLAyud(!!p.local.ayud);setLRes(!!p.local.res);
      setLPuntos(p.local.puntos||[{id:uid(),dir:"",ref:""}]);
    }
    if(p.foraneo){
      setFVeh(p.foraneo.veh||"cam");
      setFCiudades(p.foraneo.ciudades||[]);
      setFUrg(!!p.foraneo.urg);setFMani(!!p.foraneo.mani);
      setFNumAyud(p.foraneo.numAyud||1);setFRes(!!p.foraneo.res);setFExtra(p.foraneo.extra||0);
    }
    if(p.masivo){
      setMVeh(p.masivo.veh||"cam");
      setMMaxDia(p.masivo.maxDia||20);
      setMPersonas(p.masivo.personas||1);
      setMAyud(!!p.masivo.ayud);setMUrg(!!p.masivo.urg);
      setMCiudades(p.masivo.ciudades||[]);
    }
    setShowPlantillas(false);
    showT("✓ Plantilla cargada: "+p.nombre);
  };

  const eliminarPlantilla = async(id)=>{
    if(!confirm("¿Eliminar esta plantilla?")) return;
    await deleteDoc(doc(db,"plantillasCotizador",id));
    showT("Plantilla eliminada");
  };

  // Comparador — calcula el total con cada tipo de vehículo
  const compararVehiculos = useMemo(()=>{
    if(modo==="local"){
      return Object.keys(LOC).map(k=>{
        const d = LOC[k];
        let base = d.normal;
        if(lUrg&&lAyud) base = d.urgente_ay;
        else if(lAyud) base = d.ayudante;
        else if(lUrg) base = d.urgente;
        const pe = Math.max(0,lPuntos.filter(p=>p.dir.trim()).length-1);
        const xp = pe*ADIC;
        const xr = lRes?(d.resguardo||0):0;
        const sub = base+xp+xr;
        return {veh:k,label:VEHK.find(v=>v.k===k)?.label||k,total:sub*1.16,subtotal:sub};
      }).sort((a,b)=>a.total-b.total);
    }else if(modo==="foraneo"&&fCiudades.length>0){
      return Object.keys(LOC).map(k=>{
        const vd = VEHK.find(v=>v.k===k);
        const crew = (vd?.crew||1)+fExtra;
        const baseTotal = fCiudades.reduce((a,c)=>a+(c[k]||0),0);
        const {total:xv} = calcViaticos(fMaxKm,crew,fComida,fHotel);
        const xu = fUrg?baseTotal*.35:0;
        const xm = fMani?AYUD*fNumAyud:0;
        const xr = fRes&&fCiudades.length>0?(LOC[k]?.resguardo||0):0;
        const sub = baseTotal+xu+xm+xr+xv;
        return {veh:k,label:vd?.label||k,total:sub*1.16,subtotal:sub};
      }).sort((a,b)=>a.total-b.total);
    }
    return [];
  },[modo,lVeh,lUrg,lAyud,lRes,lPuntos,fCiudades,fUrg,fMani,fNumAyud,fRes,fExtra,fComida,fHotel,fMaxKm]);

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
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>setShowPlantillas(true)} className="btn" style={{display:"flex",alignItems:"center",gap:6,padding:"7px 13px",background:"#fff",border:"1.5px solid "+VIOLET+"40",color:VIOLET,borderRadius:11,fontWeight:700,fontSize:12}}>
              <FolderOpen size={12}/>Plantillas ({plantillas.length})
            </button>
            <button onClick={guardarPlantilla} className="btn" style={{display:"flex",alignItems:"center",gap:6,padding:"7px 13px",background:"#fff",border:"1.5px solid "+BLUE+"40",color:BLUE,borderRadius:11,fontWeight:700,fontSize:12}}>
              <Plus size={12}/>Guardar plantilla
            </button>
            <button onClick={()=>setShowComparador(!showComparador)} className="btn" style={{display:"flex",alignItems:"center",gap:6,padding:"7px 13px",background:showComparador?A:"#fff",border:"1.5px solid "+A+"40",color:showComparador?"#fff":A,borderRadius:11,fontWeight:700,fontSize:12}}>
              <BarChart2 size={12}/>{showComparador?"Ocultar":"Comparar"} vehículos
            </button>
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
            {/* Quick-pick clientes conocidos */}
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
              {CLIENTE_PLANES.map(cp=>{
                const active = (cliente||"").toLowerCase().includes(cp.cliente.toLowerCase().slice(0,4));
                return(
                  <button key={cp.id} type="button" onClick={()=>setCliente(cp.empresa)} className="btn" style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid "+(active?cp.color:BD2),background:active?cp.color+"14":"#fff",color:active?cp.color:MUTED,fontWeight:active?700:500,fontSize:10}}>
                    <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:cp.color,marginRight:5,verticalAlign:"middle"}}/>{cp.cliente}
                  </button>
                );
              })}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
              <Inp label="Empresa / Cliente *" value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Escribe SCJ, Canon, Actnow… o nombre directo"/>
              <Inp label="Contacto" value={contacto} onChange={e=>setContacto(e.target.value)} placeholder="Nombre del contacto"/>
              <Spin label="Plazo de entrega (días)" value={plazo} onChange={setPlazo} min={1} max={90}/>
            </div>
            {(()=>{const m=lookupPlanForCliente(cliente);return m?<div style={{marginTop:8,fontSize:11,color:m.color,fontWeight:700,padding:"6px 10px",background:m.color+"08",borderRadius:7,border:"1px solid "+m.color+"30",display:"flex",alignItems:"center",gap:5}}><CheckCircle size={11}/>Cliente identificado: <strong>{m.cliente}</strong> · {m.plan}</div>:null;})()}
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

          {/* Comparador de vehículos */}
          {showComparador&&compararVehiculos.length>0&&<div style={{background:"linear-gradient(135deg,"+A+"08,"+VIOLET+"08)",border:"1.5px solid "+A+"30",borderRadius:12,padding:14,marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:800,color:A,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>📊 Comparador de vehículos — misma configuración</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {compararVehiculos.map((c,i)=>{
                const maxT = compararVehiculos[compararVehiculos.length-1].total;
                const pct = maxT>0?c.total/maxT*100:0;
                const ahorro = maxT>0?maxT-c.total:0;
                const isActive = (modo==="local"?lVeh:fVeh)===c.veh;
                return(
                  <div key={c.veh} onClick={()=>{if(modo==="local")setLVeh(c.veh);else if(modo==="foraneo")setFVeh(c.veh);}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 11px",borderRadius:9,background:isActive?A+"15":"#fff",border:"1.5px solid "+(isActive?A:BD2),cursor:"pointer"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:i===0?GREEN:i===compararVehiculos.length-1?ROSE:AMBER,color:"#fff",fontSize:10,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:12}}>{c.label} {isActive&&<span style={{color:A,fontSize:10,marginLeft:4}}>← seleccionado</span>}</div>
                      <div style={{background:BORDER,borderRadius:4,height:4,marginTop:4,overflow:"hidden"}}>
                        <div style={{background:i===0?GREEN:i===compararVehiculos.length-1?ROSE:AMBER,height:"100%",width:pct+"%",transition:"width .3s"}}/>
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:MONO,fontSize:13,fontWeight:900,color:isActive?A:TEXT}}>{fmt(c.total)}</div>
                      {i===0&&ahorro>0&&<div style={{fontSize:10,color:GREEN,fontWeight:700}}>Ahorra {fmt(ahorro)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:10,color:MUTED,marginTop:8,fontStyle:"italic"}}>💡 Click en cualquier opción para seleccionarla</div>
          </div>}
          {/* Toggle recurrente */}
          <div style={{background:"#fff",border:"1.5px solid "+BD2,borderRadius:11,padding:"10px 12px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>🔁</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:TEXT}}>Cotización recurrente</div>
                  <div style={{fontSize:10,color:MUTED}}>El cliente paga este servicio periódicamente</div>
                </div>
              </div>
              <label style={{position:"relative",display:"inline-block",width:36,height:20,cursor:"pointer"}}>
                <input type="checkbox" checked={recurrente} onChange={e=>setRecurrente(e.target.checked)} style={{opacity:0,width:0,height:0}}/>
                <span style={{position:"absolute",cursor:"pointer",top:0,left:0,right:0,bottom:0,background:recurrente?VIOLET:BD2,borderRadius:20,transition:".2s"}}>
                  <span style={{position:"absolute",height:16,width:16,left:recurrente?18:2,top:2,background:"#fff",borderRadius:"50%",transition:".2s"}}/>
                </span>
              </label>
            </div>
            {recurrente&&<select value={recurrenciaFrec} onChange={e=>setRecurrenciaFrec(e.target.value)} style={{width:"100%",marginTop:8,padding:"7px 10px",border:"1.5px solid "+BD2,borderRadius:8,fontSize:12,background:"#fff"}}>
              <option value="semanal">📅 Semanal</option>
              <option value="quincenal">📅 Quincenal</option>
              <option value="mensual">📅 Mensual</option>
              <option value="bimestral">📅 Bimestral</option>
              <option value="trimestral">📅 Trimestral</option>
            </select>}
          </div>
          <button onClick={guardar} disabled={!canSave||!cliente.trim()} className="btn" style={{background:canSave&&cliente.trim()?"linear-gradient(135deg,"+A+",#fb923c)":"#e0e0e0",color:canSave&&cliente.trim()?"#fff":"#aaa",borderRadius:13,padding:"14px 0",fontFamily:DISP,fontWeight:700,fontSize:16,cursor:canSave&&cliente.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:canSave&&cliente.trim()?"0 6px 20px "+A+"40":"none"}}>
            <Send size={15}/>Guardar cotización{recurrente?" (recurrente)":""}
          </button>
          <button onClick={()=>downloadCotizacionPDF(buildQ())} className="btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"11px 0",border:"1.5px solid "+BLUE+"30",borderRadius:13,fontSize:13,fontWeight:700,color:BLUE,background:"#fff"}}>
            <Download size={14}/>Descargar PDF
          </button>
        </div>
      </div>
      {/* Modal de plantillas */}
      {showPlantillas&&<Modal title="Plantillas de cotización" onClose={()=>setShowPlantillas(false)} icon={FolderOpen} iconColor={VIOLET} wide>
        {plantillas.length===0?<div style={{padding:"30px 20px",textAlign:"center",color:MUTED,fontSize:13}}>
          <FolderOpen size={32} color={BD2} style={{marginBottom:10}}/>
          <div style={{fontWeight:700,color:TEXT,fontSize:14,marginBottom:4}}>Sin plantillas guardadas</div>
          <div>Configura una cotización y usa "Guardar plantilla" para reutilizarla después.</div>
        </div>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {plantillas.map(p=>{
            const d = p.createdAt?.seconds?new Date(p.createdAt.seconds*1000).toLocaleDateString("es-MX"):"";
            const modoLabel = p.modo==="local"?"🏢 Local":p.modo==="foraneo"?"🚛 Foráneo":"📦 Masivo";
            return(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"#fff",border:"1.5px solid "+BORDER,borderRadius:11}}>
                <div style={{width:38,height:38,borderRadius:10,background:VIOLET+"14",display:"flex",alignItems:"center",justifyContent:"center"}}><FolderOpen size={16} color={VIOLET}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.nombre}</div>
                  <div style={{fontSize:11,color:MUTED}}>{modoLabel} · Creada {d}</div>
                </div>
                <button onClick={()=>cargarPlantilla(p)} className="btn" style={{padding:"7px 14px",borderRadius:9,background:"linear-gradient(135deg,"+VIOLET+",#9d5cff)",color:"#fff",fontWeight:700,fontSize:12}}>Cargar</button>
                <button onClick={()=>eliminarPlantilla(p.id)} className="btn" style={{color:ROSE,padding:6}}><Trash2 size={13}/></button>
              </div>
            );
          })}
        </div>}
      </Modal>}
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
/* ═══════════════════════════════════════════════════════════════════════════
   BitacoraImport — lee un Excel operativo (FECHA/CHOFER/UNIDAD/CLIENTE/SERVICIO)
   y clasifica cada renglón con CLIENTE_PLANES, agrupa por cliente y permite
   crear facturas (o registros) en lote.
   ═══════════════════════════════════════════════════════════════════════════ */
function BitacoraImport({onClose,showT}){
  const [file,setFile]=useState(null);
  const [rows,setRows]=useState([]);          // todos los renglones parseados
  const [step,setStep]=useState(1);           // 1=upload, 2=preview, 3=done
  const [grouped,setGrouped]=useState({});    // clienteId -> {info, items[], total}
  const [unmapped,setUnmapped]=useState([]);  // renglones sin cliente mapeado
  const [saving,setSaving]=useState(false);
  const [defaultIVA,setDefaultIVA]=useState(true);

  const handleFile = async(e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    setFile(f);
    try{
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf,{type:"array",cellDates:true});
      const allRows = [];
      wb.SheetNames.forEach(sheetName=>{
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:false});
        // Detecta fila de headers (la que tiene FECHA, CHOFER o CLIENTE)
        let headerIdx = -1;
        for(let i=0;i<Math.min(10,data.length);i++){
          const r = data[i].map(c=>(c||"").toString().toUpperCase());
          if(r.some(c=>c.includes("FECHA"))&&r.some(c=>c.includes("CLIENTE"))){
            headerIdx = i; break;
          }
        }
        if(headerIdx<0) return;
        const headers = data[headerIdx].map(c=>(c||"").toString().toUpperCase().trim());
        const idx = (k)=>headers.findIndex(h=>h.includes(k));
        const iFecha = idx("FECHA");
        const iChofer = idx("CHOFER");
        const iUnidad = idx("UNIDAD");
        const iKmRec = headers.findIndex(h=>h.includes("KM RECORRIDOS"));
        const iCliente = idx("CLIENTE");
        const iServicio = idx("SERVICIO");
        // Última columna numérica como monto (tu archivo lo tiene así)
        for(let i=headerIdx+1;i<data.length;i++){
          const r = data[i];
          if(!r||r.every(c=>c==null||c==="")) continue;
          const cliente = (r[iCliente]||"").toString().trim();
          if(!cliente) continue;
          // Detecta monto: cualquier celda numérica >= 100 que NO sea km
          let monto = null;
          for(let c=0;c<r.length;c++){
            if(c===iKmRec) continue;
            const v = r[c];
            const n = typeof v==="number"?v:parseFloat(v);
            if(!isNaN(n)&&n>=100&&n<10000000){monto = n;}
          }
          const fecha = r[iFecha];
          let fechaStr = "";
          if(fecha instanceof Date) fechaStr = fecha.toISOString().slice(0,10);
          else if(typeof fecha==="string"&&fecha) fechaStr = fecha;
          const matched = lookupPlanForCliente(cliente);
          allRows.push({
            sheet: sheetName,
            fecha: fechaStr,
            chofer: (r[iChofer]||"").toString().trim(),
            unidad: (r[iUnidad]||"").toString().trim(),
            kmRecorridos: typeof r[iKmRec]==="number"?r[iKmRec]:parseFloat(r[iKmRec])||0,
            clienteRaw: cliente,
            servicio: (r[iServicio]||"").toString().trim(),
            monto: monto||0,
            mapped: matched,
            include: !!matched&&!!monto, // por defecto incluye los mapeados con monto
          });
        }
      });
      setRows(allRows);
      // Agrupa
      const g = {};
      const um = [];
      allRows.forEach((r,i)=>{
        if(r.mapped){
          const id = r.mapped.id;
          if(!g[id]) g[id] = {info:r.mapped,items:[],totalMonto:0,totalConMonto:0};
          g[id].items.push({...r,_idx:i});
          if(r.monto>0){g[id].totalMonto += r.monto; g[id].totalConMonto++;}
        }else{
          um.push({...r,_idx:i});
        }
      });
      setGrouped(g);
      setUnmapped(um);
      setStep(2);
    }catch(err){
      showT("Error leyendo el archivo: "+err.message,"err");
    }
  };

  const toggleRow = (idx)=>{
    setRows(rs=>{
      const next = rs.map((r,i)=>i===idx?{...r,include:!r.include}:r);
      // Re-agrupa
      const g = {};
      next.forEach((r,i)=>{
        if(r.mapped){
          const id = r.mapped.id;
          if(!g[id]) g[id] = {info:r.mapped,items:[],totalMonto:0,totalConMonto:0};
          g[id].items.push({...r,_idx:i});
          if(r.monto>0&&r.include){g[id].totalMonto += r.monto; g[id].totalConMonto++;}
        }
      });
      setGrouped(g);
      return next;
    });
  };

  const crearFacturas = async()=>{
    setSaving(true);
    const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    let created = 0;
    try{
      for(const id of Object.keys(grouped)){
        const g = grouped[id];
        const itemsConMonto = g.items.filter(it=>it.include&&it.monto>0);
        if(itemsConMonto.length===0) continue;
        // Una factura por cliente — agrega los servicios concatenados
        const subtotal = itemsConMonto.reduce((a,it)=>a+it.monto,0);
        const ivaAmt = defaultIVA?subtotal*.16:0;
        const total = subtotal+ivaAmt;
        const fechas = itemsConMonto.map(it=>it.fecha).filter(Boolean).sort();
        const fechaIni = fechas[0]||new Date().toISOString().slice(0,10);
        const fechaFin = fechas[fechas.length-1]||fechaIni;
        const dIni = new Date(fechaIni); const dFin = new Date(fechaFin);
        const mesOp = MESES[dFin.getMonth()];
        const anio = dFin.getFullYear();
        const venc = new Date(dFin.getTime()+30*86400000).toISOString().slice(0,10);
        const servicios = itemsConMonto.map(it=>`${it.fecha?it.fecha+" - ":""}${it.servicio}`).join(" | ");
        await addDoc(collection(db,"facturas"),{
          mesOp, anio,
          empresa: g.info.empresa,
          plan: g.info.plan,
          solicitante: g.info.cliente,
          servicio: servicios.slice(0,500),
          subtotal, ivaAmt, total,
          iva: defaultIVA,
          status: "Pendiente",
          notas: `Generada desde bitácora · ${itemsConMonto.length} servicio(s) · ${fechaIni} a ${fechaFin}`,
          fechaEmision: new Date().toISOString().slice(0,10),
          fechaVenc: venc,
          emailCliente: "",
          folio: "FAC-"+uid(),
          bitacoraImport: true,
          bitacoraServicios: itemsConMonto.map(it=>({fecha:it.fecha,chofer:it.chofer,unidad:it.unidad,clienteRaw:it.clienteRaw,servicio:it.servicio,monto:it.monto})),
          createdAt: serverTimestamp(),
        });
        created++;
      }
      showT(`✓ ${created} factura(s) creada(s) desde bitácora`);
      setStep(3);
      setTimeout(()=>onClose(),1500);
    }catch(e){showT("Error guardando: "+e.message,"err");}
    setSaving(false);
  };

  // PASO 1 — Upload
  if(step===1) return(
    <Modal title="Importar bitácora operativa" onClose={onClose} icon={Upload} iconColor={BLUE} wide>
      <div style={{padding:"20px 0"}}>
        <div style={{background:BLUE+"08",border:"1.5px solid "+BLUE+"30",borderRadius:11,padding:14,marginBottom:18,fontSize:12,color:TEXT,lineHeight:1.6}}>
          <div style={{fontWeight:800,color:BLUE,marginBottom:6,display:"flex",alignItems:"center",gap:7}}>
            <Zap size={14}/>Clasificación automática
          </div>
          El sistema lee tu bitácora (formato: FECHA / CHOFER / UNIDAD / CLIENTE / SERVICIO / MONTO) e identifica automáticamente la <strong>empresa que factura</strong> y el <strong>plan</strong> según el cliente:
          <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr",gap:6}}>
            {CLIENTE_PLANES.map(cp=>(
              <div key={cp.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#fff",borderRadius:7,border:"1px solid "+cp.color+"30"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:cp.color}}/>
                <strong style={{color:cp.color,fontSize:11}}>{cp.cliente}</strong>
                <span style={{fontSize:10,color:MUTED}}>→ {cp.empresa}</span>
                <span style={{fontSize:10,color:MUTED,marginLeft:"auto",fontFamily:MONO}}>{cp.plan}</span>
              </div>
            ))}
          </div>
        </div>
        <label htmlFor="bit-file" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:"40px 20px",background:A+"06",border:"2px dashed "+A+"50",borderRadius:14,cursor:"pointer"}}>
          <Upload size={32} color={A}/>
          <div style={{fontFamily:DISP,fontWeight:800,fontSize:15,color:A}}>Selecciona el archivo de bitácora</div>
          <div style={{fontSize:11,color:MUTED}}>.xlsx o .xls — Funciona con tu formato mensual de operación</div>
          <input id="bit-file" type="file" accept=".xlsx,.xls" onChange={handleFile} style={{display:"none"}}/>
        </label>
      </div>
    </Modal>
  );

  // PASO 2 — Preview
  if(step===2){
    const groupedArr = Object.values(grouped);
    const grandTotal = groupedArr.reduce((a,g)=>a+g.totalMonto,0);
    const ivaTotal = defaultIVA?grandTotal*.16:0;
    return(
      <Modal title="Vista previa — clasificación" onClose={onClose} icon={Eye} iconColor={BLUE} wide>
        <div style={{padding:"4px 0",maxHeight:"75vh",overflowY:"auto"}}>
          <div style={{background:GREEN+"08",border:"1.5px solid "+GREEN+"30",borderRadius:11,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:12,color:TEXT}}><strong>{rows.length}</strong> renglones leídos · <strong>{rows.filter(r=>r.mapped).length}</strong> clasificados · <strong>{unmapped.length}</strong> sin mapear</div>
            <div style={{fontSize:12,color:GREEN,fontWeight:700}}>{fmt(grandTotal)} subtotal · {fmt(ivaTotal)} IVA · {fmt(grandTotal+ivaTotal)} total</div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:TEXT,marginBottom:14,cursor:"pointer"}}>
            <input type="checkbox" checked={defaultIVA} onChange={e=>setDefaultIVA(e.target.checked)} style={{accentColor:A}}/>
            Aplicar IVA 16% a todas las facturas generadas
          </label>
          {/* Grupos por cliente */}
          {groupedArr.map(g=>(
            <div key={g.info.id} style={{background:"#fff",border:"2px solid "+g.info.color+"40",borderRadius:12,marginBottom:12,overflow:"hidden"}}>
              <div style={{padding:"11px 14px",background:g.info.color+"10",borderBottom:"1px solid "+g.info.color+"20",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:g.info.color}}/>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{fontWeight:800,fontSize:14,color:g.info.color}}>{g.info.cliente} · {g.items.filter(it=>it.include&&it.monto>0).length} servicios facturables</div>
                  <div style={{fontSize:11,color:MUTED,marginTop:1}}>{g.info.empresa} · <span style={{fontFamily:MONO}}>{g.info.plan}</span></div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:MONO,fontSize:16,fontWeight:800,color:g.info.color}}>{fmt(g.totalMonto)}</div>
                  <div style={{fontSize:10,color:MUTED}}>+ IVA = {fmt(g.totalMonto*1.16)}</div>
                </div>
              </div>
              <div style={{maxHeight:200,overflowY:"auto"}}>
                {g.items.map((it)=>(
                  <div key={it._idx} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderBottom:"1px solid "+BORDER+"60",fontSize:11,opacity:it.include?1:.45}}>
                    <input type="checkbox" checked={it.include} onChange={()=>toggleRow(it._idx)} style={{accentColor:g.info.color,marginTop:1}}/>
                    <span style={{fontFamily:MONO,color:MUTED,width:80,flexShrink:0}}>{it.fecha||"—"}</span>
                    <span style={{width:80,flexShrink:0,fontWeight:600}}>{it.chofer}</span>
                    <span style={{width:70,flexShrink:0,fontFamily:MONO,fontSize:10,color:MUTED}}>{it.unidad}</span>
                    <span style={{flex:1,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.servicio}</span>
                    <span style={{fontFamily:MONO,fontWeight:800,color:it.monto>0?g.info.color:MUTED,width:90,textAlign:"right",flexShrink:0}}>{it.monto>0?fmt(it.monto):"—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Sin mapear */}
          {unmapped.length>0&&<div style={{background:"#fff",border:"2px dashed "+AMBER+"60",borderRadius:12,marginBottom:12,overflow:"hidden"}}>
            <div style={{padding:"11px 14px",background:AMBER+"10",borderBottom:"1px solid "+AMBER+"30",display:"flex",alignItems:"center",gap:10}}>
              <AlertCircle size={14} color={AMBER}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:13,color:AMBER}}>{unmapped.length} renglones sin cliente conocido</div>
                <div style={{fontSize:10,color:MUTED,marginTop:1}}>Estos NO se facturarán automáticamente. Agrégalos manualmente o registra el alias en CLIENTE_PLANES.</div>
              </div>
            </div>
            <div style={{maxHeight:140,overflowY:"auto"}}>
              {unmapped.slice(0,20).map(it=>(
                <div key={it._idx} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderBottom:"1px solid "+BORDER+"60",fontSize:11}}>
                  <span style={{fontFamily:MONO,color:MUTED,width:80,flexShrink:0}}>{it.fecha||"—"}</span>
                  <span style={{width:120,flexShrink:0,fontWeight:700,color:AMBER}}>{it.clienteRaw}</span>
                  <span style={{flex:1,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.servicio}</span>
                  <span style={{fontFamily:MONO,color:MUTED,width:80,textAlign:"right",flexShrink:0}}>{it.monto?fmt(it.monto):"—"}</span>
                </div>
              ))}
              {unmapped.length>20&&<div style={{padding:8,textAlign:"center",fontSize:10,color:MUTED}}>+{unmapped.length-20} más…</div>}
            </div>
          </div>}
        </div>
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <button onClick={()=>{setStep(1);setRows([]);setGrouped({});setUnmapped([]);setFile(null);}} className="btn" style={{flex:1,padding:"12px 0",borderRadius:11,background:"#fff",border:"1.5px solid "+BD2,color:TEXT,fontWeight:700,fontSize:13}}>
            ← Cambiar archivo
          </button>
          <button onClick={crearFacturas} disabled={saving||groupedArr.length===0} className="btn" style={{flex:2,padding:"12px 0",borderRadius:11,background:saving||groupedArr.length===0?"#e0e0e0":"linear-gradient(135deg,"+GREEN+",#10b981)",color:"#fff",fontFamily:DISP,fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            {saving?<><div className="spin" style={{width:14,height:14,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}}/>Creando facturas…</>:<><CheckCircle size={15}/>Crear {groupedArr.length} factura(s)</>}
          </button>
        </div>
      </Modal>
    );
  }

  // PASO 3 — Done
  return(
    <Modal title="Importación completada" onClose={onClose} icon={CheckCircle} iconColor={GREEN}>
      <div style={{padding:"30px 20px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:14}}>🎉</div>
        <div style={{fontFamily:DISP,fontWeight:800,fontSize:18,color:GREEN,marginBottom:8}}>Listo, facturas creadas</div>
        <div style={{fontSize:13,color:MUTED}}>Las verás aparecer en la lista en un instante.</div>
      </div>
    </Modal>
  );
}

function Facturas(){
  const [items,setItems]=useState([]);const [load,setLoad]=useState(true);
  const [modal,setModal]=useState(false);const [editItem,setEditItem]=useState(null);
  const [showBitacora,setShowBitacora]=useState(false);
  const [toast,setToast]=useState(null);const [tab,setTab]=useState("registros");const [mesF,setMesF]=useState("todos");
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const ANIO=new Date().getFullYear();
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  const empty={mesOp:MESES[new Date().getMonth()],anio:ANIO,plan:"",empresa:"",solicitante:"",servicio:"",subtotal:"",iva:true,status:"Pendiente",notas:"",fechaEmision:new Date().toISOString().slice(0,10),fechaVenc:"",emailCliente:""};
  const [form,setForm]=useState(empty);
  const sf=k=>e=>setForm(f=>({...f,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));

  useEffect(()=>onSnapshot(collection(db,"facturas"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setLoad(false);
  }),[]);

  const openNew=()=>{setForm(empty);setEditItem(null);setModal(true);};
  const openEdit=f=>{setForm({mesOp:f.mesOp||MESES[0],anio:f.anio||ANIO,plan:f.plan||"",empresa:f.empresa||f.cliente||"",solicitante:f.solicitante||"",servicio:f.servicio||"",subtotal:String(f.subtotal||f.monto||""),iva:f.ivaAmt>0,status:f.status||"Pendiente",notas:f.notas||"",fechaEmision:f.fechaEmision||"",fechaVenc:f.fechaVenc||"",emailCliente:f.emailCliente||""});setEditItem(f);setModal(true);};

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
          <button onClick={()=>setShowBitacora(true)} className="btn" title="Importar bitácora operativa (Excel) y clasificar automáticamente" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+BLUE+"40",color:BLUE,borderRadius:12,padding:"10px 16px",fontWeight:700,fontSize:13}}><Upload size={13}/>Importar bitácora</button>
          <button onClick={()=>exportFacturasXLSX(filt,mesF==="todos"?null:mesF)} className="btn" title="Exportar facturas a Excel" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+GREEN+"40",color:GREEN,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><Download size={13}/>XLSX Facturas</button>
          <button onClick={()=>exportFinancierosXLSX(items)} className="btn" title="Exportar financieros completos" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+VIOLET+"40",color:VIOLET,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><BarChart2 size={13}/>XLSX Financiero</button>
          <button onClick={openNew} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"30"}}><Plus size={14}/>Nuevo registro</button>
        </div>
      </div>

      <div className="g4" style={{marginBottom:18}}>
        <KpiCard icon={BarChart2} color={BLUE} label="Total facturado" value={fmtK(totTotal)} sub={filt.length+" registros"}/>
        <KpiCard icon={CheckCircle} color={GREEN} label="Cobrado" value={fmtK(cobrado)} sub={totTotal>0?Math.round(cobrado/totTotal*100)+"%":"0%"}/>
        <KpiCard icon={Clock} color={AMBER} label="Por cobrar" value={fmtK(pendiente)}/>
        <KpiCard icon={AlertCircle} color={ROSE} label="Vencido" value={fmtK(vencido)}/>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
        {[["registros","📋 Registros"],["cartera","💰 Cartera vencida"],["proyecciones","📈 Proyecciones"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className="btn" style={{padding:"7px 18px",borderRadius:10,border:"1.5px solid "+(tab===k?A:BD2),background:tab===k?A+"10":"#fff",color:tab===k?A:MUTED,fontWeight:tab===k?700:500,fontSize:13,cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      {tab==="cartera"&&(()=>{
        const hoyMs = Date.now();
        const cart = items.filter(f=>(f.status==="Pendiente"||f.status==="Vencida")&&f.fechaVenc&&new Date(f.fechaVenc).getTime()<hoyMs)
          .map(f=>({...f,diasVencido:Math.floor((hoyMs-new Date(f.fechaVenc).getTime())/86400000)}))
          .sort((a,b)=>b.diasVencido-a.diasVencido);
        const buckets = {"1-15":0,"16-30":0,"31-60":0,"60+":0};
        cart.forEach(f=>{
          if(f.diasVencido<=15) buckets["1-15"]+=f.total||0;
          else if(f.diasVencido<=30) buckets["16-30"]+=f.total||0;
          else if(f.diasVencido<=60) buckets["31-60"]+=f.total||0;
          else buckets["60+"]+=f.total||0;
        });
        const totalCart = cart.reduce((a,f)=>a+(f.total||0),0);
        const recordarPago = (f)=>{
          const tel = f.telCliente||"";
          const email = f.emailCliente||"";
          const msg = `Recordatorio de pago · DMvimiento\n\nFactura ${f.folio||""} · ${fmt(f.total||0)}\nVencida hace ${f.diasVencido} días\n\nAgradecemos tu atención para regularizar el pago.`;
          if(tel) window.open(`https://wa.me/52${tel.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank");
          else if(email) window.location.href=`mailto:${email}?subject=${encodeURIComponent("Recordatorio de pago - "+(f.folio||""))}&body=${encodeURIComponent(msg)}`;
          else alert("Agrega teléfono o email del cliente en la factura para enviar recordatorio");
        };
        return(<>
          <div className="g4" style={{marginBottom:16,gridTemplateColumns:"repeat(5,1fr)"}}>
            <KpiCard icon={AlertCircle} color={ROSE} label="Cartera total vencida" value={fmtK(totalCart)} sub={cart.length+" facturas"}/>
            <KpiCard icon={Clock} color={AMBER} label="1-15 días" value={fmtK(buckets["1-15"])}/>
            <KpiCard icon={Clock} color={AMBER} label="16-30 días" value={fmtK(buckets["16-30"])}/>
            <KpiCard icon={AlertCircle} color={ROSE} label="31-60 días" value={fmtK(buckets["31-60"])}/>
            <KpiCard icon={AlertCircle} color="#991b1b" label="60+ días" value={fmtK(buckets["60+"])}/>
          </div>
          {cart.length===0?<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:40,textAlign:"center",color:GREEN,fontSize:14,fontWeight:700}}>✓ Sin cartera vencida — todo al corriente</div>
          :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{borderBottom:"1px solid "+BORDER,background:"#fafbfd"}}>
                {["Folio","Empresa","Total","Vencimiento","Días vencida","Acciones"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>)}
              </tr></thead>
              <tbody>{cart.map(f=>{
                const urg = f.diasVencido>60?"#991b1b":f.diasVencido>30?ROSE:AMBER;
                return(
                  <tr key={f.id} style={{borderBottom:"1px solid "+BORDER}}>
                    <td style={{padding:"10px 14px",fontFamily:MONO,fontSize:11,color:MUTED}}>{f.folio||"—"}</td>
                    <td style={{padding:"10px 14px",fontWeight:700,fontSize:13}}>{f.empresa||f.cliente||"—"}</td>
                    <td style={{padding:"10px 14px",fontFamily:MONO,fontSize:14,fontWeight:800}}>{fmt(f.total||0)}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:MUTED}}>{new Date(f.fechaVenc).toLocaleDateString("es-MX")}</td>
                    <td style={{padding:"10px 14px"}}><span style={{background:urg+"18",color:urg,padding:"3px 10px",borderRadius:7,fontWeight:800,fontSize:12}}>{f.diasVencido} días</span></td>
                    <td style={{padding:"10px 14px"}}>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={()=>recordarPago(f)} className="btn" style={{padding:"5px 10px",borderRadius:7,background:BLUE+"10",border:"1px solid "+BLUE+"30",color:BLUE,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:4}}><Send size={11}/>Recordar</button>
                        <button onClick={()=>updStatus(f.id,"Pagada")} className="btn" style={{padding:"5px 10px",borderRadius:7,background:GREEN+"10",border:"1px solid "+GREEN+"30",color:GREEN,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:4}}><Check size={11}/>Pagó</button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </div>}
        </>);
      })()}

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
                    <button onClick={()=>downloadSolicitudFacturaXLSX(f)} className="btn" title="Descargar SOLICITUD DE FACTURA con formato oficial (XLSX) — para enviar a contabilidad" style={{color:GREEN,padding:"4px 8px",border:"1.5px solid "+GREEN+"40",background:GREEN+"10",borderRadius:6,display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700}}>
                      <FileText size={12}/>Solicitud
                    </button>
                    <button onClick={()=>downloadFacturaPDF(f)} className="btn" title="Descargar PDF interno" style={{color:BLUE,padding:"4px 6px",border:"1px solid "+BLUE+"20",borderRadius:6,display:"flex",alignItems:"center",gap:3,fontSize:11,fontWeight:600}}>
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

      {showBitacora&&<BitacoraImport onClose={()=>setShowBitacora(false)} showT={showT}/>}
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
          {/* Quick-pick de cliente conocido — auto-llena empresa+plan */}
          <div style={{gridColumn:"1/-1",background:"#f8fafd",border:"1.5px solid "+BORDER,borderRadius:11,padding:"10px 12px"}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.06em",display:"flex",alignItems:"center",gap:6}}><Zap size={11} color={A}/>Cliente conocido (auto-llena empresa + plan)</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {CLIENTE_PLANES.map(cp=>{
                const active = (form.empresa||"").toLowerCase().trim()===cp.empresa.toLowerCase().trim();
                return(
                  <button key={cp.id} type="button" onClick={()=>setForm(f=>({...f,empresa:cp.empresa,plan:cp.plan,_clienteId:cp.id,solicitante:f.solicitante||cp.cliente}))} className="btn" style={{padding:"7px 12px",borderRadius:9,border:"1.5px solid "+(active?cp.color:BD2),background:active?cp.color+"14":"#fff",color:active?cp.color:TEXT,fontWeight:active?800:600,fontSize:11,display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:cp.color}}/>
                    {cp.cliente}
                  </button>
                );
              })}
            </div>
            {form.empresa&&(()=>{
              const matched = CLIENTE_PLANES.find(cp=>cp.empresa.toLowerCase().trim()===(form.empresa||"").toLowerCase().trim());
              if(!matched) return null;
              return(
                <div style={{marginTop:8,fontSize:11,color:matched.color,fontWeight:700,display:"flex",alignItems:"center",gap:5,padding:"6px 10px",background:matched.color+"08",borderRadius:7,border:"1px solid "+matched.color+"30"}}>
                  <CheckCircle size={11}/>Detectado: <strong>{matched.cliente}</strong> · {matched.plan}
                </div>
              );
            })()}
          </div>
          <Inp label="Empresa a facturar *" value={form.empresa} onChange={e=>{
            const v = e.target.value;
            const matched = lookupPlanForCliente(v);
            if(matched) setForm(f=>({...f,empresa:matched.empresa,plan:matched.plan,_clienteId:matched.id}));
            else sf("empresa")(e);
          }} placeholder="Escribe SCJ, Canon, Actnow, Sofia… o nombre directo"/>
          <Inp label="Quien solicita el servicio" value={form.solicitante} onChange={sf("solicitante")} placeholder="Nombre del contacto"/>
          <Inp label="Plan / Cuenta" value={form.plan} onChange={sf("plan")} placeholder="Ej: 210201 PL Campari Promotores"/>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Estado de pago</div>
            <select value={form.status} onChange={sf("status")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {["Pendiente","Pagada","Vencida","Cancelada"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Fecha emisión</div>
            <input type="date" value={form.fechaEmision||""} onChange={sf("fechaEmision")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Vencimiento (cartera)</div>
            <input type="date" value={form.fechaVenc||""} onChange={sf("fechaVenc")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontSize:13}}/>
          </div>
          <Inp label="Email cliente (para envío)" value={form.emailCliente||""} onChange={sf("emailCliente")} type="email" placeholder="contacto@cliente.com"/>
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
      <div className="g4" style={{marginBottom:20}}>
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

  // Conversión 1-click a factura: crea un registro en facturas con los datos del presupuesto
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const toFactura = async(p)=>{
    if(p.convertidoAFacturaId){
      if(!confirm("Este presupuesto ya fue convertido a factura. ¿Crear otra factura de todas formas?")) return;
    }
    const today = new Date();
    const venc = new Date(Date.now()+30*86400000).toISOString().slice(0,10); // vencimiento +30 días
    const serviciosDesc = (p.conceptos||[]).map(c=>`${c.cant}× ${c.desc}`).filter(Boolean).join(" · ")||p.folio;
    try{
      const ref = await addDoc(collection(db,"facturas"),{
        mesOp: MESES[today.getMonth()],
        anio: today.getFullYear(),
        empresa: p.cliente||"",
        solicitante: p.contacto||"",
        plan: "",
        servicio: serviciosDesc,
        subtotal: p.subtotal||0,
        ivaAmt: p.ivaAmt||0,
        total: p.total||0,
        iva: (p.ivaAmt||0)>0,
        status: "Pendiente",
        notas: `Generada desde presupuesto ${p.folio||""}`,
        fechaEmision: today.toISOString().slice(0,10),
        fechaVenc: venc,
        emailCliente: p.emailCliente||"",
        presupuestoOrigenId: p.id,
        presupuestoOrigenFolio: p.folio||"",
        folio: "FAC-"+uid(),
        createdAt: serverTimestamp(),
      });
      // Marca el presupuesto como convertido + Aprobado
      await updateDoc(doc(db,"presupuestos",p.id),{
        convertidoAFacturaId: ref.id,
        convertidoEn: serverTimestamp(),
        status: "Aprobado",
      });
      showT("✓ Factura creada desde presupuesto");
    }catch(e){showT(e.message,"err");}
  };

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

      <div className="g4" style={{marginBottom:16}}>
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
                    <button onClick={()=>toFactura(p)} className="btn" title="Convertir a factura" style={{color:GREEN,padding:"4px 8px",border:"1px solid "+GREEN+"30",background:GREEN+"08",borderRadius:6,display:"flex",alignItems:"center",gap:3,fontSize:11,fontWeight:700}}>
                      {p.convertidoAFacturaId?<><Check size={12}/>Facturado</>:<><FileText size={12}/>→ Factura</>}
                    </button>
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

  const logout=()=>{
    localStorage.removeItem("dmov_chofer");
    localStorage.removeItem("dmov_chofer_last_code"); // borra credencial guardada
    setChofer(null);
  };

  const login=async(tel,codigo,remember=true)=>{
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
  // Rellena automáticamente el último teléfono usado (acceso más rápido)
  const [tel,setTel]=useState(()=>{
    try{return localStorage.getItem("dmov_chofer_last_tel")||"";}catch(e){return "";}
  });
  const [codigo,setCodigo]=useState("");
  const [loading,setLoading]=useState(false);
  const [remember,setRemember]=useState(true);

  const handle=async(e)=>{
    if(e&&e.preventDefault) e.preventDefault();
    if(!tel||!codigo){return;}
    setLoading(true);
    const ok = await onLogin(tel,codigo,remember);
    if(ok&&remember){
      try{
        localStorage.setItem("dmov_chofer_last_tel",tel.replace(/\D/g,""));
        // Guarda también código codificado básico (NO es seguridad real, solo conveniencia)
        localStorage.setItem("dmov_chofer_last_code",btoa(codigo));
      }catch(e){}
    }
    setLoading(false);
  };

  // Si ya hay credenciales guardadas, intenta auto-login al cargar
  useEffect(()=>{
    try{
      const savedTel = localStorage.getItem("dmov_chofer_last_tel");
      const savedCode = localStorage.getItem("dmov_chofer_last_code");
      if(savedTel&&savedCode){
        setTel(savedTel);
        const dec = atob(savedCode);
        setCodigo(dec);
        // Intenta login automático en background
        setTimeout(async()=>{
          setLoading(true);
          await onLogin(savedTel,dec,true);
          setLoading(false);
        },300);
      }
    }catch(e){}
  },[]);

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1628,#1e293b)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:SANS}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <form onSubmit={handle} className="pi" style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:24,padding:32,boxShadow:"0 32px 80px rgba(0,0,0,.4)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:64,height:64,borderRadius:18,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:22,color:"#fff",margin:"0 auto 14px"}}>DM</div>
          <h1 style={{fontFamily:DISP,fontWeight:900,fontSize:26,color:TEXT,letterSpacing:"-0.02em"}}>DMvimiento</h1>
          <div style={{fontSize:11,color:MUTED,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginTop:3}}>App Chofer</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label htmlFor="chofer-tel" style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em",display:"block"}}>Teléfono</label>
            <div style={{position:"relative"}}>
              <Phone size={15} color={MUTED} style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",zIndex:1}}/>
              <input id="chofer-tel" name="username" type="tel" autoComplete="username" inputMode="numeric" value={tel} onChange={e=>setTel(e.target.value)} placeholder="5512345678"
                style={{width:"100%",padding:"14px 14px 14px 40px",fontSize:15,border:"1.5px solid "+BD2,borderRadius:12,fontFamily:SANS}}/>
            </div>
          </div>
          <div>
            <label htmlFor="chofer-code" style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em",display:"block"}}>Código de acceso</label>
            <div style={{position:"relative"}}>
              <Hash size={15} color={MUTED} style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",zIndex:1}}/>
              <input id="chofer-code" name="password" type="password" autoComplete="current-password" value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6}
                style={{width:"100%",padding:"14px 14px 14px 40px",fontSize:16,fontFamily:MONO,fontWeight:800,letterSpacing:"0.15em",border:"1.5px solid "+BD2,borderRadius:12,textTransform:"uppercase"}}/>
            </div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:TEXT,cursor:"pointer",paddingLeft:2,marginTop:2}}>
            <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} style={{width:16,height:16,accentColor:A}}/>
            <span>Mantener sesión iniciada en este dispositivo</span>
          </label>
          <button type="submit" disabled={loading||!tel||!codigo} className="btn" style={{marginTop:6,background:loading||!tel||!codigo?"#e0e0e0":"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"14px 0",fontFamily:DISP,fontWeight:700,fontSize:15,boxShadow:"0 6px 20px "+A+"30"}}>
            {loading?"Verificando…":"Ingresar"}
          </button>
          <div style={{fontSize:11,color:MUTED,textAlign:"center",marginTop:6,lineHeight:1.5}}>
            Pide a tu administrador el código de acceso de 6 caracteres
          </div>
        </div>
      </form>
    </div>
  );
}

function ChoferDashboard({chofer,onLogout,showT,toast,setToast}){
  const [misRutas,setMisRutas]=useState([]);
  const [activeRuta,setActiveRuta]=useState(null);
  const [tracking,setTracking]=useState(false);
  const [justFinished,setJustFinished]=useState(null); // muestra celebración post-completar
  const [chatUnread,setChatUnread]=useState(0);
  const watchIdRef = useRef(null);

  // Suscripción a mensajes no leídos del admin (para badge)
  useEffect(()=>{
    const q = query(collection(db,"mensajes"),where("to","==",chofer.id),where("read","==",false));
    return onSnapshot(q,s=>setChatUnread(s.docs.length));
  },[chofer.id]);

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
  const wakeLockRef = useRef(null);
  const requestWakeLock = async()=>{
    try{
      if("wakeLock" in navigator){
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release",()=>{wakeLockRef.current=null;});
      }
    }catch(e){console.warn("WakeLock error",e);}
  };
  // Re-adquirir WakeLock cuando la pestaña vuelve a primer plano
  useEffect(()=>{
    const onVis = ()=>{
      if(document.visibilityState==="visible"&&tracking&&!wakeLockRef.current){
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange",onVis);
    return()=>document.removeEventListener("visibilitychange",onVis);
  },[tracking]);

  // Notificaciones diferenciadas al cliente (WhatsApp con msg específico por evento)
  const notifyClienteEvent = (ruta,evento,extra={})=>{
    if(!ruta.clienteTel||ruta.clienteTel.replace(/\D/g,"").length!==10) return;
    const trackUrl = `${window.location.origin}/track/${ruta.trackingId||ruta.id}`;
    const nombreChofer = chofer.nombre;
    const cliente = ruta.cliente||"";
    const primer = (ruta.stops||[]).find(s=>s.isOrigin)||(ruta.stops||[])[0]||{};
    const primerPunto = primer?.city||"el punto de carga";
    let msg = "";
    switch(evento){
      case "setout":
        msg = `🚚 DMvimiento — ${nombreChofer} salió hacia el punto de carga (${primerPunto}). Sigue en tiempo real: ${trackUrl}`;
        break;
      case "pickup-arrived":
        msg = `📍 DMvimiento — ${nombreChofer} llegó a ${primerPunto} y está preparando la carga. Sigue: ${trackUrl}`;
        break;
      case "loaded":
        msg = `📦✅ DMvimiento — Material cargado. En camino a ${extra.nextCity||"el siguiente destino"}. ${trackUrl}`;
        break;
      case "stop-arrived":
        msg = `📬 DMvimiento — ${nombreChofer} llegó a ${extra.city||"la parada"} ${extra.stopIdx?"(parada "+extra.stopIdx+")":""}. Tracking: ${trackUrl}`;
        break;
      case "stop-delivered":
        msg = `✅ DMvimiento — Entrega confirmada en ${extra.city||"la parada"}${extra.notas?" · "+extra.notas:""}${extra.fotoURL?" · 📸 con evidencia":""}. ${trackUrl}`;
        break;
      case "completed":
        msg = `🏁 DMvimiento — Ruta "${ruta.nombre}" completada con éxito. Ver detalles y evidencias: ${trackUrl}`;
        break;
      case "issue":
        msg = `⚠️ DMvimiento — Incidente en ${extra.city||"la parada"}${extra.tipo?" — "+extra.tipo:""}: ${extra.notas||""}\n${trackUrl}`;
        break;
    }
    const waUrl = `https://wa.me/52${ruta.clienteTel.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`;
    const label = {setout:"saliste hacia el punto de carga",["pickup-arrived"]:"llegaste al punto de carga",loaded:"cargaste material",["stop-arrived"]:"llegaste a una parada",["stop-delivered"]:"confirmaste una entrega",completed:"completaste la ruta",issue:"hay un incidente"}[evento]||"hay una actualización";
    setTimeout(()=>{if(confirm(`¿Avisar al cliente que ${label}?`))window.open(waUrl,"_blank");},300);
  };

  const startTracking = async(ruta)=>{
    if(!("geolocation" in navigator)){showT("GPS no disponible en este dispositivo","err");return;}
    setActiveRuta(ruta);
    setTracking(true);
    // Fase 0 "Camino a carga" — el chofer sale hacia el primer punto, aún no está en ruta formal
    const fase = ruta.fase||"en-curso";
    const initialStatus = ruta.primerArribo?"En curso":"Camino a carga";
    const initialFase = ruta.primerArribo?"en-ruta":"camino-a-carga";
    updateDoc(doc(db,"rutas",ruta.id),{status:initialStatus,fase:initialFase,iniciadaEn:ruta.iniciadaEn||serverTimestamp()}).catch(()=>{});
    updateDoc(doc(db,"choferes",chofer.id),{status:"En ruta",rutaActivaId:ruta.id,rutaActivaNombre:ruta.nombre}).catch(()=>{});
    postAlert(ruta.id,chofer.id,chofer.nombre,"start",`Salió hacia el punto de carga: ${ruta.nombre}`);
    // Notifica con mensaje específico de "salida"
    if(initialFase==="camino-a-carga") notifyClienteEvent(ruta,"setout");
    // WakeLock para que la pantalla no se apague (evita que el GPS se pause)
    await requestWakeLock();
    // Notificación persistente del sistema operativo
    try{
      if("Notification" in window && Notification.permission==="granted"){
        new Notification("🚚 GPS activo — DMvimiento",{
          body:"Mantén esta pestaña abierta para transmitir tu ubicación. La pantalla se mantendrá encendida.",
          icon:"/icon.svg",
          tag:"gps-active",
          requireInteraction:false,
        });
      }
    }catch(e){}
    // Geofence + watch
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
        // Guarda en localStorage para recuperación si el nav pausa
        try{localStorage.setItem("dmov_last_gps",JSON.stringify({lat,lng,heading,speed,ts:Date.now(),rutaId:ruta.id}));}catch(e){}
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
    // Liberar WakeLock
    try{if(wakeLockRef.current){await wakeLockRef.current.release();wakeLockRef.current=null;}}catch(e){}
    if(activeRuta){
      const finished = activeRuta;
      await updateDoc(doc(db,"rutas",activeRuta.id),{status:"Completada",fase:"completada",completadaEn:serverTimestamp(),progreso:100}).catch(()=>{});
      await updateDoc(doc(db,"choferes",chofer.id),{status:"Disponible",rutaActivaId:"",rutaActivaNombre:""}).catch(()=>{});
      await deleteDoc(doc(db,"driverLocations",chofer.id)).catch(()=>{});
      postAlert(activeRuta.id,chofer.id,chofer.nombre,"complete","Completó la ruta: "+activeRuta.nombre);
      notifyClienteEvent(activeRuta,"completed");
      setActiveRuta(null);
      setJustFinished(finished);
    }
  };

  useEffect(()=>()=>{if(watchIdRef.current!==null)navigator.geolocation.clearWatch(watchIdRef.current);},[]);

  // Expone notifyClienteEvent al subcomponente ChoferRutaActiva via window
  useEffect(()=>{
    window.__notifyEvent__ = notifyClienteEvent;
    return()=>{delete window.__notifyEvent__;};
  },[chofer]);

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
      <div style={{background:"#0a1628",color:"#fff",padding:"calc(env(safe-area-inset-top,0) + 14px) 16px 14px",position:"sticky",top:0,zIndex:50}}>
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
          <button onClick={()=>setTabChofer("chat")} className="btn" style={{flex:"1 0 auto",padding:"9px 8px",borderRadius:9,background:tabChofer==="chat"?BLUE:"transparent",color:tabChofer==="chat"?"#fff":MUTED,fontWeight:700,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",gap:3,whiteSpace:"nowrap",position:"relative"}}>
            <Send size={10}/>Chat{chatUnread>0&&<span style={{background:ROSE,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:8,fontWeight:900,marginLeft:2}}>{chatUnread}</span>}
          </button>
          <button onClick={()=>setTabChofer("historial")} className="btn" style={{flex:"1 0 auto",padding:"9px 8px",borderRadius:9,background:tabChofer==="historial"?GREEN:"transparent",color:tabChofer==="historial"?"#fff":MUTED,fontWeight:700,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",gap:3,whiteSpace:"nowrap"}}>
            <CheckCircle size={10}/>Hist. ({rutasCompletadas.length})
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

        {/* TAB: CHAT — mensajería con admin */}
        {tabChofer==="chat"&&<ChoferChat chofer={chofer}/>}

        {/* TAB: PERFIL — stats históricas del chofer */}
        {tabChofer==="perfil"&&<ChoferPerfil chofer={chofer} misRutas={misRutas} rutasCompletadas={rutasCompletadas} onLogout={onLogout}/>}
      </div>}
    </div>
  );
}

/* ChoferChat — mensajería con admin desde el celular del chofer */
function ChoferChat({chofer}){
  const [msgs,setMsgs]=useState([]);
  const [draft,setDraft]=useState("");
  const bottomRef=useRef(null);

  useEffect(()=>{
    const q = query(collection(db,"mensajes"),where("from","in",["admin",chofer.id]));
    return onSnapshot(q,s=>{
      const items = s.docs.map(d=>({id:d.id,...d.data()}))
        .filter(m=>(m.from==="admin"&&m.to===chofer.id)||(m.from===chofer.id&&m.to==="admin"))
        .sort((a,b)=>(a.ts?.seconds||0)-(b.ts?.seconds||0));
      setMsgs(items);
      // Marca como leídos los entrantes del admin
      items.forEach(m=>{
        if(m.from==="admin"&&!m.read){
          updateDoc(doc(db,"mensajes",m.id),{read:true}).catch(()=>{});
        }
      });
    });
  },[chofer.id]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const enviar = async()=>{
    if(!draft.trim()) return;
    await sendMessage({from:chofer.id,fromName:chofer.nombre,to:"admin",toName:"Administración",text:draft.trim()});
    setDraft("");
  };

  return(
    <div style={{background:"#fff",borderRadius:14,boxShadow:"0 1px 4px rgba(12,24,41,.04)",overflow:"hidden",display:"flex",flexDirection:"column",height:"calc(100vh - 240px)",minHeight:400}}>
      {/* Header admin */}
      <div style={{padding:"14px 16px",borderBottom:"1px solid "+BORDER,display:"flex",alignItems:"center",gap:10,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff"}}>
        <div style={{width:38,height:38,borderRadius:11,background:"rgba(255,255,255,.22)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:13}}>DM</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:DISP,fontWeight:800,fontSize:15}}>Administración</div>
          <div style={{fontSize:11,opacity:.9}}>Mensajería interna · DMvimiento</div>
        </div>
      </div>
      {/* Mensajes */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 14px",background:"#f6f9ff"}}>
        {msgs.length===0?<div style={{textAlign:"center",color:MUTED,fontSize:12,padding:40}}>
          <Send size={28} color={BD2} style={{marginBottom:10}}/>
          <div style={{fontWeight:700,color:TEXT,fontSize:14,marginBottom:3}}>Sin mensajes</div>
          <div>Envía el primer mensaje a administración</div>
        </div>
        :msgs.map(m=>{
          const mine = m.from===chofer.id;
          return(
            <div key={m.id} style={{display:"flex",justifyContent:mine?"flex-end":"flex-start",marginBottom:6}}>
              <div style={{maxWidth:"80%",background:mine?"linear-gradient(135deg,"+A+",#fb923c)":"#fff",color:mine?"#fff":TEXT,padding:"9px 13px",borderRadius:mine?"14px 14px 4px 14px":"14px 14px 14px 4px",boxShadow:"0 1px 3px rgba(12,24,41,.08)",fontSize:13,lineHeight:1.4,wordWrap:"break-word"}}>
                {m.text}
                <div style={{fontSize:9,opacity:.65,marginTop:4,textAlign:"right"}}>{m.ts?.seconds?new Date(m.ts.seconds*1000).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):""}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      {/* Input */}
      <div style={{padding:"10px 12px",borderTop:"1px solid "+BORDER,display:"flex",gap:7,background:"#fafbfd"}}>
        <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")enviar();}} placeholder="Escribe un mensaje…" style={{flex:1,padding:"10px 13px",border:"1.5px solid "+BD2,borderRadius:10,fontSize:13,background:"#fff"}}/>
        <button onClick={enviar} disabled={!draft.trim()} className="btn" style={{padding:"0 14px",borderRadius:10,background:draft.trim()?"linear-gradient(135deg,"+A+",#fb923c)":"#e0e0e0",color:"#fff",fontWeight:700,fontSize:13,display:"flex",alignItems:"center"}}><Send size={14}/></button>
      </div>
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
      {/* Aviso GPS — mantener pantalla encendida */}
      {tracking&&<div style={{background:"linear-gradient(135deg,"+BLUE+"12,"+BLUE+"22)",borderBottom:"1px solid "+BLUE+"30",padding:"9px 14px",display:"flex",alignItems:"center",gap:10,fontSize:11,color:BLUE}}>
        <Radio size={14} className="pulse" style={{flexShrink:0}}/>
        <div style={{flex:1,lineHeight:1.4}}>
          <strong>GPS activo · </strong>Mantén esta app abierta en primer plano. Si cierras o minimizas el navegador el GPS se detiene.
        </div>
      </div>}
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
              {/* ORIGEN: botones de llegada y cargué material */}
              {isOrigen&&<div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>openNavigation(s)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:BLUE+"0e",border:"1.5px solid "+BLUE+"28",color:BLUE,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Navigation size={13}/>Navegar</button>
                {ruta.fase==="camino-a-carga"&&<button onClick={async()=>{
                  await updateDoc(doc(db,"rutas",ruta.id),{fase:"cargando",primerArribo:serverTimestamp(),status:"Cargando"}).catch(()=>{});
                  // Usa el helper global
                  if(window.__notifyEvent__) window.__notifyEvent__(ruta,"pickup-arrived",{city:s.city});
                  showT("✓ Llegada al punto de carga notificada");
                }} className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:BLUE,color:"#fff",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><MapPin size={13}/>Llegué a cargar</button>}
                {(ruta.fase==="cargando"||ruta.status==="Cargando")&&<button onClick={async()=>{
                  // Busca próxima ciudad no-origen
                  const proximo = (ruta.stops||[]).find(x=>!x.isOrigin);
                  await updateDoc(doc(db,"rutas",ruta.id),{fase:"en-ruta",status:"En curso",materialCargadoEn:serverTimestamp()}).catch(()=>{});
                  if(window.__notifyEvent__) window.__notifyEvent__(ruta,"loaded",{nextCity:proximo?.city||""});
                  showT("✓ Material cargado, en ruta");
                }} className="btn" style={{flex:2,padding:"10px 0",borderRadius:10,background:"linear-gradient(135deg,"+GREEN+",#10b981)",color:"#fff",fontWeight:800,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Package size={13}/>Ya cargué material</button>}
              </div>}

              {/* DESTINOS: flow normal */}
              {!isOrigen&&s.status!=="entregado"&&<div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>openNavigation(s)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:BLUE+"0e",border:"1.5px solid "+BLUE+"28",color:BLUE,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Navigation size={13}/>Navegar ciudad</button>
                {s.status==="pendiente"&&<button onClick={async()=>{
                  await updateStopStatus(i,"llegue");
                  if(window.__notifyEvent__) window.__notifyEvent__(ruta,"stop-arrived",{city:s.city,stopIdx:i});
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
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid "+BORDER,padding:"10px 14px calc(env(safe-area-inset-bottom,0) + 10px)",display:"flex",gap:8,boxShadow:"0 -4px 16px rgba(12,24,41,.08)",zIndex:50}}>
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
            if(ruta.clienteTel){
              if(window.__notifyEvent__){
                if(modalStop.action==="entregado") window.__notifyEvent__(ruta,"stop-delivered",{city:modalStop.city,notas:notasFull,fotoURL});
                else window.__notifyEvent__(ruta,"issue",{city:modalStop.city,tipo:incidentLabel,notas:notasFull});
              }else{
                notifyCliente(modalStop.action==="entregado"?"delivered":"issue",modalStop,fotoURL,notasFull,incidentLabel);
              }
            }
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

  // Refs para animación smooth del marker (estilo Uber/Rappi)
  const lastRenderedPosRef = useRef(null); // {lat,lng,heading}
  const animFrameRef = useRef(null);
  const [etaMin,setEtaMin] = useState(null);
  const [etaDistKm,setEtaDistKm] = useState(null);
  const [routeGeometry,setRouteGeometry] = useState(null);
  const etaFetchRef = useRef(0);

  // Construye o actualiza marker de camión (rotación + animación smooth)
  const updateTruckMarker = (lng,lat,heading)=>{
    const m = mapRef.current;
    if(!m) return;
    if(!driverMarkerRef.current){
      const el = document.createElement("div");
      el.id = "truck-marker";
      // Halo pulsante + flecha direccional SVG
      el.innerHTML = `
        <div style="position:absolute;inset:0;border-radius:50%;background:${A}55;animation:pulseHalo 2s ease-in-out infinite;transform:scale(1.6);z-index:0;"></div>
        <div id="truck-rot" style="position:relative;width:52px;height:52px;border-radius:50%;background:#fff;box-shadow:0 6px 22px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:1;transition:transform .6s ease;">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block">
            <path d="M12 2 L20 16 L12 12 L4 16 Z" fill="${A}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
          </svg>
        </div>
      `;
      el.style.cssText = "width:52px;height:52px;position:relative;z-index:100;";
      driverMarkerRef.current = new mapboxgl.Marker({element:el,anchor:"center"}).setLngLat([lng,lat]).addTo(m);
    }
    // Actualiza rotación del interior
    const rot = document.getElementById("truck-rot");
    if(rot&&typeof heading==="number") rot.style.transform = `rotate(${heading}deg)`;
  };

  // Animación smooth entre posiciones (requestAnimationFrame)
  const animateMarkerTo = (targetLng,targetLat,targetHeading)=>{
    const from = lastRenderedPosRef.current;
    if(!from){
      lastRenderedPosRef.current = {lat:targetLat,lng:targetLng,heading:targetHeading};
      updateTruckMarker(targetLng,targetLat,targetHeading);
      return;
    }
    const startTs = performance.now();
    const duration = 1400; // ms — suaviza el salto entre GPS pings
    const startLng = from.lng, startLat = from.lat;
    const fromHead = from.heading||targetHeading||0;
    const toHead = typeof targetHeading==="number"?targetHeading:fromHead;
    // Shortest-path rotation
    let dHead = toHead - fromHead;
    if(dHead > 180) dHead -= 360;
    if(dHead < -180) dHead += 360;
    if(animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const step = (now)=>{
      const t = Math.min(1,(now-startTs)/duration);
      const ease = t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      const curLng = startLng + (targetLng-startLng)*ease;
      const curLat = startLat + (targetLat-startLat)*ease;
      const curHead = fromHead + dHead*ease;
      if(driverMarkerRef.current){
        driverMarkerRef.current.setLngLat([curLng,curLat]);
        const rot = document.getElementById("truck-rot");
        if(rot) rot.style.transform = `rotate(${curHead}deg)`;
      }else{
        updateTruckMarker(curLng,curLat,curHead);
      }
      if(t<1) animFrameRef.current = requestAnimationFrame(step);
      else lastRenderedPosRef.current = {lat:targetLat,lng:targetLng,heading:toHead};
    };
    animFrameRef.current = requestAnimationFrame(step);
  };

  // Computa heading si el GPS no lo provee (bearing entre últimas 2 posiciones)
  const computeBearing = (lat1,lng1,lat2,lng2)=>{
    const rad = Math.PI/180;
    const y = Math.sin((lng2-lng1)*rad) * Math.cos(lat2*rad);
    const x = Math.cos(lat1*rad)*Math.sin(lat2*rad) - Math.sin(lat1*rad)*Math.cos(lat2*rad)*Math.cos((lng2-lng1)*rad);
    return (Math.atan2(y,x)*180/Math.PI + 360) % 360;
  };

  // Siguiente destino según fase y estado
  const getSiguiente = ()=>{
    if(!ruta) return null;
    const stopStates = (ruta.stopsStatus||[]).reduce((a,s)=>{a[s.idx]=s;return a;},{});
    // Fase "camino-a-carga": siguiente es el ORIGEN
    if(ruta.fase==="camino-a-carga"||ruta.status==="Camino a carga"){
      const origen = (ruta.stops||[]).find(s=>s.isOrigin);
      if(origen){
        const p = (origen.puntos||[]).find(x=>x.lat&&x.lng);
        if(p) return {lat:p.lat,lng:p.lng,city:origen.city,tipo:"pickup"};
      }
    }
    // Fase "en-ruta" o cargando: primer destino no entregado
    for(let ci=0;ci<(ruta.stops||[]).length;ci++){
      const s = ruta.stops[ci];
      if(s.isOrigin) continue;
      const st = stopStates[ci];
      if(st?.status==="entregado") continue;
      const p = (s.puntos||[]).find(x=>x.lat&&x.lng);
      if(p) return {lat:p.lat,lng:p.lng,city:s.city,tipo:"delivery",idx:ci};
    }
    return null;
  };

  // Fetch ETA con Mapbox Directions driving-traffic (incluye tráfico en vivo)
  const fetchETA = async(fromLng,fromLat,toLng,toLat)=>{
    if(!MAPBOX_TOKEN) return;
    const now = Date.now();
    if(now-etaFetchRef.current < 25000) return; // máx una vez cada 25s (ahorra requests)
    etaFetchRef.current = now;
    try{
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${fromLng},${fromLat};${toLng},${toLat}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&annotations=duration`;
      const r = await fetch(url);
      if(!r.ok) return;
      const d = await r.json();
      const rt = d.routes?.[0];
      if(!rt) return;
      setEtaMin(Math.max(1,Math.round(rt.duration/60)));
      setEtaDistKm((rt.distance/1000).toFixed(1));
      setRouteGeometry(rt.geometry);
    }catch(e){console.warn("ETA fetch",e);}
  };

  // Driver marker + línea + ETA + AUTO-FOLLOW (estilo Uber/Rappi)
  useEffect(()=>{
    const m = mapRef.current;
    if(!m) return;
    if(!driverLoc?.lat||!driverLoc?.lng){
      if(driverMarkerRef.current){driverMarkerRef.current.remove();driverMarkerRef.current=null;}
      if(m.isStyleLoaded()){
        const s = m.getSource("live-route");
        if(s) s.setData({type:"Feature",geometry:{type:"LineString",coordinates:[]}});
      }
      setEtaMin(null);setEtaDistKm(null);
      return;
    }
    const stale = Date.now()/1000-(driverLoc.ts?.seconds||0)>300;
    if(stale){
      if(driverMarkerRef.current){driverMarkerRef.current.remove();driverMarkerRef.current=null;}
      if(m.isStyleLoaded()){
        const s = m.getSource("live-route");
        if(s) s.setData({type:"Feature",geometry:{type:"LineString",coordinates:[]}});
      }
      return;
    }
    // Heading: usa el del GPS o calcula por bearing vs última posición
    let heading = typeof driverLoc.heading==="number"&&driverLoc.heading>0?driverLoc.heading:null;
    if(heading==null&&lastRenderedPosRef.current){
      const p = lastRenderedPosRef.current;
      if(Math.abs(p.lat-driverLoc.lat)>1e-5||Math.abs(p.lng-driverLoc.lng)>1e-5){
        heading = computeBearing(p.lat,p.lng,driverLoc.lat,driverLoc.lng);
      }
    }
    if(heading==null) heading = lastRenderedPosRef.current?.heading||0;

    // Animación smooth
    animateMarkerTo(driverLoc.lng,driverLoc.lat,heading);

    // AUTO-FOLLOW con easing suave
    m.easeTo({center:[driverLoc.lng,driverLoc.lat],zoom:Math.max(m.getZoom(),13),duration:800});

    // Obtén próximo destino y calcula ETA + ruta real (tráfico)
    const sig = getSiguiente();
    if(sig){
      fetchETA(driverLoc.lng,driverLoc.lat,sig.lng,sig.lat);
    }
  },[driverLoc,ruta]);

  // Pinta la línea de ruta (geometría real de Mapbox Directions) en el mapa
  useEffect(()=>{
    const m = mapRef.current;
    if(!m||!m.isStyleLoaded()||!routeGeometry) return;
    const src = m.getSource("live-route");
    if(src) src.setData({type:"Feature",geometry:routeGeometry});
  },[routeGeometry]);

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
  // Mapea fase + status a un indicador visual estilo Rappi
  const fase = ruta.fase||ruta.status;
  let faseConfig;
  if(ruta.status==="Completada") faseConfig = {label:"Ruta completada",emoji:"🏁",color:GREEN,sub:"Revisa evidencias abajo"};
  else if(fase==="camino-a-carga"||ruta.status==="Camino a carga") faseConfig = {label:"Camino al punto de carga",emoji:"🚚",color:VIOLET,sub:"El chofer va en camino a recoger el material"};
  else if(fase==="cargando"||ruta.status==="Cargando") faseConfig = {label:"Cargando material",emoji:"📦",color:AMBER,sub:"El chofer está cargando la mercancía"};
  else if(fase==="en-ruta"||ruta.status==="En curso") faseConfig = {label:"En ruta de entrega",emoji:"🚛",color:BLUE,sub:"Material cargado, en camino a destino"};
  else faseConfig = {label:"Programada",emoji:"📅",color:MUTED,sub:"La ruta aún no ha iniciado"};
  const etaEstado = faseConfig.label;
  const estadoColor = faseConfig.color;
  const sc = {Completada:GREEN,"En curso":BLUE,Programada:VIOLET};

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

      {/* Banner de fase + ETA (estilo Rappi) */}
      <div style={{background:"#fff",padding:"14px 18px",borderBottom:"1px solid "+BORDER,boxShadow:"0 2px 8px rgba(12,24,41,.04)"}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:54,height:54,borderRadius:16,background:faseConfig.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}} className="pulse">{faseConfig.emoji}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:DISP,fontWeight:800,fontSize:16,color:faseConfig.color,lineHeight:1.2}}>{faseConfig.label}</div>
              <div style={{fontSize:12,color:MUTED,marginTop:2,lineHeight:1.4}}>{faseConfig.sub}</div>
              {etaMin!==null&&ruta.status!=="Completada"&&<div style={{display:"flex",alignItems:"center",gap:10,marginTop:8,flexWrap:"wrap"}}>
                <div style={{background:faseConfig.color+"14",border:"1.5px solid "+faseConfig.color+"40",color:faseConfig.color,padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>
                  <Clock size={12}/>Llega en ~{etaMin} min
                </div>
                {etaDistKm&&<div style={{fontSize:11,color:MUTED,fontFamily:MONO}}>· {etaDistKm} km restantes</div>}
                <div style={{fontSize:10,color:MUTED,fontStyle:"italic"}}>incluye tráfico en vivo</div>
              </div>}
            </div>
          </div>
          <div style={{marginTop:12}}><MiniBar pct={pct} color={GREEN} h={8}/></div>
          <div style={{fontSize:10,color:MUTED,marginTop:4,display:"flex",justifyContent:"space-between"}}>
            <span>{done}/{totalStops} entregas</span>
            <span>{pct}% completado</span>
          </div>
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
/* ═══════════════════════════════════════════════════════════════════════════
   MÓDULO ADMIN: GASTOS DE CHOFERES (aprobar/rechazar/export)
   ═══════════════════════════════════════════════════════════════════════════ */
function GastosAdmin(){
  const [items,setItems]=useState([]);
  const [load,setLoad]=useState(true);
  const [filtro,setFiltro]=useState("pendiente"); // pendiente | reembolsado | rechazado | todos
  const [choferFil,setChoferFil]=useState("todos");
  const [tipoFil,setTipoFil]=useState("todos");
  const [toast,setToast]=useState(null);
  const [photoModal,setPhotoModal]=useState(null);
  const showT=(m,t="ok")=>setToast({msg:m,type:t});

  useEffect(()=>onSnapshot(collection(db,"gastosChofer"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.fechaTs?.seconds||0)-(a.fechaTs?.seconds||0)));
    setLoad(false);
  }),[]);

  const actualizarEstado = async(id,nuevoEstado)=>{
    try{
      await updateDoc(doc(db,"gastosChofer",id),{estado:nuevoEstado,aprobadoEn:serverTimestamp()});
      showT(nuevoEstado==="reembolsado"?"✓ Gasto reembolsado":"✕ Gasto rechazado");
    }catch(e){showT(e.message,"err");}
  };

  const choferes = [...new Set(items.map(g=>g.choferNombre).filter(Boolean))];
  const filtered = items.filter(g=>{
    if(filtro!=="todos"&&g.estado!==filtro) return false;
    if(choferFil!=="todos"&&g.choferNombre!==choferFil) return false;
    if(tipoFil!=="todos"&&g.tipo!==tipoFil) return false;
    return true;
  });
  const totalPend = items.filter(g=>g.estado==="pendiente").reduce((a,g)=>a+(g.monto||0),0);
  const totalReemb = items.filter(g=>g.estado==="reembolsado").reduce((a,g)=>a+(g.monto||0),0);
  const totalRech = items.filter(g=>g.estado==="rechazado").reduce((a,g)=>a+(g.monto||0),0);
  const totalMes = items.filter(g=>{const ts=g.fechaTs?.seconds;if(!ts) return false;const d=new Date(ts*1000);const now=new Date();return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).reduce((a,g)=>a+(g.monto||0),0);

  const exportar=()=>{
    const wb = XLSX.utils.book_new();
    const data = filtered.map(g=>({
      Fecha: g.fechaTs?.seconds?new Date(g.fechaTs.seconds*1000).toLocaleDateString("es-MX"):"",
      Chofer: g.choferNombre||"",
      Teléfono: g.choferTel||"",
      Tipo: (GASTO_TIPOS.find(t=>t.id===g.tipo)||{}).label||g.tipo||"",
      Monto: g.monto||0,
      Nota: g.nota||"",
      Estado: g.estado||"pendiente",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{wch:12},{wch:22},{wch:14},{wch:14},{wch:12},{wch:30},{wch:14}];
    XLSX.utils.book_append_sheet(wb,ws,"Gastos Choferes");
    XLSX.writeFile(wb,"gastos_choferes_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Gastos de Choferes</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>Gasolina, casetas, viáticos · Aprobar o rechazar reembolsos</p>
        </div>
        <button onClick={exportar} className="btn" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+GREEN+"40",color:GREEN,borderRadius:12,padding:"10px 16px",fontWeight:700,fontSize:13}}><Download size={13}/>Exportar XLSX</button>
      </div>

      {/* KPIs */}
      <div className="g4" style={{marginBottom:18}}>
        <KpiCard icon={Clock} color={AMBER} label="Pendiente aprobación" value={fmtK(totalPend)} sub={items.filter(g=>g.estado==="pendiente").length+" gastos"}/>
        <KpiCard icon={CheckCircle} color={GREEN} label="Reembolsado" value={fmtK(totalReemb)} sub={items.filter(g=>g.estado==="reembolsado").length+" aprobados"}/>
        <KpiCard icon={X} color={ROSE} label="Rechazado" value={fmtK(totalRech)} sub={items.filter(g=>g.estado==="rechazado").length+" rechazos"}/>
        <KpiCard icon={Calendar} color={BLUE} label="Total este mes" value={fmtK(totalMes)}/>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:4}}>
          {[["pendiente","Pendientes",AMBER],["reembolsado","Reembolsados",GREEN],["rechazado","Rechazados",ROSE],["todos","Todos",MUTED]].map(([v,l,c])=>(
            <button key={v} onClick={()=>setFiltro(v)} className="btn" style={{padding:"7px 14px",borderRadius:9,border:"1.5px solid "+(filtro===v?c:BD2),background:filtro===v?c+"14":"#fff",color:filtro===v?c:MUTED,fontWeight:filtro===v?700:500,fontSize:12,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <select value={choferFil} onChange={e=>setChoferFil(e.target.value)} style={{padding:"7px 12px",border:"1.5px solid "+BD2,borderRadius:9,fontSize:12,background:"#fff"}}>
          <option value="todos">Todos los choferes</option>
          {choferes.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tipoFil} onChange={e=>setTipoFil(e.target.value)} style={{padding:"7px 12px",border:"1.5px solid "+BD2,borderRadius:9,fontSize:12,background:"#fff"}}>
          <option value="todos">Todos los tipos</option>
          {GASTO_TIPOS.map(t=><option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {load?<SkeletonRows n={4}/>
      :filtered.length===0?<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin gastos {filtro!=="todos"?"en estado "+filtro:""}</div>
      :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
          <thead><tr style={{borderBottom:"1px solid "+BORDER}}>
            {["Fecha","Chofer","Tipo","Monto","Nota","Ticket","Estado","Acciones"].map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}
          </tr></thead>
          <tbody>{filtered.map(g=>{
            const t = GASTO_TIPOS.find(x=>x.id===g.tipo)||GASTO_TIPOS[GASTO_TIPOS.length-1];
            const fecha = g.fechaTs?.seconds?new Date(g.fechaTs.seconds*1000).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"2-digit"}):"—";
            const estadoColor = g.estado==="reembolsado"?GREEN:g.estado==="rechazado"?ROSE:AMBER;
            const estadoLabel = g.estado==="reembolsado"?"✓ Reembolsado":g.estado==="rechazado"?"✕ Rechazado":"⏳ Pendiente";
            return(
              <tr key={g.id} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
                <td style={{padding:"10px 12px",fontSize:12,whiteSpace:"nowrap"}}>{fecha}</td>
                <td style={{padding:"10px 12px"}}>
                  <div style={{fontWeight:700,fontSize:13}}>{g.choferNombre}</div>
                  <div style={{fontSize:10,color:MUTED}}>{g.choferTel}</div>
                </td>
                <td style={{padding:"10px 12px"}}><span style={{background:t.color+"14",color:t.color,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>{t.emoji} {t.label}</span></td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:14,fontWeight:800,color:t.color}}>{fmt(g.monto||0)}</td>
                <td style={{padding:"10px 12px",fontSize:12,color:MUTED,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.nota||"—"}</td>
                <td style={{padding:"10px 12px"}}>{g.ticketURL?<img onClick={()=>setPhotoModal(g.ticketURL)} src={g.ticketURL} alt="t" style={{width:40,height:40,borderRadius:7,objectFit:"cover",cursor:"pointer",border:"1px solid "+BD2}}/>:<span style={{fontSize:10,color:MUTED}}>—</span>}</td>
                <td style={{padding:"10px 12px"}}><Tag color={estadoColor} sm>{estadoLabel}</Tag></td>
                <td style={{padding:"10px 12px"}}>
                  {g.estado==="pendiente"?<div style={{display:"flex",gap:5}}>
                    <button onClick={()=>actualizarEstado(g.id,"reembolsado")} className="btn" style={{padding:"5px 10px",borderRadius:7,background:GREEN,color:"#fff",fontWeight:700,fontSize:11,display:"flex",alignItems:"center",gap:4}}><Check size={11}/>Aprobar</button>
                    <button onClick={()=>{if(confirm("¿Rechazar este gasto?"))actualizarEstado(g.id,"rechazado");}} className="btn" style={{padding:"5px 10px",borderRadius:7,background:ROSE+"14",border:"1px solid "+ROSE+"30",color:ROSE,fontWeight:700,fontSize:11,display:"flex",alignItems:"center",gap:4}}><X size={11}/>Rechazar</button>
                  </div>:<button onClick={()=>actualizarEstado(g.id,"pendiente")} className="btn" style={{padding:"4px 8px",border:"1px solid "+BD2,borderRadius:6,color:MUTED,fontSize:10}}>Revertir</button>}
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>}
      {photoModal&&<div onClick={()=>setPhotoModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer"}}>
        <img src={photoModal} alt="ticket" style={{maxWidth:"90%",maxHeight:"90%",borderRadius:10,boxShadow:"0 16px 50px rgba(0,0,0,.5)"}}/>
      </div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MÓDULO ADMIN: JORNADAS (checkin/checkout, horas trabajadas)
   ═══════════════════════════════════════════════════════════════════════════ */
function JornadasAdmin(){
  const [items,setItems]=useState([]);
  const [load,setLoad]=useState(true);
  const [choferFil,setChoferFil]=useState("todos");
  const [desde,setDesde]=useState(()=>{const d=new Date();d.setDate(d.getDate()-14);return d.toISOString().slice(0,10);});
  const [hasta,setHasta]=useState(()=>new Date().toISOString().slice(0,10));

  useEffect(()=>onSnapshot(collection(db,"jornadas"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.inTs?.seconds||0)-(a.inTs?.seconds||0)));
    setLoad(false);
  }),[]);

  const choferes = [...new Set(items.map(j=>j.choferNombre).filter(Boolean))];
  const rangoIn = new Date(desde+"T00:00:00").getTime()/1000;
  const rangoOut = new Date(hasta+"T23:59:59").getTime()/1000;
  const filtered = items.filter(j=>{
    const ts = j.inTs?.seconds;
    if(!ts) return false;
    if(ts<rangoIn||ts>rangoOut) return false;
    if(choferFil!=="todos"&&j.choferNombre!==choferFil) return false;
    return true;
  });

  const getHoras = j=>{
    const i = j.inTs?.seconds, o = j.outTs?.seconds||(j.outTs?null:Date.now()/1000);
    if(!i) return 0;
    return Math.max(0,(o-i)/3600);
  };
  const totalHoras = filtered.reduce((a,j)=>a+getHoras(j),0);
  const activas = filtered.filter(j=>!j.outTs).length;

  // Por chofer
  const porChofer = {};
  filtered.forEach(j=>{
    const k = j.choferNombre||"—";
    if(!porChofer[k]) porChofer[k] = {horas:0,jornadas:0,nombre:k,tel:j.choferTel};
    porChofer[k].horas += getHoras(j);
    porChofer[k].jornadas += 1;
  });
  const ranking = Object.values(porChofer).sort((a,b)=>b.horas-a.horas);

  const exportar=()=>{
    const wb = XLSX.utils.book_new();
    const data = filtered.map(j=>{
      const inT = j.inTs?.seconds, outT = j.outTs?.seconds;
      return {
        Chofer: j.choferNombre||"",
        Teléfono: j.choferTel||"",
        Fecha: inT?new Date(inT*1000).toLocaleDateString("es-MX"):"",
        Entrada: inT?new Date(inT*1000).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"",
        Salida: outT?new Date(outT*1000).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"EN CURSO",
        "Horas trabajadas": getHoras(j).toFixed(2),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{wch:22},{wch:14},{wch:12},{wch:10},{wch:10},{wch:18}];
    XLSX.utils.book_append_sheet(wb,ws,"Jornadas");
    // Segunda hoja: resumen por chofer
    const resumen = ranking.map(r=>({Chofer:r.nombre,Teléfono:r.tel||"",Jornadas:r.jornadas,"Total horas":r.horas.toFixed(2),"Promedio h/día":(r.horas/r.jornadas).toFixed(2)}));
    const ws2 = XLSX.utils.json_to_sheet(resumen);
    ws2["!cols"] = [{wch:22},{wch:14},{wch:10},{wch:12},{wch:15}];
    XLSX.utils.book_append_sheet(wb,ws2,"Resumen por chofer");
    XLSX.writeFile(wb,"jornadas_"+desde+"_a_"+hasta+".xlsx");
  };

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Jornadas & Horas Trabajadas</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>Reporte para nómina · Checkin/checkout de choferes</p>
        </div>
        <button onClick={exportar} className="btn" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+GREEN+"40",color:GREEN,borderRadius:12,padding:"10px 16px",fontWeight:700,fontSize:13}}><Download size={13}/>Exportar nómina</button>
      </div>

      {/* KPIs */}
      <div className="g4" style={{marginBottom:18}}>
        <KpiCard icon={Clock} color={BLUE} label="Jornadas en rango" value={filtered.length}/>
        <KpiCard icon={Activity} color={A} label="Horas totales" value={totalHoras.toFixed(1)+"h"} sub={(filtered.length>0?(totalHoras/filtered.length).toFixed(1):"0")+"h promedio"}/>
        <KpiCard icon={Radio} color={GREEN} label="Activas ahora" value={activas} sub="en jornada"/>
        <KpiCard icon={Users} color={VIOLET} label="Choferes con hrs" value={ranking.length}/>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:MUTED,fontWeight:600}}>Desde:</span>
          <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{padding:"6px 10px",border:"1.5px solid "+BD2,borderRadius:8,fontSize:12,background:"#fff"}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:MUTED,fontWeight:600}}>Hasta:</span>
          <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{padding:"6px 10px",border:"1.5px solid "+BD2,borderRadius:8,fontSize:12,background:"#fff"}}/>
        </div>
        <select value={choferFil} onChange={e=>setChoferFil(e.target.value)} style={{padding:"7px 12px",border:"1.5px solid "+BD2,borderRadius:9,fontSize:12,background:"#fff"}}>
          <option value="todos">Todos los choferes</option>
          {choferes.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="g2-side">
        {/* Ranking por chofer */}
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:18,height:"fit-content"}}>
          <div style={{fontFamily:DISP,fontWeight:700,fontSize:15,marginBottom:14}}>🏆 Horas por chofer</div>
          {ranking.length===0?<div style={{padding:20,textAlign:"center",color:MUTED,fontSize:12}}>Sin datos en el rango</div>
          :ranking.map((r,i)=>{
            const maxH = ranking[0].horas||1;
            return(
              <div key={r.nombre} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontSize:12,fontWeight:700}}>#{i+1} {r.nombre}</div>
                  <div style={{fontFamily:MONO,fontSize:13,fontWeight:800,color:A}}>{r.horas.toFixed(1)}h</div>
                </div>
                <MiniBar pct={r.horas/maxH*100} color={i===0?A:i<3?VIOLET:BLUE} h={6}/>
                <div style={{fontSize:10,color:MUTED,marginTop:3}}>{r.jornadas} jornadas · {(r.horas/r.jornadas).toFixed(1)}h promedio</div>
              </div>
            );
          })}
        </div>

        {/* Lista de jornadas */}
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
          {load?<SkeletonRows n={5}/>
          :filtered.length===0?<div style={{padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin jornadas en el rango</div>
          :<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:"1px solid "+BORDER,background:"#fafbfd"}}>
              {["Chofer","Fecha","Entrada","Salida","Horas"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>{filtered.map(j=>{
              const inT = j.inTs?.seconds, outT = j.outTs?.seconds;
              const h = getHoras(j);
              const activa = !outT;
              return(
                <tr key={j.id} style={{borderBottom:"1px solid "+BORDER,background:activa?GREEN+"04":"transparent"}}>
                  <td style={{padding:"10px 14px",fontSize:13,fontWeight:700}}>{j.choferNombre}</td>
                  <td style={{padding:"10px 14px",fontSize:12,color:MUTED}}>{inT?new Date(inT*1000).toLocaleDateString("es-MX",{weekday:"short",day:"2-digit",month:"short"}):"—"}</td>
                  <td style={{padding:"10px 14px",fontFamily:MONO,fontSize:12}}>{inT?new Date(inT*1000).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"—"}</td>
                  <td style={{padding:"10px 14px",fontFamily:MONO,fontSize:12}}>{outT?new Date(outT*1000).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):<span className="pulse" style={{color:GREEN,fontWeight:800}}>● EN CURSO</span>}</td>
                  <td style={{padding:"10px 14px",fontFamily:MONO,fontSize:14,fontWeight:800,color:A}}>{h.toFixed(2)}h</td>
                </tr>
              );
            })}</tbody>
          </table></div>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CENTRO DE ALERTAS — agrupa SOS, geofence, arrivals, deliveries, issues
   ═══════════════════════════════════════════════════════════════════════════ */
function AlertasCentro({setView}){
  const [items,setItems]=useState([]);
  const [load,setLoad]=useState(true);
  const [filtro,setFiltro]=useState("todas");
  useEffect(()=>onSnapshot(collection(db,"alertas"),s=>{
    setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.ts?.seconds||0)-(a.ts?.seconds||0)));
    setLoad(false);
  }),[]);

  const ALERT_META = {
    sos:      {color:"#dc2626",icon:"🚨",label:"SOS EMERGENCIA",priority:1},
    geofence: {color:ROSE,icon:"📍",label:"Fuera de zona",priority:2},
    issue:    {color:AMBER,icon:"⚠️",label:"Problema en parada",priority:3},
    arrival:  {color:BLUE,icon:"📬",label:"Llegada",priority:5},
    delivered:{color:GREEN,icon:"✅",label:"Entrega",priority:5},
    start:    {color:VIOLET,icon:"▶️",label:"Ruta iniciada",priority:6},
    complete: {color:GREEN,icon:"🏁",label:"Ruta completada",priority:6},
  };

  const filtered = items.filter(a=>{
    if(filtro==="todas") return true;
    if(filtro==="criticas") return a.type==="sos"||a.type==="geofence"||a.type==="issue";
    return a.type===filtro;
  });

  const sosActivas = items.filter(a=>a.type==="sos"&&!a.atendida);
  const criticas = items.filter(a=>(a.type==="sos"||a.type==="geofence")&&!a.atendida).length;

  const marcarAtendida = async(id)=>{
    await updateDoc(doc(db,"alertas",id),{atendida:true,atendidaEn:serverTimestamp()}).catch(()=>{});
  };
  const abrirUbicacion = (a)=>{
    const d = a.data||{};
    if(d.lat&&d.lng){
      window.open(`https://www.google.com/maps?q=${d.lat},${d.lng}`,"_blank");
    }else if(a.rutaId){
      setView&&setView("tracking");
    }
  };

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Centro de Alertas</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>SOS · Geofence · Entregas · Todos los eventos en vivo</p>
        </div>
        {criticas>0&&<div style={{background:"#dc2626",color:"#fff",borderRadius:12,padding:"10px 16px",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:8,boxShadow:"0 6px 20px #dc262655"}} className="pulse">
          <AlertCircle size={16}/>{criticas} alertas críticas sin atender
        </div>}
      </div>

      {/* SOS activas destacadas */}
      {sosActivas.length>0&&<div style={{marginBottom:18}}>
        {sosActivas.map(a=>(
          <div key={a.id} style={{background:"linear-gradient(135deg,#dc2626,#ef4444)",color:"#fff",borderRadius:14,padding:"16px 20px",marginBottom:10,boxShadow:"0 8px 30px #dc262655",display:"flex",alignItems:"center",gap:14}} className="pulse">
            <div style={{fontSize:32}}>🚨</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:DISP,fontWeight:900,fontSize:16,letterSpacing:"-0.02em"}}>SOS EMERGENCIA ACTIVA</div>
              <div style={{fontSize:13,opacity:.95,marginTop:2}}>Chofer: <strong>{a.choferNombre}</strong> · {a.ts?.seconds?ago(a.ts.seconds):"ahora"}</div>
              <div style={{fontSize:11,opacity:.85,marginTop:2,fontFamily:MONO}}>
                {a.data?.lat&&a.data?.lng?`${a.data.lat.toFixed(5)}, ${a.data.lng.toFixed(5)}`:"Sin coordenadas"}
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {(a.data?.lat&&a.data?.lng)&&<button onClick={()=>abrirUbicacion(a)} className="btn" style={{background:"rgba(255,255,255,.2)",color:"#fff",border:"1px solid rgba(255,255,255,.3)",borderRadius:10,padding:"9px 14px",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:5}}><Map size={12}/>Ver en mapa</button>}
              <button onClick={()=>marcarAtendida(a.id)} className="btn" style={{background:"#fff",color:"#dc2626",borderRadius:10,padding:"9px 14px",fontWeight:800,fontSize:12,display:"flex",alignItems:"center",gap:5}}><Check size={12}/>Atendida</button>
            </div>
          </div>
        ))}
      </div>}

      {/* Filtros */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
        {[["todas","Todas"],["criticas","⚠️ Críticas"],["sos","🚨 SOS"],["geofence","📍 Fuera zona"],["issue","⚠️ Problemas"],["arrival","📬 Llegadas"],["delivered","✅ Entregas"],["start","▶️ Inicios"],["complete","🏁 Finales"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFiltro(v)} className="btn" style={{padding:"6px 13px",borderRadius:9,border:"1.5px solid "+(filtro===v?A:BD2),background:filtro===v?A+"10":"#fff",color:filtro===v?A:MUTED,fontWeight:filtro===v?700:500,fontSize:11,cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      {/* Lista */}
      {load?<SkeletonRows n={5}/>
      :filtered.length===0?<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin alertas</div>
      :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
        {filtered.slice(0,100).map((a,i)=>{
          const meta = ALERT_META[a.type]||{color:MUTED,icon:"•",label:a.type};
          const atend = a.atendida;
          return(
            <div key={a.id} style={{padding:"14px 18px",borderBottom:i<filtered.length-1?"1px solid "+BORDER:"none",display:"flex",alignItems:"flex-start",gap:12,background:atend?"#fafbfd":"#fff",opacity:atend?.7:1}}>
              <div style={{width:38,height:38,borderRadius:10,background:meta.color+"14",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{meta.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:13,color:meta.color}}>{meta.label}</span>
                  <span style={{fontSize:11,color:MUTED}}>· {a.choferNombre||"—"}</span>
                  <span style={{fontSize:10,color:MUTED,fontFamily:MONO}}>· {a.ts?.seconds?ago(a.ts.seconds):"ahora"}</span>
                  {atend&&<Tag color={GREEN} sm>✓ Atendida</Tag>}
                </div>
                {a.message&&<div style={{fontSize:12,color:TEXT,marginTop:3}}>{a.message}</div>}
                {a.data?.lat&&a.data?.lng&&<div style={{fontSize:10,fontFamily:MONO,color:MUTED,marginTop:2}}>📍 {a.data.lat.toFixed(5)}, {a.data.lng.toFixed(5)}</div>}
              </div>
              <div style={{display:"flex",gap:5,flexShrink:0}}>
                {a.data?.lat&&a.data?.lng&&<button onClick={()=>abrirUbicacion(a)} className="btn" style={{padding:"5px 10px",borderRadius:7,background:BLUE+"10",border:"1px solid "+BLUE+"30",color:BLUE,fontSize:11,fontWeight:700}}>Mapa</button>}
                {!atend&&<button onClick={()=>marcarAtendida(a.id)} className="btn" style={{padding:"5px 10px",borderRadius:7,background:GREEN+"10",border:"1px solid "+GREEN+"30",color:GREEN,fontSize:11,fontWeight:700}}>✓ Atendida</button>}
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAT INTERNO — mensajeria admin <-> chofer
   ═══════════════════════════════════════════════════════════════════════════ */
async function sendMessage({from,fromName,to,toName,text,rutaId=null,rutaNombre=null}){
  return await addDoc(collection(db,"mensajes"),{
    from,           // "admin" | choferId
    fromName,
    to,             // "admin" | choferId
    toName,
    text,
    rutaId,
    rutaNombre,
    read:false,
    ts:serverTimestamp(),
  });
}

// Lista de conversaciones con choferes (admin) + ventana de chat
function ChatCentro(){
  const [mensajes,setMensajes]=useState([]);
  const [choferes,setChoferes]=useState([]);
  const [selected,setSelected]=useState(null); // {id,nombre,tel}
  const [draft,setDraft]=useState("");
  const bottomRef=useRef(null);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"mensajes"),s=>setMensajes(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.ts?.seconds||0)-(b.ts?.seconds||0))));
    const u2=onSnapshot(collection(db,"choferes"),s=>setChoferes(s.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.status!=="Inactivo")));
    return()=>{u1();u2();};
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[selected,mensajes]);

  // Marca como leídos los mensajes entrantes del chofer seleccionado
  useEffect(()=>{
    if(!selected) return;
    mensajes.forEach(m=>{
      if(m.from===selected.id&&m.to==="admin"&&!m.read){
        updateDoc(doc(db,"mensajes",m.id),{read:true}).catch(()=>{});
      }
    });
  },[selected,mensajes]);

  const conv = selected?mensajes.filter(m=>(m.from===selected.id&&m.to==="admin")||(m.from==="admin"&&m.to===selected.id)):[];
  // Conteo unread por chofer
  const unreadByChofer = {};
  mensajes.filter(m=>m.to==="admin"&&!m.read).forEach(m=>{unreadByChofer[m.from]=(unreadByChofer[m.from]||0)+1;});
  // Último mensaje por chofer
  const lastByChofer = {};
  mensajes.forEach(m=>{
    const other = m.from==="admin"?m.to:m.from;
    if(other==="admin") return;
    if(!lastByChofer[other]||(m.ts?.seconds||0)>(lastByChofer[other].ts?.seconds||0)) lastByChofer[other] = m;
  });
  const conOrdenados = [...choferes].sort((a,b)=>{
    const ua = unreadByChofer[a.id]||0, ub = unreadByChofer[b.id]||0;
    if(ua!==ub) return ub-ua;
    const ta = lastByChofer[a.id]?.ts?.seconds||0, tb = lastByChofer[b.id]?.ts?.seconds||0;
    return tb-ta;
  });

  const enviar = async()=>{
    if(!draft.trim()||!selected) return;
    await sendMessage({from:"admin",fromName:"Administración",to:selected.id,toName:selected.nombre,text:draft.trim()});
    setDraft("");
  };

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",padding:"24px 28px",background:"#f1f4fb",minHeight:0}}>
      <div className="au" style={{marginBottom:16}}>
        <h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Chat interno</h1>
        <p style={{color:MUTED,fontSize:13,marginTop:3}}>Mensajería directa con choferes · Tiempo real · Sin WhatsApp</p>
      </div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:"320px 1fr",gap:14,background:"#fff",borderRadius:15,overflow:"hidden",border:"1px solid "+BORDER,minHeight:0}}>
        {/* Lista choferes */}
        <div style={{borderRight:"1px solid "+BORDER,overflowY:"auto",minHeight:0}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid "+BORDER,fontFamily:DISP,fontWeight:700,fontSize:13,color:TEXT,background:"#fafbfd"}}>Choferes ({choferes.length})</div>
          {conOrdenados.length===0?<div style={{padding:24,textAlign:"center",color:MUTED,fontSize:12}}>No hay choferes registrados</div>
          :conOrdenados.map(c=>{
            const last = lastByChofer[c.id];
            const unread = unreadByChofer[c.id]||0;
            return(
              <button key={c.id} onClick={()=>setSelected(c)} className="btn fr" style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:"1px solid "+BORDER,background:selected?.id===c.id?A+"08":"transparent",textAlign:"left",cursor:"pointer"}}>
                <div style={{width:36,height:36,borderRadius:11,background:"linear-gradient(135deg,"+VIOLET+",#9d5cff)",color:"#fff",fontFamily:DISP,fontWeight:900,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{(c.nombre||"?").slice(0,2).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
                    <div style={{fontWeight:700,fontSize:13,color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nombre}</div>
                    {last?.ts?.seconds&&<span style={{fontSize:9,color:MUTED,flexShrink:0}}>{ago(last.ts.seconds)}</span>}
                  </div>
                  <div style={{fontSize:11,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{last?(last.from==="admin"?"Tú: ":"")+last.text:"Sin mensajes"}</div>
                </div>
                {unread>0&&<span style={{background:ROSE,color:"#fff",borderRadius:20,padding:"2px 7px",fontSize:10,fontWeight:800,flexShrink:0}}>{unread}</span>}
              </button>
            );
          })}
        </div>

        {/* Ventana de conversación */}
        <div style={{display:"flex",flexDirection:"column",minHeight:0}}>
          {selected?<>
            <div style={{padding:"12px 18px",borderBottom:"1px solid "+BORDER,display:"flex",alignItems:"center",gap:12,background:"#fafbfd"}}>
              <div style={{width:38,height:38,borderRadius:11,background:"linear-gradient(135deg,"+VIOLET+",#9d5cff)",color:"#fff",fontFamily:DISP,fontWeight:900,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>{(selected.nombre||"?").slice(0,2).toUpperCase()}</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:DISP,fontWeight:800,fontSize:15}}>{selected.nombre}</div>
                <div style={{fontSize:11,color:MUTED}}>{selected.tel||"Sin teléfono"}{selected.status?" · "+selected.status:""}</div>
              </div>
              {selected.tel&&<a href={"tel:+52"+selected.tel.replace(/\D/g,"")} className="btn" style={{padding:"7px 11px",borderRadius:9,background:BLUE+"10",border:"1px solid "+BLUE+"30",color:BLUE,fontWeight:700,fontSize:11,display:"flex",alignItems:"center",gap:4,textDecoration:"none"}}><Phone size={11}/>Llamar</a>}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"14px 18px",background:"#f6f9ff",minHeight:0}}>
              {conv.length===0?<div style={{textAlign:"center",color:MUTED,fontSize:12,padding:40}}>
                <Send size={24} color={BD2} style={{marginBottom:8}}/>
                <div>Envía el primer mensaje a {selected.nombre}</div>
              </div>
              :conv.map(m=>{
                const mine = m.from==="admin";
                return(
                  <div key={m.id} style={{display:"flex",justifyContent:mine?"flex-end":"flex-start",marginBottom:6}}>
                    <div style={{maxWidth:"70%",background:mine?"linear-gradient(135deg,"+A+",#fb923c)":"#fff",color:mine?"#fff":TEXT,padding:"9px 13px",borderRadius:mine?"14px 14px 4px 14px":"14px 14px 14px 4px",boxShadow:"0 1px 3px rgba(12,24,41,.08)",fontSize:13,lineHeight:1.4,wordWrap:"break-word"}}>
                      {m.rutaNombre&&<div style={{fontSize:9,fontWeight:800,opacity:.75,marginBottom:3,letterSpacing:"0.05em",textTransform:"uppercase"}}>📍 {m.rutaNombre}</div>}
                      {m.text}
                      <div style={{fontSize:9,opacity:.65,marginTop:4,textAlign:"right"}}>{m.ts?.seconds?new Date(m.ts.seconds*1000).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):""}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef}/>
            </div>
            <div style={{padding:"10px 14px",borderTop:"1px solid "+BORDER,display:"flex",gap:8,background:"#fafbfd"}}>
              <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")enviar();}} placeholder="Escribe un mensaje…" style={{flex:1,padding:"10px 14px",border:"1.5px solid "+BD2,borderRadius:10,fontSize:13,background:"#fff"}}/>
              <button onClick={enviar} disabled={!draft.trim()} className="btn" style={{padding:"0 18px",borderRadius:10,background:draft.trim()?"linear-gradient(135deg,"+A+",#fb923c)":"#e0e0e0",color:"#fff",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}><Send size={14}/>Enviar</button>
            </div>
          </>:<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED,fontSize:13,textAlign:"center",padding:40}}>
            <div>
              <Send size={36} color={BD2} style={{marginBottom:10}}/>
              <div style={{fontWeight:700,color:TEXT,fontSize:15,marginBottom:3}}>Selecciona un chofer</div>
              <div style={{fontSize:12}}>para iniciar o continuar una conversación</div>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BANNER GLOBAL SOS — alerta flotante cuando entra un SOS nuevo
   ═══════════════════════════════════════════════════════════════════════════ */
function SOSGlobalBanner({onGo}){
  const [sos,setSos]=useState([]);
  const prevIdsRef = useRef(null);
  useEffect(()=>{
    const q = query(collection(db,"alertas"),where("type","==","sos"));
    return onSnapshot(q,s=>{
      const items = s.docs.map(d=>({id:d.id,...d.data()})).filter(a=>!a.atendida).sort((a,b)=>(b.ts?.seconds||0)-(a.ts?.seconds||0));
      // Notifica si entra una nueva
      const prevIds = prevIdsRef.current;
      if(prevIds){
        const nuevas = items.filter(a=>!prevIds.has(a.id));
        if(nuevas.length>0){
          try{navigator.vibrate&&navigator.vibrate([500,200,500,200,500]);}catch(e){}
          try{new Audio("data:audio/wav;base64,UklGRnQGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVAGAAA=").play().catch(()=>{});}catch(e){}
          if("Notification" in window&&Notification.permission==="granted"){
            try{new Notification("🚨 SOS EMERGENCIA",{body:nuevas[0].choferNombre+" solicita ayuda inmediata",icon:"/icon.svg",requireInteraction:true,tag:"sos-"+nuevas[0].id});}catch(e){}
          }
        }
      }
      prevIdsRef.current = new Set(items.map(a=>a.id));
      setSos(items);
    });
  },[]);
  if(sos.length===0) return null;
  const first = sos[0];
  return(
    <div className="pulse" style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:800,background:"linear-gradient(135deg,#dc2626,#ef4444)",color:"#fff",borderRadius:14,padding:"12px 20px",boxShadow:"0 10px 40px #dc2626aa",display:"flex",alignItems:"center",gap:12,cursor:"pointer",maxWidth:"90vw"}} onClick={onGo}>
      <div style={{fontSize:22}}>🚨</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:DISP,fontWeight:900,fontSize:13,letterSpacing:"0.02em"}}>SOS ACTIVO · {sos.length} sin atender</div>
        <div style={{fontSize:11,opacity:.9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{first.choferNombre} · {first.ts?.seconds?ago(first.ts.seconds):"ahora"}</div>
      </div>
      <ArrowRight size={16}/>
    </div>
  );
}

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

  const [view,setView]=useState(()=>{
    // Deep-link via ?v=<id> (para shortcuts PWA)
    try{
      const qs = new URLSearchParams(window.location.search);
      const v = qs.get("v");
      if(v) return v;
    }catch(e){}
    return "dashboard";
  });
  const [cots,setCots]=useState([]);
  const [facts,setFacts]=useState([]);
  const [rutas,setRutas]=useState([]);
  const [entregas,setEntregas]=useState([]);
  const [viat,setViat]=useState([]);
  const [clientes,setClientes]=useState([]);
  const [prospectos,setProspectos]=useState([]);
  const [choferes,setChoferes]=useState([]);
  const [fbOk,setFbOk]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(()=>typeof window!=="undefined"?window.innerWidth>=768:true);
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
    const u5=onSnapshot(collection(db,"viaticos"),s=>{
      const list = s.docs.map(d=>({id:d.id,...d.data()}));
      setViat(list);
      // Expone globalmente para que exportFacturasXLSX genere la hoja P&L + Costos
      try{window.__DMOV_VIATICOS__ = list;}catch(e){}
    });
    // También trae gastosChofer para incluirlos en reportes oficiales
    const u9=onSnapshot(collection(db,"gastosChofer"),s=>{
      try{window.__DMOV_GASTOS_CHOFER__ = s.docs.map(d=>({id:d.id,...d.data()}));}catch(e){}
    });
    const u6=onSnapshot(collection(db,"cuentas"),s=>setClientes(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u7=onSnapshot(collection(db,"prospeccion"),s=>setProspectos(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u8=onSnapshot(collection(db,"choferes"),s=>setChoferes(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();u3();u4();u5();u6();u7();u8();u9&&u9();};
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
    gastosAdmin:<GastosAdmin/>,
    jornadas:<JornadasAdmin/>,
    chat:<ChatCentro/>,
    alertas:<AlertasCentro setView={setView}/>,
    clientes:<Clientes/>,
    entregas:<Entregas/>,
  };

  return(
    <>
      <style>{CSS}</style>
      <SOSGlobalBanner onGo={()=>setView("alertas")}/>
      <div style={{display:"flex",minHeight:"100vh",background:"#f1f4fb",color:TEXT,fontFamily:SANS}}>
        {sidebarOpen&&<div className="mobile-backdrop" onClick={()=>setSidebarOpen(false)}/>}
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
