import { useState, useRef, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import {
  Truck, Package, FileText, LayoutDashboard, DollarSign, Plus,
  Search, X, Check, Minus, MapPin, Clock, CheckCircle, Send,
  Building2, RefreshCw, Trash2, Users,
  Calendar, TrendingUp, Map, Globe,
  ArrowRight, AlertCircle, ChevronDown, ChevronUp, BarChart2,
  Printer, ChevronRight, Navigation, Upload,
  Download, Eye, Target, Zap, FolderOpen, ClipboardList,
} from "lucide-react";
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
const db   = getFirestore(fbApp);

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

function exportFacturasXLSX(facts, mes){
  const rows = facts.map(f=>({
    Folio: f.folio||"",
    "Mes": f.mesOp||"",
    "Año": f.anio||"",
    Empresa: f.empresa||f.cliente||"",
    Solicitante: f.solicitante||"",
    Plan: f.plan||"",
    Servicio: f.servicio||"",
    Subtotal: Number(f.subtotal||f.monto||0),
    IVA: Number(f.ivaAmt||f.iva||0),
    Total: Number(f.total||0),
    Estado: f.status||"Pendiente",
    Notas: f.notas||"",
  }));
  exportFacturasWithTotals(rows, `Facturacion_${mes||"Todos"}_${new Date().getFullYear()}.xlsx`);
}

function exportFacturasWithTotals(rows, filename){
  if(rows.length===0){ alert("No hay facturas para exportar"); return; }
  const totalSub = rows.reduce((a,r)=>a+(r.Subtotal||0),0);
  const totalIVA = rows.reduce((a,r)=>a+(r.IVA||0),0);
  const totalTot = rows.reduce((a,r)=>a+(r.Total||0),0);
  const withTotals = [...rows, {
    Folio:"", Mes:"", "Año":"", Empresa:"", Solicitante:"", Plan:"",
    Servicio:"TOTALES", Subtotal:totalSub, IVA:totalIVA, Total:totalTot, Estado:"", Notas:""
  }];
  const ws = XLSX.utils.json_to_sheet(withTotals);
  ws["!cols"] = Object.keys(rows[0]).map(k=>({wch: Math.max(k.length+2, 14)}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Facturación");
  XLSX.writeFile(wb, filename);
}

function exportFinancierosXLSX(facts){
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const porMes = MESES.map(m=>{
    const its = facts.filter(f=>f.mesOp===m);
    const fac = its.reduce((a,f)=>a+(f.total||0),0);
    const cob = its.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0);
    const pen = its.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+(f.total||0),0);
    const ven = its.filter(f=>f.status==="Vencida").reduce((a,f)=>a+(f.total||0),0);
    return {Mes:m, Registros:its.length, Facturado:fac, Cobrado:cob, Pendiente:pen, Vencido:ven, "% Cobrado":fac>0?Math.round(cob/fac*100):0};
  });
  const tot = {
    Mes:"TOTAL",
    Registros: porMes.reduce((a,r)=>a+r.Registros,0),
    Facturado: porMes.reduce((a,r)=>a+r.Facturado,0),
    Cobrado:   porMes.reduce((a,r)=>a+r.Cobrado,0),
    Pendiente: porMes.reduce((a,r)=>a+r.Pendiente,0),
    Vencido:   porMes.reduce((a,r)=>a+r.Vencido,0),
    "% Cobrado": "",
  };
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet([...porMes, tot]);
  ws1["!cols"] = [{wch:8},{wch:11},{wch:15},{wch:15},{wch:15},{wch:15},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen Mensual");
  const detalle = facts.map(f=>({
    Folio:f.folio||"", Mes:f.mesOp||"", "Año":f.anio||"", Empresa:f.empresa||f.cliente||"",
    Solicitante:f.solicitante||"", Plan:f.plan||"", Servicio:f.servicio||"",
    Subtotal:Number(f.subtotal||f.monto||0), IVA:Number(f.ivaAmt||f.iva||0),
    Total:Number(f.total||0), Estado:f.status||"Pendiente",
  }));
  const ws2 = XLSX.utils.json_to_sheet(detalle);
  ws2["!cols"] = [{wch:14},{wch:6},{wch:6},{wch:24},{wch:20},{wch:14},{wch:28},{wch:14},{wch:12},{wch:14},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws2, "Detalle");
  XLSX.writeFile(wb, "Financieros_"+new Date().getFullYear()+".xlsx");
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
function Modal({title,onClose,children,wide,icon:Icon,iconColor=A}){
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
function CitySearch({value,onChange,onSelect,veh,exclude=[]}){
  const [open,setOpen]=useState(false);
  const filt=TAR.filter(t=>t.c.toLowerCase().includes(value.toLowerCase())&&!exclude.includes(t.c));
  return(
    <div style={{position:"relative"}}>
      <div style={{position:"relative"}}>
        <Search size={13} color={MUTED} style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
        <input value={value} onChange={e=>{onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)}
          placeholder={"Busca entre "+TAR.length+" destinos…"}
          style={{width:"100%",paddingLeft:32,paddingRight:12,paddingTop:10,paddingBottom:10,background:"#fff",border:"1.5px solid "+BD2,borderRadius:10,fontSize:14}}/>
      </div>
      {open&&value&&filt.length>0&&(
        <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,right:0,background:"#fff",border:"1.5px solid "+BD2,borderRadius:13,zIndex:300,maxHeight:240,overflowY:"auto",boxShadow:"0 16px 50px rgba(0,0,0,.14)"}}>
          {filt.slice(0,12).map(t=>(
            <button key={t.c} onClick={()=>{onSelect(t);setOpen(false);onChange("");}} className="btn fr"
              style={{width:"100%",display:"flex",alignItems:"center",gap:11,padding:"9px 14px",borderBottom:"1px solid "+BORDER,background:"transparent",cursor:"pointer"}}>
              <MapPin size={11} color={A}/>
              <div style={{flex:1,textAlign:"left"}}>
                <div style={{fontWeight:600,fontSize:13}}>{t.c}</div>
                <div style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{t.km.toLocaleString()} km · {Math.ceil(t.km/KM_DIA)} día(s)</div>
              </div>
              {veh&&<span style={{fontFamily:MONO,fontSize:12,color:A,fontWeight:700}}>{fmt(t[veh])}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function MiniBar({pct,color=A,h=4}){
  return <div style={{background:BORDER,borderRadius:4,height:h,overflow:"hidden"}}><div style={{background:color,width:Math.min(100,pct)+"%",height:"100%",borderRadius:4,transition:"width .4s"}}/></div>;
}
/* ─── SIDEBAR ────────────────────────────────────────────────────────────── */
const NAV=[
  {id:"dashboard",   label:"Dashboard",         icon:LayoutDashboard},
  {id:"cotizador",   label:"Cotizador Pro",     icon:DollarSign,  badge:"★"},
  {id:"presupuestos",label:"Presupuestos",      icon:ClipboardList, badge:"NEW"},
  {id:"rutas",       label:"Planificador Rutas",icon:Map},
  {id:"nacional",    label:"Proyectos Nacionales",icon:Target},
  {id:"facturas",    label:"Facturación",       icon:FileText},
  {id:"viaticos",    label:"Viáticos & Gastos", icon:Zap},
  {id:"clientes",    label:"Clientes",          icon:Building2},
  {id:"entregas",    label:"Entregas",          icon:Package},
];
function Sidebar({view,setView,stats}){
  return(
    <aside className="noprint" style={{width:192,flexShrink:0,background:"#0a1628",display:"flex",flexDirection:"column",minHeight:"100vh",padding:"0 10px 16px"}}>
      <div style={{padding:"20px 6px 16px",borderBottom:"1px solid #ffffff14",marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:11,background:"linear-gradient(135deg,"+A+",#fb923c)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DISP,fontWeight:900,fontSize:15,color:"#fff",flexShrink:0}}>DM</div>
          <div><div style={{fontFamily:DISP,fontWeight:800,fontSize:14,color:"#fff",letterSpacing:"-0.02em"}}>DMvimiento</div><div style={{fontSize:9,color:"#ffffff60",fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>LOGISTICS OS</div></div>
        </div>
      </div>
      <nav style={{flex:1}}>
        {NAV.map(({id,label,icon:Icon,badge})=>{
          const a=view===id;
          return(
            <button key={id} onClick={()=>setView(id)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:9,marginBottom:1,cursor:"pointer",transition:"all .13s",background:a?"#f97316"+"22":"transparent"}}>
              <Icon size={15} color={a?A:"#ffffff70"} strokeWidth={a?2.5:2}/>
              <span style={{fontSize:12,fontWeight:a?700:500,color:a?A:"#ffffff90",flex:1,textAlign:"left"}}>{label}</span>
              {badge&&<span style={{fontSize:8,fontWeight:800,background:a?A:badge==="NEW"?VIOLET:A,color:"#fff",borderRadius:6,padding:"1px 5px",letterSpacing:"0.05em"}}>{badge}</span>}
            </button>
          );
        })}
      </nav>
      <div style={{borderTop:"1px solid #ffffff14",paddingTop:12,marginTop:4}}>
        <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
          {[["🔥",GREEN,"FIREBASE",stats.fb],[stats.cot+"","#fff","cots",null],[stats.fac+"","#fff","facts",null]].map(([ic,c,l,blink])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
              {blink!==undefined&&<div style={{width:5,height:5,borderRadius:"50%",background:blink?GREEN:ROSE}}/>}
              <span style={{fontSize:9,color:"#ffffff50",fontFamily:MONO}}>{ic||"·"} {l}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
/* ─── DASHBOARD ──────────────────────────────────────────────────────────── */
function Dashboard({setView,cots,facts,rutas,entregas,viat=[]}){
  const totalFac=facts.reduce((a,f)=>a+(f.total||0),0);
  const cobrado=facts.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0);
  const pendiente=facts.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+(f.total||0),0);
  const pctCob=totalFac>0?Math.round(cobrado/totalFac*100):0;
  const totalGastos=viat.reduce((a,g)=>a+(g.monto||0),0);
  const MESES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const mesActual=MESES[new Date().getMonth()];
  const chartData=MESES.map((m,mi)=>{
    const mf=facts.filter(f=>f.mesOp===m);
    return {m,fac:mf.reduce((a,f)=>a+(f.total||0),0),cob:mf.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0)};
  });
  const maxV=Math.max(...chartData.map(d=>d.fac),1);
  const recentCots=cots.slice(0,5);
  const quickActions=[
    {icon:DollarSign,label:"Nueva cotización",color:A,v:"cotizador"},
    {icon:Map,label:"Planificar ruta",color:VIOLET,v:"rutas"},
    {icon:FileText,label:"Registrar factura",color:BLUE,v:"facturas"},
    {icon:Zap,label:"Registrar gasto",color:ROSE,v:"viaticos"},
  ];
  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {/* Header */}
      <div className="au" style={{marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <h1 style={{fontFamily:DISP,fontWeight:900,fontSize:30,color:TEXT,letterSpacing:"-0.03em"}}>Dashboard</h1>
            <p style={{color:MUTED,fontSize:13,marginTop:4}}>Bienvenido a DMvimiento Logistics OS · {new Date().toLocaleDateString("es-MX",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
          </div>
          <button onClick={()=>setView("cotizador")} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:13,padding:"11px 20px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 6px 20px "+A+"40"}}>
            <Plus size={15}/>Nueva cotización
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="au2" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <KpiCard icon={DollarSign} color={A} label="Cotizaciones" value={cots.length} sub="total generadas" onClick={()=>setView("cotizador")}/>
        <KpiCard icon={TrendingUp} color={GREEN} label="Facturado total" value={fmtK(totalFac)} sub={pctCob+"% cobrado"} onClick={()=>setView("facturas")}/>
        <KpiCard icon={Clock} color={AMBER} label="Por cobrar" value={fmtK(pendiente)} sub={facts.filter(f=>f.status==="Pendiente").length+" facturas"} onClick={()=>setView("facturas")}/>
        <KpiCard icon={Zap} color={ROSE} label="Gastos operativos" value={fmtK(totalGastos)} sub={viat.length+" registros"} onClick={()=>setView("viaticos")}/>
      </div>

      <div className="au3" style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:16,marginBottom:16}}>
        {/* Chart */}
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:16,padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div>
              <div style={{fontFamily:DISP,fontWeight:700,fontSize:16}}>Facturación mensual {new Date().getFullYear()}</div>
              <div style={{fontSize:12,color:MUTED,marginTop:2}}>Facturado vs cobrado por mes</div>
            </div>
            <div style={{display:"flex",gap:12}}>
              {[[A,"Facturado"],[GREEN,"Cobrado"]].map(([c,l])=><div key={l} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:9,height:9,borderRadius:2,background:c}}/><span style={{fontSize:11,color:MUTED}}>{l}</span></div>)}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:5,height:140}}>
            {chartData.map(d=>(
              <div key={d.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                {d.fac>0&&<div style={{fontSize:8,fontFamily:MONO,color:d.m===mesActual?A:MUTED,fontWeight:700}}>{fmtK(d.fac)}</div>}
                <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:100,position:"relative",gap:1}}>
                  <div style={{width:"100%",background:d.m===mesActual?A:A+"38",borderRadius:"3px 3px 0 0",height:d.fac>0?Math.max(5,Math.round(d.fac/maxV*100))+"%":"4px",minHeight:3,transition:"height .3s"}}/>
                  {d.cob>0&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:GREEN+"80",borderRadius:"3px 3px 0 0",height:Math.max(2,Math.round(d.cob/maxV*100))+"%"}}/>}
                </div>
                <div style={{fontSize:9,fontWeight:d.m===mesActual?800:500,color:d.m===mesActual?A:MUTED}}>{d.m}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontFamily:DISP,fontWeight:700,fontSize:14,color:TEXT,paddingLeft:2}}>Acceso rápido</div>
          {quickActions.map(({icon:Icon,label,color,v})=>(
            <button key={v} onClick={()=>setView(v)} className="btn ch" style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:13,border:"1px solid "+BORDER,background:"#fff",cursor:"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{width:38,height:38,borderRadius:11,background:color+"14",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={17} color={color}/></div>
              <span style={{fontSize:13,fontWeight:600,color:TEXT}}>{label}</span>
              <ChevronRight size={14} color={MUTED} style={{marginLeft:"auto"}}/>
            </button>
          ))}
          {/* Financial summary mini */}
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:13,padding:"14px 16px",marginTop:2}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Resumen financiero</div>
            <RowItem l="Facturado" v={fmtK(totalFac)} c={TEXT}/>
            <RowItem l="Cobrado" v={fmtK(cobrado)} c={GREEN}/>
            <RowItem l="Por cobrar" v={fmtK(pendiente)} c={AMBER}/>
            <RowItem l="Gastos operativos" v={fmtK(totalGastos)} c={ROSE}/>
            <RowItem l="Margen neto aprox." v={fmtK(cobrado-totalGastos)} c={cobrado>totalGastos?GREEN:ROSE}/>
            <div style={{marginTop:8}}><MiniBar pct={pctCob} color={GREEN}/><div style={{fontSize:10,color:MUTED,marginTop:3}}>{pctCob}% cobrado</div></div>
          </div>
        </div>
      </div>

      {/* Recent cotizaciones */}
      {recentCots.length>0&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:16,overflow:"hidden"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontFamily:DISP,fontWeight:700,fontSize:15}}>Cotizaciones recientes</span>
          <button onClick={()=>setView("cotizador")} className="btn" style={{fontSize:12,color:A,fontWeight:700}}>Ver todas →</button>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
            <thead><tr style={{borderBottom:"1px solid "+BORDER}}>
              {["Folio","Cliente","Destino","Modo","Total",""].map(h=><th key={h} style={{padding:"9px 16px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>{recentCots.map((c,i)=>(
              <tr key={c.id||i} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
                <td style={{padding:"10px 16px",fontFamily:MONO,fontSize:10,color:MUTED}}>{c.folio||"—"}</td>
                <td style={{padding:"10px 16px",fontWeight:700,fontSize:13}}>{c.cliente||"—"}</td>
                <td style={{padding:"10px 16px",fontSize:12,color:MUTED}}>{c.destino||"—"}</td>
                <td style={{padding:"10px 16px"}}><Tag color={c.modo==="local"?BLUE:c.modo==="masivo"?VIOLET:A} sm>{c.modoLabel||c.modo||"—"}</Tag></td>
                <td style={{padding:"10px 16px",fontFamily:MONO,fontSize:13,fontWeight:800,color:A}}>{fmt(c.total||0)}</td>
                <td style={{padding:"10px 16px"}}><button onClick={()=>printCotizacion(c)} className="btn" style={{color:MUTED}}><Printer size={13}/></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
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
  const [fBuilding2,setFBuilding2]=useState(HOTEL);

  // ── MASIVO
  const [mVeh,setMVeh]=useState("cam");
  const [mMaxDia,setMMaxDia]=useState(20);
  const [mPersonas,setMPersonas]=useState(1);
  const [mAyud,setMAyud]=useState(false);
  const [mUrg,setMUrg]=useState(false);
  const [mComida,setMComida]=useState(COMIDA);
  const [mBuilding2,setMBuilding2]=useState(HOTEL);
  const [mCiudades,setMCiudades]=useState([]);
  const [mSearch,setMSearch]=useState("");

  const calcMVans=(pdv,dias,mpd)=>Math.max(1,Math.ceil(pdv/(mpd*Math.max(dias,1))));
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
  const {xC:fXC,xH:fXH,total:fXV,dias:fDias,noches:fNoches}=useMemo(()=>fMaxKm>0?calcViaticos(fMaxKm,fCrew,fComida,fBuilding2):{xC:0,xH:0,total:0,dias:0,noches:0},[fMaxKm,fCrew,fComida,fBuilding2]);
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
  const {xC:mXC,xH:mXH,total:mXV}=useMemo(()=>mMaxKm>0?calcViaticos(mMaxKm,mPersonasT,mComida,mBuilding2):{xC:0,xH:0,total:0},[mMaxKm,mPersonasT,mComida,mBuilding2]);
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
                  <input type="number" value={fBuilding2} onChange={e=>setFBuilding2(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
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
                  <input type="number" value={mBuilding2} onChange={e=>setMBuilding2(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
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
function PlanificadorRutas(){
  const [nombre,setNombre]=useState("");
  const [cliente,setCliente]=useState("");
  const [veh,setVeh]=useState("cam");
  const [stops,setStops]=useState([{id:uid(),city:"Ciudad de México",pdv:0,km:0,base:0,isOrigin:true}]);
  const [search,setSearch]=useState("");
  const [maxDia,setMaxDia]=useState(20);
  const [plazo,setPlazo]=useState(5);
  const [comida,setComida]=useState(COMIDA);
  const [hotel,setBuilding2]=useState(HOTEL);
  const [pVan,setPVan]=useState(1);
  const [ayud,setAyud]=useState(false);
  const [urg,setUrg]=useState(false);
  const [rutas,setRutas]=useState([]);
  const [loadR,setLoadR]=useState(true);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState(null);
  const [viewR,setViewR]=useState(null);
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
  const xU=urg?tarifaT*.35:0;
  const sub=tarifaT+xU+xViat;
  const iva=sub*.16;
  const total=sub+iva;
  const mapU=useMemo(()=>mapsURL(stops.map(s=>s.city)),[stops]);

  const addStop=t=>{
    setStops(p=>[...p,{id:uid(),city:t.c,pdv:0,km:t.km,base:t[veh],isOrigin:false}]);
    setSearch("");
  };
  const rmStop=id=>setStops(p=>p.filter(s=>s.id!==id||s.isOrigin));
  const updStop=(id,k,v)=>setStops(p=>p.map(s=>s.id===id?{...s,[k]:v}:s));
  const mvUp=i=>{if(i<=1)return;setStops(p=>{const a=[...p];[a[i-1],a[i]]=[a[i],a[i-1]];return a;});};
  const mvDn=i=>{if(i>=stops.length-1)return;setStops(p=>{const a=[...p];[a[i],a[i+1]]=[a[i+1],a[i]];return a;});};

  useEffect(()=>{
    setStops(p=>p.map(s=>{
      if(s.isOrigin) return s;
      const t=TAR.find(t=>t.c===s.city);
      return t?{...s,base:t[veh]}:s;
    }));
  },[veh]);

  const handleSave=async()=>{
    if(!nombre.trim()||stops.length<2){showT("Agrega nombre y al menos un destino","err");return;}
    setSaving(true);
    try{
      await addDoc(collection(db,"rutas"),{nombre,cliente,veh,vehiculoLabel:vehD?.label,stops:stops.map(s=>({city:s.city,pdv:s.pdv||0,km:s.km||0})),totalPDV,totalKm,vans,diasOp,capDia,crew,xViat,tarifaT,sub,iva,total,plazo,maxDia,mapURL:mapU,status:"Programada",progreso:0,createdAt:serverTimestamp()});
      showT("✓ Ruta guardada");
    }catch(e){showT(e.message,"err");}
    setSaving(false);
  };

  const sc={Programada:VIOLET,"En curso":BLUE,Completada:GREEN,Cancelada:ROSE};

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div><h1 style={{fontFamily:DISP,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Planificador de Rutas</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>Multi-parada · Flota automática · Google Maps</p></div>
        <button onClick={()=>exportRutasXLSX(rutas)} className="btn" title="Exportar rutas guardadas a Excel" style={{display:"flex",alignItems:"center",gap:7,background:"#fff",border:"1.5px solid "+GREEN+"40",color:GREEN,borderRadius:12,padding:"10px 16px",fontFamily:SANS,fontWeight:700,fontSize:13}}><Download size={13}/>Exportar XLSX</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 350px",gap:16,alignItems:"start"}}>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>

          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:20}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Datos de la ruta</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
              <Inp label="Nombre de ruta *" value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej: MTY Noreste S12"/>
              <Inp label="Cliente" value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Nombre del cliente"/>
            </div>
          </div>

          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:DISP,fontWeight:700,fontSize:14}}>Paradas ({stops.length})</span>
              <div style={{display:"flex",gap:7}}><Tag color={VIOLET}>{stops.filter(s=>!s.isOrigin).length} destinos</Tag><Tag color={A}>{totalPDV.toLocaleString()} PDVs</Tag></div>
            </div>
            <div style={{padding:14,display:"flex",flexDirection:"column",gap:8}}>
              {stops.map((s,i)=>(
                <div key={s.id} style={{display:"flex",alignItems:"flex-start",gap:9,background:s.isOrigin?"#f8fafd":"#fff",border:"1.5px solid "+(s.isOrigin?BD2:A+"24"),borderRadius:11,padding:"11px 13px",transition:"all .13s"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",paddingTop:5}}>
                    <div style={{width:11,height:11,borderRadius:"50%",background:s.isOrigin?BLUE:A,flexShrink:0}}/>
                    {i<stops.length-1&&<div style={{width:2,height:18,background:BD2,marginTop:3}}/>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:s.isOrigin?0:8}}>
                      <span style={{fontWeight:700,fontSize:14,color:TEXT}}>{s.city}</span>
                      {s.isOrigin&&<Tag color={BLUE} sm>ORIGEN</Tag>}
                      {!s.isOrigin&&s.km>0&&<span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{s.km.toLocaleString()} km</span>}
                    </div>
                    {!s.isOrigin&&(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>PDVs en esta parada</div>
                          <input type="number" value={s.pdv||""} onChange={e=>updStop(s.id,"pdv",parseInt(e.target.value)||0)} placeholder="0"
                            style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontFamily:MONO,fontSize:15,fontWeight:700,color:A}}/>
                        </div>
                        <div>
                          <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Zona / Referencia</div>
                          <input type="text" value={s.addr||""} onChange={e=>updStop(s.id,"addr",e.target.value)} placeholder="Opcional"
                            style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:8,padding:"7px 10px",fontSize:13}}/>
                        </div>
                      </div>
                    )}
                  </div>
                  {!s.isOrigin&&(
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      <button onClick={()=>mvUp(i)} className="btn" style={{border:"1px solid "+BD2,borderRadius:6,padding:"3px 5px",color:MUTED}}><ChevronUp size={10}/></button>
                      <button onClick={()=>mvDn(i)} className="btn" style={{border:"1px solid "+BD2,borderRadius:6,padding:"3px 5px",color:MUTED}}><ChevronDown size={10}/></button>
                      <button onClick={()=>rmStop(s.id)} className="btn" style={{border:"1px solid "+ROSE+"28",background:ROSE+"08",borderRadius:6,padding:"3px 5px",color:ROSE}}><X size={10}/></button>
                    </div>
                  )}
                </div>
              ))}
              <div style={{padding:"11px 13px",background:A+"06",border:"1.5px dashed "+A+"38",borderRadius:11}}>
                <div style={{fontSize:10,fontWeight:800,color:A,marginBottom:8,letterSpacing:"0.05em"}}>+ AGREGAR PARADA</div>
                <CitySearch value={search} onChange={setSearch} onSelect={addStop} veh={veh} exclude={stops.map(s=>s.city)}/>
              </div>
            </div>
          </div>

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
                <input type="number" value={hotel} onChange={e=>setBuilding2(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BD2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
              </div>
            </div>
            {diasF>0&&<div style={{padding:"9px 12px",background:BLUE+"08",borderRadius:9,border:"1px solid "+BLUE+"18"}}>
              <div style={{fontSize:11,color:BLUE,fontWeight:600}}>{crew}p × {diasF}d × ${comida}/comida{noches>0?" + "+noches+"n × $"+hotel+"/hotel":""}</div>
              <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:BLUE,marginTop:3}}>Total viáticos: {fmt(xViat)}</div>
            </div>}
          </div>

          <div style={{display:"flex",gap:9}}>
            <button onClick={handleSave} disabled={saving} className="btn" style={{flex:2,padding:"13px 0",borderRadius:12,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",fontFamily:DISP,fontWeight:700,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 5px 20px "+A+"35",opacity:saving?.7:1}}>
              {saving?<><div style={{width:15,height:15,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}} className="spin"/>Guardando…</>:<><Map size={17}/>Guardar Ruta</>}
            </button>
            <button onClick={()=>{const q={folio:"RUT-"+uid(),cliente,modo:"ruta",modoLabel:"RUTA MULTI-PARADA",destino:stops.filter(s=>!s.isOrigin).map(s=>s.city).join(" → "),vehiculoLabel:vehD?.label,stops,lines:[{label:"Tarifa transporte",value:fmt(tarifaT)},urg&&{label:"⚡ Urgente",value:"+"+fmt(xU),color:ROSE},xViat>0&&{label:"Viáticos",value:"+"+fmt(xViat),color:AMBER},{label:"Subtotal",value:fmt(sub)},{label:"IVA 16%",value:fmt(iva),color:MUTED},{label:"TOTAL",value:fmt(total),bold:true,color:A}].filter(Boolean),flota:{vans,dias:diasOp,capDia},totalPDV,plazo,total};printCotizacion(q);}} className="btn"
              style={{flex:1,padding:"13px 0",borderRadius:12,border:"1.5px solid "+BD2,background:"#fff",fontFamily:SANS,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7,color:TEXT}}>
              <Printer size={14}/>PDF
            </button>
            {mapU&&<a href={mapU} target="_blank" rel="noopener noreferrer" className="btn"
              style={{flex:1,padding:"13px 0",borderRadius:12,border:"1.5px solid "+BLUE+"28",background:BLUE+"0e",fontFamily:SANS,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7,color:BLUE,textDecoration:"none"}}>
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
              {[[fmt(tarifaT),"Transporte×"+vans],[xU>0&&"+"+fmt(xU),"⚡ Urgente",ROSE],[xViat>0&&"+"+fmt(xViat),"Viáticos",AMBER],[fmt(sub),"Subtotal"],[fmt(iva),"IVA 16%",MUTED]].filter(r=>r&&r[0]).map(([v,l,c],i)=>(
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
                  <div style={{display:"flex",gap:7}}><Tag color={A} sm>{fmt(r.total||0)}</Tag><Tag color={VIOLET} sm>{r.vans||1} vans</Tag></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {viewR&&<Modal title={viewR.nombre} onClose={()=>setViewR(null)} wide icon={Map} iconColor={VIOLET}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:16}}>
          <InfoBox icon={Truck} color={A} title="Vans" value={viewR.vans||1} sub={VEHK.find(v=>v.k===viewR.veh)?.label}/>
          <InfoBox icon={Calendar} color={BLUE} title="Días" value={(viewR.diasOp||"—")+" días"} sub={"Plazo: "+(viewR.plazo||"—")+" días"}/>
          <InfoBox icon={Package} color={VIOLET} title="PDVs" value={(viewR.totalPDV||0).toLocaleString()} sub={(viewR.capDia||0)+"/día"}/>
          <InfoBox icon={Globe} color={GREEN} title="~Km" value={(viewR.totalKm||0).toLocaleString()}/>
        </div>
        <div style={{marginBottom:14}}>
          {(viewR.stops||[]).map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid "+BORDER}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:A+"14",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:A,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,fontWeight:600,fontSize:13}}>{s.city}</div>
              {s.pdv>0&&<Tag color={A} sm>{s.pdv} PDVs</Tag>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:9}}>
          <button onClick={()=>downloadRutaPDF(viewR)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:"#fff",border:"1.5px solid "+VIOLET+"30",color:VIOLET,display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:SANS,fontWeight:700,fontSize:13}}><Download size={14}/>PDF</button>
          {viewR.mapURL&&<a href={viewR.mapURL} target="_blank" rel="noopener noreferrer" className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:BLUE+"0e",border:"1.5px solid "+BLUE+"28",color:BLUE,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:SANS,fontWeight:700,fontSize:13}}><Globe size={14}/>Maps</a>}
          <button onClick={async()=>{await updateDoc(doc(db,"rutas",viewR.id),{status:viewR.status==="En curso"?"Completada":"En curso"});setViewR(null);}} className="btn"
            style={{flex:1,padding:"10px 0",borderRadius:10,background:"linear-gradient(135deg,"+A+",#fb923c)",border:"none",cursor:"pointer",fontFamily:SANS,fontWeight:700,fontSize:13,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            {viewR.status==="En curso"?<><CheckCircle size={14}/>Completar</>:<><Navigation size={14}/>Iniciar</>}
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
                    <button onClick={()=>printFactura(f)} className="btn" title="Imprimir" style={{color:MUTED,padding:"4px 6px",border:"1px solid "+BD2,borderRadius:6,display:"flex",alignItems:"center",fontSize:11}}>
                      <Printer size={12}/>
                    </button>
                    <button onClick={()=>openEdit(f)} className="btn" style={{color:MUTED,padding:4}}><Eye size={13}/></button>
                    <button onClick={()=>del(f.id)} className="btn" style={{color:MUTED,padding:4}}><Trash2 size={12}/></button>
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
  const del=async id=>{await deleteDoc(doc(db,"entregas",id));showT("Eliminada");};
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

/* ─── ROOT APP ───────────────────────────────────────────────────────────── */
export default function App(){
  const [view,setView]=useState("dashboard");
  const [cots,setCots]=useState([]);
  const [facts,setFacts]=useState([]);
  const [rutas,setRutas]=useState([]);
  const [entregas,setEntregas]=useState([]);
  const [viat,setViat]=useState([]);
  const [fbOk,setFbOk]=useState(false);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"cotizaciones"),s=>{setCots(s.docs.map(d=>({id:d.id,...d.data()})));setFbOk(true);});
    const u2=onSnapshot(collection(db,"facturas"),s=>setFacts(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3=onSnapshot(collection(db,"rutas"),s=>setRutas(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u4=onSnapshot(collection(db,"entregas"),s=>setEntregas(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u5=onSnapshot(collection(db,"viaticos"),s=>setViat(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();u3();u4();u5();};
  },[]);

  const VIEWS={
    dashboard:<Dashboard setView={setView} cots={cots} facts={facts} rutas={rutas} entregas={entregas} viat={viat}/>,
    cotizador:<Cotizador onSaved={()=>setView("dashboard")}/>,
    presupuestos:<Presupuestos/>,
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
        <Sidebar view={view} setView={setView} stats={{cot:cots.length,fac:facts.length,rut:rutas.length,fb:fbOk}}/>
        <main style={{flex:1,overflowY:"auto",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
          {VIEWS[view]||VIEWS.dashboard}
        </main>
      </div>
    </>
  );
}
