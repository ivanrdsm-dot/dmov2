import { useState, useRef, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp,
} from "firebase/firestore";

import {
  Truck, Package, FileText, LayoutDashboard, DollarSign, Plus,
  Search, X, Check, Minus, MapPin, Clock, CheckCircle, Send,
  Layers, Building2, RefreshCw, Trash2, Users, Hotel,
  UtensilsCrossed, Calendar, TrendingUp, Map, Globe,
  ArrowRight, AlertCircle, ChevronDown, ChevronUp, BarChart2,
  Printer, ChevronRight, Navigation, Upload, FolderOpen, Zap,
  Target, BarChart, Grid,
} from "lucide-react";

/* ─── FIREBASE ──────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyB7tuRYUEY471IPJdnOB69DI2yKLCU72T0",
  authDomain: "salesflow-crm-13c4a.firebaseapp.com",
  projectId: "salesflow-crm-13c4a",
  storageBucket: "salesflow-crm-13c4a.firebasestorage.app",
  messagingSenderId: "525995422237",
  appId: "1:525995422237:web:e69d7e7dd76ac9640c8cf4",
};
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);

/* ─── DESIGN TOKENS ─────────────────────────────────────────────────────── */
const A = "#f97316";
const BLUE = "#2563eb";
const GREEN = "#059669";
const VIOLET = "#7c3aed";
const ROSE = "#e11d48";
const AMBER = "#d97706";
const MUTED = "#607080";
const TEXT = "#0c1829";
const BORDER = "#e8eef6";
const BORDER2 = "#d2dcea";
const SANS = "'Plus Jakarta Sans',sans-serif";
const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800;12..96,900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%}
body{background:#f1f4fb;font-family:${SANS};color:${TEXT};-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${BORDER2};border-radius:8px}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes popIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes spin{to{transform:rotate(360deg)}}
.au{animation:fadeUp .32s cubic-bezier(.22,1,.36,1) both}
.au2{animation:fadeUp .32s .07s cubic-bezier(.22,1,.36,1) both}
.au3{animation:fadeUp .32s .14s cubic-bezier(.22,1,.36,1) both}
.pi{animation:popIn .2s cubic-bezier(.34,1.56,.64,1) both}
.spin{animation:spin 1s linear infinite}
.btn{transition:all .12s;cursor:pointer;border:none;background:transparent;padding:0}
.btn:hover{filter:brightness(1.06);transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.ch{transition:box-shadow .18s,transform .18s}
.ch:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(12,24,41,.1)!important}
.fr{transition:background .1s}
.fr:hover{background:#f6f9ff!important}
input,select,textarea{font-family:${SANS};color:${TEXT};outline:none}
input:focus,select:focus,textarea:focus{border-color:${A}!important;box-shadow:0 0 0 3px ${A}18!important}
@media print{.noprint{display:none!important}body{background:#fff}}
`;

/* ─── TARIFARIO LOCAL OFICIAL 2026 (verificado del Excel) ───────────────── */
const LOC = {
  eur:{ normal:2500, ayudante:3000, urgente:2500, urgente_ay:3000, resguardo:1800, renta_dia:1600, renta_chofer:3500, renta_mes:36000 },
  cam:{ normal:3200, ayudante:4300, urgente:3200, urgente_ay:4300, resguardo:3200, renta_dia:2800, renta_chofer:5800, renta_mes:63000 },
  kra:{ normal:3600, ayudante:5000, urgente:3600, urgente_ay:5000, resguardo:3600 },
  rab:{ normal:6000, ayudante:8000, urgente:6000, urgente_ay:8000, resguardo:6000 },
  mud:{ normal:8000, ayudante:10000,urgente:8000, urgente_ay:10000,resguardo:8000 },
};

/* ─── TARIFARIO FORÁNEO 2026 (del Excel, valores exactos) ───────────────── */
const TAR = [
  {c:"Acapulco",km:395,eur:13310,cam:20086,kra:22082,rab:26741,mud:32561},
  {c:"Aguascalientes",km:513,eur:15178,cam:22215,kra:24437,rab:30356,mud:36566},
  {c:"Apizaco",km:145,eur:6899,cam:11540,kra:12858,rab:17399,mud:22103},
  {c:"Campeche",km:1155,eur:29667,cam:40241,kra:44657,rab:50678,mud:61817},
  {c:"Cancún",km:1649,eur:40204,cam:58455,kra:64476,rab:73571,mud:88059},
  {c:"Cd. Juárez",km:1863,eur:47542,cam:60437,kra:67612,rab:83418,mud:92449},
  {c:"Cd. Obregón",km:1671,eur:41119,cam:53952,kra:59347,rab:74511,mud:81912},
  {c:"Cd. Victoria",km:721,eur:20560,cam:28977,kra:31874,rab:37256,mud:43741},
  {c:"Celaya",km:263,eur:8279,cam:12695,kra:13964,rab:18628,mud:24147},
  {c:"Chetumal",km:1345,eur:30356,cam:46225,kra:50847,rab:55884,mud:64852},
  {c:"Chiapas",km:1015,eur:23206,cam:31485,kra:35123,rab:42022,mud:50051},
  {c:"Chihuahua",km:1487,eur:33806,cam:49674,kra:54642,rab:64852,mud:74511},
  {c:"Chilpancingo",km:278,eur:9659,cam:15178,kra:16696,rab:22077,mud:26907},
  {c:"Coatzacoalcos",km:601,eur:17938,cam:24561,kra:27017,rab:29391,mud:35876},
  {c:"Colima",km:744,eur:19732,cam:28839,kra:31723,rab:35876,mud:42775},
  {c:"Cozumel",km:1550,eur:48922,cam:69996,kra:77008,rab:83292,mud:101983},
  {c:"Cuernavaca",km:89,eur:3864,cam:6899,kra:7589,rab:10763,mud:15454},
  {c:"Culiacán",km:1262,eur:29805,cam:46225,kra:50847,rab:55884,mud:64602},
  {c:"Durango",km:915,eur:23043,cam:28977,kra:31874,rab:38636,mud:44845},
  {c:"Ensenada",km:2961,eur:59333,cam:75891,kra:83480,rab:89690,mud:107628},
  {c:"Gómez Palacio",km:985,eur:22767,cam:33116,kra:36428,rab:45535,mud:52434},
  {c:"Guadalajara",km:542,eur:15178,cam:22215,kra:24437,rab:30356,mud:36566},
  {c:"Hermosillo",km:1959,eur:48018,cam:63887,kra:70275,rab:74386,mud:84170},
  {c:"Iguala",km:203,eur:8279,cam:13108,kra:14419,rab:21388,mud:23871},
  {c:"Irapuato",km:323,eur:12419,cam:18628,kra:20491,rab:25527,mud:32313},
  {c:"Jalapa/Xalapa",km:322,eur:12419,cam:18628,kra:20491,rab:25527,mud:29805},
  {c:"La Paz BCS",km:4312,eur:77271,cam:104868,kra:115355,rab:124186,mud:135224},
  {c:"Laredo",km:1117,eur:26493,cam:37394,kra:41133,rab:49536,mud:59935},
  {c:"León",km:387,eur:13798,cam:20823,kra:22893,rab:27722,mud:33756},
  {c:"Los Mochis",km:1442,eur:33806,cam:48984,kra:53883,rab:59333,mud:68302},
  {c:"Matamoros",km:975,eur:23871,cam:34220,kra:37642,rab:46225,mud:53124},
  {c:"Mazatlán",km:1042,eur:26631,cam:37394,kra:41133,rab:50502,mud:60023},
  {c:"Mérida",km:1332,eur:32991,cam:47604,kra:52622,rab:62532,mud:71990},
  {c:"Mexicali",km:2661,eur:56573,cam:73132,kra:80445,rab:91069,mud:106248},
  {c:"Minatitlán",km:579,eur:17938,cam:24561,kra:27017,rab:29391,mud:35876},
  {c:"Monclova",km:1021,eur:26970,cam:38636,kra:42524,rab:50301,mud:58580},
  {c:"Monterrey",km:933,eur:21325,cam:28475,kra:31423,rab:43904,mud:54566},
  {c:"Morelia",km:302,eur:12419,cam:18628,kra:20491,rab:25527,mud:32313},
  {c:"Oaxaca",km:470,eur:12419,cam:18628,kra:20491,rab:25527,mud:32313},
  {c:"Orizaba",km:269,eur:11039,cam:18628,kra:20491,rab:24147,mud:28977},
  {c:"Pachuca",km:95,eur:4390,cam:7777,kra:8655,rab:12293,mud:16934},
  {c:"Piedras Negras",km:1286,eur:34621,cam:51807,kra:58204,rab:69556,mud:80633},
  {c:"Poza Rica",km:273,eur:12419,cam:17938,kra:19732,rab:25527,mud:32313},
  {c:"Puebla",km:123,eur:5080,cam:7727,kra:8718,rab:13610,mud:16809},
  {c:"Puerto Vallarta",km:875,eur:21450,cam:30218,kra:34496,rab:44218,mud:49737},
  {c:"Querétaro",km:211,eur:6899,cam:11917,kra:12143,rab:17800,mud:22767},
  {c:"Reynosa",km:1002,eur:25251,cam:35600,kra:39160,rab:43189,mud:51769},
  {c:"Río Blanco",km:279,eur:11039,cam:18628,kra:20491,rab:24147,mud:28977},
  {c:"Saltillo",km:849,eur:17938,cam:25527,kra:28080,rab:35600,mud:42085},
  {c:"San Juan del Río",km:162,eur:5519,cam:10211,kra:11232,rab:16006,mud:20284},
  {c:"San Luis Potosí",km:415,eur:13108,cam:18628,kra:20491,rab:25113,mud:30231},
  {c:"Tampico",km:486,eur:16558,cam:25251,kra:27776,rab:34220,mud:42085},
  {c:"Tapachula",km:1157,eur:29102,cam:42900,kra:47291,rab:56385,mud:67863},
  {c:"Taxco",km:187,eur:8279,cam:13108,kra:14419,rab:19732,mud:25251},
  {c:"Tepic",km:756,eur:21939,cam:28839,kra:31723,rab:39739,mud:50991},
  {c:"Tijuana",km:2848,eur:63347,cam:81787,kra:90066,rab:104993,mud:120548},
  {c:"Tlaxcala",km:118,eur:5381,cam:9659,kra:10625,rab:12419,mud:16420},
  {c:"Toluca",km:66,eur:3808,cam:6944,kra:7952,rab:11415,mud:16182},
  {c:"Torreón",km:1012,eur:22767,cam:31184,kra:34303,rab:43465,mud:51368},
  {c:"Tuxpan",km:324,eur:13108,cam:20284,kra:22312,rab:25665,mud:34822},
  {c:"Tuxtla Gutiérrez",km:1015,eur:25966,cam:35261,kra:39338,rab:48445,mud:62344},
  {c:"Veracruz",km:402,eur:14676,cam:22705,kra:25025,rab:29478,mud:37331},
  {c:"Villahermosa",km:768,eur:20698,cam:31874,kra:35062,rab:40843,mud:49147},
  {c:"Zacatecas",km:605,eur:19318,cam:26217,kra:28839,rab:36497,mud:45535},
  {c:"Zamora",km:430,eur:13108,cam:18628,kra:20491,rab:24561,mud:33116},
];

const VEHK = [
  {k:"eur",label:"Eurovan 1T",cap:"8 m³",crew:1,icon:"🚐"},
  {k:"cam",label:"Camioneta 3.5T",cap:"16 m³",crew:1,icon:"🚛"},
  {k:"kra",label:"Krafter",cap:"20 m³",crew:1,icon:"🚐"},
  {k:"rab",label:"Rabón 40 m³",cap:"40 m³",crew:2,icon:"🚚"},
  {k:"mud",label:"Mudancero 70 m³",cap:"70 m³",crew:3,icon:"🏗️"},
];

/* ─── UTILS ─────────────────────────────────────────────────────────────── */
const fmt = n => "$"+Math.round(n).toLocaleString("es-MX");
const fmtK = n => n>=1e6?"$"+(n/1e6).toFixed(2)+"M":n>=1e3?"$"+(n/1e3).toFixed(1)+"k":"$"+Math.round(n);
const uid = () => Math.random().toString(36).slice(2,8).toUpperCase();
const KM_DIA=550, COMIDA=350, HOTEL=900, ADIC=1200, AYUD=2800;

function diasRuta(km){
  if(!km) return {ida:0,noches:0,total:0};
  const ida=Math.ceil(km/KM_DIA);
  return {ida, noches:km>300?ida:0, total:ida*2};
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
  return "https://www.google.com/maps/dir/?api=1&origin="+o+"&destination="+d+(wp.length?"&waypoints="+wp.join("|"):"")+"&travelmode=driving";
}

/* ─── PDF ───────────────────────────────────────────────────────────────── */
function printPDF(q){
  const row=(l,v,bold,color)=>`<tr><td style="padding:9px 0;border-bottom:1px solid #eef2f8;font-size:13px;color:#607080;font-weight:${bold?700:400}">${l}</td><td style="padding:9px 0;border-bottom:1px solid #eef2f8;text-align:right;font-size:${bold?16:13}px;font-weight:700;color:${color||"#0c1829"};font-family:'JetBrains Mono',monospace">${v}</td></tr>`;
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Cotización ${q.folio}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Plus Jakarta Sans',sans-serif;background:#fff;color:#0c1829;padding:40px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:20px;border-bottom:3px solid #f97316}
.logo{font-size:26px;font-weight:800}.logo span{color:#f97316}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
.meta label{font-size:10px;font-weight:700;color:#607080;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px}
.meta .v{font-size:15px;font-weight:700}
.sec{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#607080;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eef2f8}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
.tot{background:#fff8f3;padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-top:12px}
.tot .lbl{font-size:13px;font-weight:600;color:#607080}.tot .amt{font-size:28px;font-weight:800;color:#f97316;font-family:'JetBrains Mono',monospace}
.footer{margin-top:36px;padding-top:16px;border-top:1px solid #eef2f8;display:flex;justify-content:space-between;font-size:11px;color:#9db0c4}
.note{background:#f8fafd;border:1px solid #eef2f8;border-radius:8px;padding:12px;font-size:12px;color:#607080;line-height:1.6;margin-bottom:20px}
@media print{body{padding:20px}}</style></head><body>
<div class="hdr"><div><div class="logo">DM<span>vimiento</span></div><div style="font-size:12px;color:#607080;margin-top:4px">Logística Especializada · México 2026</div>
<div style="margin-top:8px;display:inline-block;background:#f1f4fb;padding:4px 12px;border-radius:20px;font-size:11px;font-family:'JetBrains Mono',monospace;color:#607080">FOLIO: ${q.folio}</div></div>
<div style="text-align:right"><div style="font-size:11px;color:#607080">Fecha</div><div style="font-weight:700;margin-top:2px">${new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"})}</div>
<div style="margin-top:8px;display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#fff4ec;color:#f97316">${q.modoLabel||q.modo}</div></div></div>
<div class="meta">
<div><label>Cliente</label><div class="v">${q.cliente||"—"}</div></div>
<div><label>Contacto</label><div class="v">${q.contacto||"—"}</div></div>
<div><label>Destino</label><div class="v">${q.destino||"—"}</div></div>
<div><label>Vehículo</label><div class="v">${q.vehiculoLabel||"—"}</div></div>
</div>
${q.stops&&q.stops.length>1?`<div class="sec">Paradas de ruta</div>${q.stops.map((s,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px"><div style="width:20px;height:20px;border-radius:50%;background:#fff4ec;color:#f97316;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div><strong>${s.city||s}</strong>${s.pdv?" — "+s.pdv+" PDVs":""}</div>`).join("")}<div style="margin-bottom:20px"></div>`:""}
<div class="sec">Desglose de costos</div>
<table><tbody>${(q.lines||[]).map(l=>row(l.label,l.value,l.bold,l.color)).join("")}</tbody></table>
<div class="tot"><div class="lbl">TOTAL CON IVA</div><div class="amt">${fmt(q.total||0)}</div></div>
${q.flota?`<div style="margin-top:24px"><div class="sec">Plan de flota</div><table><tbody>${row("Camionetas",q.flota.vans+" unidades")}${row("Días de operación",q.flota.dias+" días")}${row("Capacidad diaria",q.flota.capDia.toLocaleString()+" entregas/día")}${row("PDV totales",(q.totalPDV||0).toLocaleString())}</tbody></table></div>`:""}
<div class="note"><strong>Condiciones generales:</strong> Propuesta válida por 15 días. Precios sin IVA mostrados por separado. Servicio incluye combustible, casetas y seguro básico. Sujeto a disponibilidad de unidades.</div>
${q.notas?`<div class="note">${q.notas}</div>`:""}
<div class="footer"><div>DMvimiento Logística · México 2026</div><div>Generado ${new Date().toLocaleString("es-MX")}</div></div>
</body></html>`;
  const w=window.open("","_blank","width=900,height=700");
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),700);}
}

/* ─── ATOMS ─────────────────────────────────────────────────────────────── */
function Tag({color=A,children,sm}){
  return <span style={{background:color+"16",color,border:"1px solid "+color+"28",borderRadius:20,padding:sm?"2px 8px":"3px 12px",fontSize:sm?10:11,fontWeight:700,letterSpacing:"0.04em",whiteSpace:"nowrap",fontFamily:SANS}}>{children}</span>;
}

function KpiCard({icon:Icon,color,label,value,sub,onClick}){
  return(
    <div onClick={onClick} className="ch au" style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:16,padding:"20px 22px",cursor:onClick?"pointer":"default",boxShadow:"0 1px 4px rgba(12,24,41,.05)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div style={{width:38,height:38,borderRadius:11,background:color+"14",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon size={17} color={color}/></div>
      </div>
      <div style={{fontFamily:MONO,fontSize:26,fontWeight:700,color:TEXT,lineHeight:1,marginBottom:4}}>{value}</div>
      <div style={{fontSize:12,fontWeight:600,color:MUTED,letterSpacing:"0.03em"}}>{label}</div>
      {sub&&<div style={{fontSize:11,color:MUTED+"90",marginTop:2}}>{sub}</div>}
    </div>
  );
}

function Toast({msg,type,onClose}){
  useEffect(()=>{const t=setTimeout(()=>onClose&&onClose(),3500);return()=>clearTimeout(t);},[]);
  const c=type==="err"?ROSE:GREEN;
  return(
    <div className="pi" style={{position:"fixed",top:20,right:24,zIndex:9999,background:"#fff",border:"1px solid "+c+"38",borderRadius:14,padding:"12px 18px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 8px 40px rgba(0,0,0,.14)",fontSize:13,minWidth:260,maxWidth:400}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0,boxShadow:"0 0 8px "+c}}/>
      <span style={{flex:1}}>{msg}</span>
      <button onClick={onClose} className="btn" style={{color:MUTED,padding:2}}><X size={13}/></button>
    </div>
  );
}

function Modal({title,onClose,children,wide,icon:Icon,iconColor=A}){
  return(
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(12,24,41,.4)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div className="pi" style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:wide?740:480,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:11,padding:"20px 24px",borderBottom:"1px solid "+BORDER,position:"sticky",top:0,background:"#fff",zIndex:10,borderRadius:"20px 20px 0 0"}}>
          {Icon&&<div style={{width:32,height:32,borderRadius:9,background:iconColor+"14",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={15} color={iconColor}/></div>}
          <span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:16,flex:1}}>{title}</span>
          <button onClick={onClose} className="btn" style={{width:28,height:28,borderRadius:"50%",border:"1px solid "+BORDER2,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED}}><X size={13}/></button>
        </div>
        <div style={{padding:"22px 24px"}}>{children}</div>
      </div>
    </div>
  );
}

function Inp({label,...p}){
  const [f,setF]=useState(false);
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>}
      <input {...p} onFocus={e=>{setF(true);p.onFocus&&p.onFocus(e);}} onBlur={e=>{setF(false);p.onBlur&&p.onBlur(e);}}
        style={{width:"100%",background:"#fff",border:"1.5px solid "+(f?A:BORDER2),borderRadius:10,padding:"10px 13px",fontSize:14,transition:"all .13s",boxShadow:f?"0 0 0 3px "+A+"14":"none",...p.style}}/>
    </div>
  );
}

function Sel({label,options,value,onChange}){
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>}
      <select value={value} onChange={onChange} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:10,padding:"10px 13px",fontSize:14,cursor:"pointer"}}>
        {options.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
      </select>
    </div>
  );
}

function Txt({label,...p}){
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>}
      <textarea {...p} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:10,padding:"10px 13px",fontSize:14,resize:"vertical",minHeight:75,...p.style}}/>
    </div>
  );
}

function Spin({label,value,onChange,min=0,max=9999,step=1}){
  return(
    <div>
      {label&&<div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>}
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={()=>onChange(Math.max(min,value-step))} className="btn" style={{width:30,height:30,borderRadius:8,border:"1.5px solid "+BORDER2,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED}}><Minus size={12}/></button>
        <input type="number" value={value} onChange={e=>onChange(Math.min(max,Math.max(min,Number(e.target.value)||min)))}
          style={{width:68,textAlign:"center",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"5px 0",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
        <button onClick={()=>onChange(Math.min(max,value+step))} className="btn" style={{width:30,height:30,borderRadius:8,border:"1.5px solid "+BORDER2,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED}}><Plus size={12}/></button>
      </div>
    </div>
  );
}

function Tog({checked,onChange,label,sub,color=A}){
  return(
    <button onClick={()=>onChange(!checked)} className="btn" style={{display:"flex",alignItems:"center",gap:11,padding:"10px 13px",borderRadius:11,border:"1.5px solid "+(checked?color:BORDER2),background:checked?color+"08":"#fff",cursor:"pointer",width:"100%",textAlign:"left",transition:"all .13s",boxShadow:checked?"0 0 0 3px "+color+"12":"none"}}>
      <div style={{width:19,height:19,borderRadius:"50%",border:"2px solid "+(checked?color:BORDER2),background:checked?color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .13s"}}>
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
        <div style={{fontSize:10,color:MUTED,fontWeight:600,letterSpacing:"0.03em"}}>{title}</div>
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
          style={{width:"100%",paddingLeft:32,paddingRight:12,paddingTop:10,paddingBottom:10,background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:10,fontSize:14}}/>
      </div>
      {open&&value&&filt.length>0&&(
        <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,right:0,background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:13,zIndex:200,maxHeight:240,overflowY:"auto",boxShadow:"0 16px 50px rgba(0,0,0,.13)"}}>
          {filt.slice(0,10).map(t=>(
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

/* ─── SIDEBAR ───────────────────────────────────────────────────────────── */
const NAV=[
  {id:"dashboard",label:"Dashboard",icon:LayoutDashboard},
  {id:"cotizador",label:"Cotizador Pro",icon:DollarSign,badge:"★"},
  {id:"rutas",label:"Planificador Rutas",icon:Map,badge:"NEW"},
  {id:"proyectos",label:"Proyectos Nac.",icon:Target,badge:"NEW"},
  {id:"facturas",label:"Facturación",icon:FileText},
  {id:"clientes",label:"Clientes",icon:Building2},
  {id:"entregas",label:"Entregas",icon:Package},
];

function Sidebar({view,setView,stats}){
  return(
    <aside className="noprint" style={{width:214,background:"#0a1628",display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,flexShrink:0}}>
      <div style={{padding:"20px 16px",borderBottom:"1px solid #16253d"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:36,height:36,background:"linear-gradient(135deg,"+A+",#fb923c)",borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px "+A+"50",flexShrink:0}}>
            <Truck size={17} color="#fff"/>
          </div>
          <div>
            <div style={{fontFamily:DISPLAY,fontWeight:800,fontSize:16,color:"#fff",letterSpacing:"-0.02em"}}>DMvimiento</div>
            <div style={{fontSize:9,color:"#3d5a7a",letterSpacing:"0.07em",textTransform:"uppercase",marginTop:1}}>Logistics OS</div>
          </div>
        </div>
      </div>
      <nav style={{flex:1,padding:"8px 8px",overflowY:"auto"}}>
        {NAV.map(({id,label,icon:Icon,badge})=>{
          const a=view===id;
          return(
            <button key={id} onClick={()=>setView(id)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 11px",borderRadius:9,marginBottom:1,cursor:"pointer",transition:"all .13s",background:a?"#f97316"+"22":"transparent"}}>
              <Icon size={14} color={a?A:"#3d5a7a"}/>
              <span style={{fontFamily:SANS,fontSize:13,fontWeight:a?700:500,color:a?"#fff":"#3d5a7a",flex:1,textAlign:"left"}}>{label}</span>
              {badge&&<span style={{fontSize:9,fontWeight:800,background:badge==="NEW"?BLUE:A+"30",color:badge==="NEW"?"#fff":A,borderRadius:5,padding:"2px 5px"}}>{badge}</span>}
            </button>
          );
        })}
      </nav>
      <div style={{padding:"12px 14px",borderTop:"1px solid #16253d"}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:GREEN,boxShadow:"0 0 6px "+GREEN}}/>
          <span style={{fontFamily:MONO,fontSize:9,color:"#3d5a7a",letterSpacing:"0.06em",textTransform:"uppercase"}}>Firebase · En vivo</span>
        </div>
        <div style={{fontFamily:MONO,fontSize:9,color:"#3d5a7a",lineHeight:1.8}}>
          {stats.cot} cotizaciones<br/>
          {stats.fac} facturas · {stats.rut} rutas
        </div>
      </div>
    </aside>
  );
}

/* ─── DASHBOARD ─────────────────────────────────────────────────────────── */
function Dashboard({setView,cots,facts,rutas,entregas}){
  const totalFac=facts.reduce((a,f)=>a+(f.total||0),0);
  const pendiente=facts.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+(f.total||0),0);
  const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const chartData=meses.slice(0,new Date().getMonth()+1).map((m,i)=>({
    mes:m,
    fac:facts.filter(f=>{const d=f.createdAt?.seconds;return d&&new Date(d*1000).getMonth()===i;}).reduce((a,f)=>a+(f.total||0),0),
  }));
  const recent=[...cots].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,6);
  const mC={local:GREEN,foraneo:A,masivo:BLUE,ruta:VIOLET};
  const mL={local:"Local",foraneo:"Foráneo",masivo:"Masivo",ruta:"Ruta"};
  return(
    <div style={{flex:1,overflowY:"auto",padding:"30px 34px",background:"#f1f4fb"}}>
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:26}}>
        <div>
          <h1 style={{fontFamily:DISPLAY,fontWeight:800,fontSize:30,color:TEXT,letterSpacing:"-0.03em"}}>Operations Center</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:4}}>{new Date().toLocaleDateString("es-MX",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
        </div>
        <button onClick={()=>setView("cotizador")} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:13,padding:"11px 20px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 6px 20px "+A+"40"}}>
          <DollarSign size={15}/>Nueva Cotización
        </button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:13,marginBottom:22}}>
        <KpiCard icon={DollarSign} color={A} label="Cotizaciones" value={cots.length} onClick={()=>setView("cotizador")}/>
        <KpiCard icon={TrendingUp} color={GREEN} label="Facturado" value={fmtK(totalFac)} onClick={()=>setView("facturas")}/>
        <KpiCard icon={Clock} color={AMBER} label="Por cobrar" value={fmtK(pendiente)} onClick={()=>setView("facturas")}/>
        <KpiCard icon={Map} color={VIOLET} label="Rutas activas" value={rutas.filter(r=>r.status==="En curso").length} sub={rutas.length+" totales"} onClick={()=>setView("rutas")}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:14,marginBottom:14}}>
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(12,24,41,.05)"}}>
          <div style={{padding:"16px 22px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:14}}>Facturación {new Date().getFullYear()}</span>
            <Tag color={GREEN}>{fmtK(facts.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0))} cobrado</Tag>
          </div>
          <div style={{padding:"14px 20px 16px"}}>
            {chartData.length>0&&chartData.some(d=>d.fac>0)
              ?<div style={{display:"flex",alignItems:"flex-end",gap:6,height:130,paddingTop:10}}>
                {chartData.map((d,i)=>{
                  const max=Math.max(...chartData.map(x=>x.fac),1);
                  const h=d.fac>0?Math.max(8,Math.round((d.fac/max)*100)):4;
                  return(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{fontSize:9,color:MUTED,fontFamily:MONO,fontWeight:700,opacity:d.fac>0?1:0}}>{fmtK(d.fac)}</div>
                      <div style={{width:"100%",height:h+"%",background:d.fac>0?"linear-gradient(180deg,"+A+",#fb923c)":BORDER,borderRadius:"4px 4px 0 0",transition:"height .3s",minHeight:4}}/>
                      <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>{d.mes}</div>
                    </div>
                  );
                })}
              </div>
              :<div style={{height:130,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED,fontSize:13}}>Sin datos aún — crea tu primera factura</div>
            }
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[
            {label:"Cotizador Pro",sub:"Local · Foráneo · Masivo",icon:DollarSign,color:A,v:"cotizador"},
            {label:"Planificador Rutas",sub:"Multi-parada + Google Maps",icon:Map,color:VIOLET,v:"rutas"},
            {label:"Facturación",sub:"PDFs · Mensual · Clientes",icon:FileText,color:BLUE,v:"facturas"},
            {label:"Tracking",sub:"Entregas en tiempo real",icon:Package,color:GREEN,v:"entregas"},
          ].map(({label,sub,icon:Icon,color,v})=>(
            <button key={v} onClick={()=>setView(v)} className="btn ch" style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",borderRadius:12,border:"1px solid "+BORDER,background:"#fff",cursor:"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{width:34,height:34,borderRadius:9,background:color+"14",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={14} color={color}/></div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{label}</div><div style={{fontSize:11,color:MUTED}}>{sub}</div></div>
              <ChevronRight size={12} color={MUTED}/>
            </button>
          ))}
        </div>
      </div>

      <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(12,24,41,.05)"}}>
        <div style={{padding:"16px 22px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:14}}>Últimas cotizaciones</span>
          <button onClick={()=>setView("cotizador")} className="btn" style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:A,fontFamily:SANS,fontWeight:700}}><Plus size={12}/>Nueva</button>
        </div>
        {recent.length===0
          ?<div style={{padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin cotizaciones. <button onClick={()=>setView("cotizador")} style={{color:A,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Crear →</button></div>
          :<table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:"1px solid "+BORDER}}>
              {["Folio","Cliente","Modo","Destino","Total","Fecha",""].map(h=><th key={h} style={{padding:"9px 16px",textAlign:"left",fontFamily:SANS,fontSize:10,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {recent.map((q,i)=>(
                <tr key={q.id||i} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
                  <td style={{padding:"11px 16px",fontFamily:MONO,fontSize:10,color:MUTED}}>{q.folio||"—"}</td>
                  <td style={{padding:"11px 16px",fontWeight:700,fontSize:13}}>{q.cliente||"—"}</td>
                  <td style={{padding:"11px 16px"}}><Tag color={mC[q.modo]||A}>{mL[q.modo]||q.modo}</Tag></td>
                  <td style={{padding:"11px 16px",fontSize:12,color:MUTED}}>{q.destino||"—"}</td>
                  <td style={{padding:"11px 16px",fontFamily:MONO,fontSize:13,fontWeight:700}}>{fmt(q.total||0)}</td>
                  <td style={{padding:"11px 16px",fontFamily:MONO,fontSize:10,color:MUTED}}>{q.createdAt?.seconds?new Date(q.createdAt.seconds*1000).toLocaleDateString("es-MX"):"—"}</td>
                  <td style={{padding:"11px 16px"}}><button onClick={()=>printPDF(q)} className="btn" style={{color:MUTED}}><Printer size={12}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}

/* ─── COTIZADOR PRO ─────────────────────────────────────────────────────── */
function Cotizador({onSaved}){
  const [modo,setModo]=useState("foraneo");
  const [step,setStep]=useState("form");
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState(null);
  const showT=(m,t="ok")=>setToast({msg:m,type:t});

  const [cliente,setCliente]=useState("");
  const [contacto,setContacto]=useState("");
  const [notas,setNotas]=useState("");
  const [plazo,setPlazo]=useState(3);

  // Foráneo - multi ciudad
  const [fSearch,setFSearch]=useState("");
  const [fCiudades,setFCiudades]=useState([]); // [{...TAR row, id}]
  const [fVeh,setFVeh]=useState("cam");
  const [fUrg,setFUrg]=useState(false);
  const [fMani,setFMani]=useState(false);
  const [fNumAyud,setFNumAyud]=useState(1);
  const [fRes,setFRes]=useState(false);
  const [fExtra,setFExtra]=useState(0);
  const [fComida,setFComida]=useState(COMIDA);
  const [fHotel,setFHotel]=useState(HOTEL);

  // Local - puntos de envío
  const [lVeh,setLVeh]=useState("cam");
  const [lAyud,setLAyud]=useState(false);
  const [lUrg,setLUrg]=useState(false);
  const [lRes,setLRes]=useState(false);
  const [lPuntos,setLPuntos]=useState([{id:uid(),dir:"",ref:""}]);
  const addLPunto=()=>setLPuntos(p=>[...p,{id:uid(),dir:"",ref:""}]);
  const rmLPunto=id=>setLPuntos(p=>p.filter(x=>x.id!==id));
  const updLPunto=(id,k,v)=>setLPuntos(p=>p.map(x=>x.id===id?{...x,[k]:v}:x));

  // Masivo - multi ciudad
  const [mVeh,setMVeh]=useState("cam");
  const [mMaxDia,setMMaxDia]=useState(20);
  const [mPersonas,setMPersonas]=useState(1);
  const [mAyud,setMAyud]=useState(false);
  const [mUrg,setMUrg]=useState(false);
  const [mComida,setMComida]=useState(COMIDA);
  const [mHotel,setMHotel]=useState(HOTEL);
  const [mCiudades,setMCiudades]=useState([]); // {id,c,km,pdv,dias,paradas,vans,tarifa}
  const [mSearch,setMSearch]=useState("");

  // ── CALC FORÁNEO multi-ciudad ──
  const fVD=VEHK.find(v=>v.k===fVeh);
  const fCrew=(fVD?.crew||1)+fExtra;
  const fMaxKm=fCiudades.length>0?Math.max(...fCiudades.map(c=>c.km)):0;
  const fBaseTotal=fCiudades.reduce((a,c)=>a+(c[fVeh]||0),0);
  const {xC:fXC,xH:fXH,total:fXV,dias:fDias,noches:fNoches}=useMemo(()=>fMaxKm>0?calcViaticos(fMaxKm,fCrew,fComida,fHotel):{xC:0,xH:0,total:0,dias:0,noches:0},[fMaxKm,fCrew,fComida,fHotel]);
  const fXU=fUrg?fBaseTotal*.35:0;
  const fXM=fMani?AYUD*fNumAyud:0;
  const fXR=fRes&&fCiudades.length>0?(LOC[fVeh]?.resguardo||0):0;
  const fSub=fBaseTotal+fXU+fXM+fXR+fXV;
  const fIva=fSub*.16;
  const fTot=fSub+fIva;

  // ── CALC LOCAL ──
  const lD=LOC[lVeh];
  let lBase=lD.normal;
  if(lUrg&&lAyud) lBase=lD.urgente_ay;
  else if(lAyud)  lBase=lD.ayudante;
  else if(lUrg)   lBase=lD.urgente;
  const lPuntosExtra=Math.max(0,lPuntos.filter(p=>p.dir.trim()).length-1);
  const lXP=lPuntosExtra*ADIC;
  const lXR=lRes?(lD.resguardo||0):0;
  const lSub=lBase+lXP+lXR;
  const lIva=lSub*.16;
  const lTot=lSub+lIva;

  // ── CALC MASIVO multi-ciudad ──
  const mTotPDV=mCiudades.reduce((a,c)=>a+c.pdv,0);
  const mTotVans=mCiudades.reduce((a,c)=>a+c.vans,0);
  const mPersonasT=mTotVans*(mPersonas+(mAyud?1:0));
  const mBaseTotal=mCiudades.reduce((a,c)=>a+(c.tarifa||0)*c.vans,0);
  const mXU=mUrg?mBaseTotal*.35:0;
  const mMaxKm=mCiudades.length>0?Math.max(...mCiudades.map(c=>c.km)):0;
  const {xC:mXC,xH:mXH,total:mXV}=useMemo(()=>mMaxKm>0?calcViaticos(mMaxKm,mPersonasT,mComida,mHotel):{xC:0,xH:0,total:0,dias:0,noches:0},[mMaxKm,mPersonasT,mComida,mHotel]);
  const mSub=mBaseTotal+mXU+mXV;
  const mIva=mSub*.16;
  const mTot=mSub+mIva;

  const calcMVans=(pdv,dias,mpd)=>Math.max(1,Math.ceil(pdv/(Math.min(mpd,Math.ceil(pdv/Math.max(dias,1)))*Math.max(dias,1))));
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
  const addMParada=(cid)=>setMCiudades(p=>p.map(c=>c.id===cid?{...c,paradas:[...c.paradas,{id:uid(),dir:"",ref:""}]}:c));
  const updMParada=(cid,pid,k,v)=>setMCiudades(p=>p.map(c=>c.id===cid?{...c,paradas:c.paradas.map(pa=>pa.id===pid?{...pa,[k]:v}:pa)}:c));
  const rmMParada=(cid,pid)=>setMCiudades(p=>p.map(c=>c.id===cid?{...c,paradas:c.paradas.filter(pa=>pa.id!==pid)}:c));
  const rmMCiudad=id=>setMCiudades(p=>p.filter(c=>c.id!==id));

  // recalc vans when maxDia changes
  useEffect(()=>{
    setMCiudades(p=>p.map(c=>({...c,vans:calcMVans(c.pdv,c.dias,mMaxDia),tarifa:c[mVeh]||0})));
  },[mMaxDia,mVeh]);

  const total=modo==="foraneo"?fTot:modo==="local"?lTot:mTot;
  const canQ=modo==="foraneo"?fCiudades.length>0:modo==="masivo"?mCiudades.length>0:true;

  const buildQ=()=>{
    const folio="COT-"+uid();
    const base={cliente,contacto,notas,modo,folio,total,plazo};
    if(modo==="foraneo") return{...base,
      destino:fCiudades.map(c=>c.c).join(", "),
      km:fMaxKm,vehiculoLabel:fVD?.label,
      modoLabel:"FORÁNEO",
      stops:[{city:"Ciudad de México"},...fCiudades.map(c=>({city:c.c,pdv:0}))],
      lines:[
        ...fCiudades.map(c=>({label:"📍 "+c.c+" · "+c.km+"km",value:fmt(c[fVeh]||0)})),
        fCiudades.length>1&&{label:"Total tarifas ("+fCiudades.length+" ciudades)",value:fmt(fBaseTotal)},
        fUrg&&{label:"⚡ Urgente +35%",value:"+"+fmt(fXU),color:ROSE},
        fMani&&{label:"💪 Ayudantes ("+fNumAyud+")",value:"+"+fmt(fXM),color:VIOLET},
        fRes&&{label:"🛡️ Resguardo 1 día",value:"+"+fmt(fXR),color:GREEN},
        fXC>0&&{label:"🍽️ Comidas · "+fCrew+"p × "+fDias+"d",value:"+"+fmt(fXC),color:AMBER},
        fXH>0&&{label:"🏨 Hotel · "+fCrew+"p × "+fNoches+"n",value:"+"+fmt(fXH),color:BLUE},
        {label:"Subtotal sin IVA",value:fmt(fSub)},
        {label:"IVA 16%",value:fmt(fIva),color:MUTED},
        {label:"TOTAL CON IVA",value:fmt(fTot),bold:true,color:A},
      ].filter(Boolean)};
    if(modo==="local") return{...base,destino:"Ciudad de México",vehiculoLabel:VEHK.find(v=>v.k===lVeh)?.label,
      modoLabel:"LOCAL CDMX",
      stops:lPuntos.filter(p=>p.dir.trim()).map(p=>({city:p.dir,pdv:0})),
      lines:[
        {label:VEHK.find(v=>v.k===lVeh)?.label+" · "+(lUrg?"Urgente":"Normal")+(lAyud?" + Ayudante":""),value:fmt(lBase)},
        lPuntosExtra>0&&{label:"📦 Puntos extra ("+lPuntosExtra+")",value:"+"+fmt(lXP),color:BLUE},
        lRes&&{label:"🛡️ Resguardo 1 día",value:"+"+fmt(lXR),color:GREEN},
        {label:"Subtotal sin IVA",value:fmt(lSub)},
        {label:"IVA 16%",value:fmt(lIva),color:MUTED},
        {label:"TOTAL CON IVA",value:fmt(lTot),bold:true,color:A},
      ].filter(Boolean)};
    return{...base,destino:mCiudades.map(c=>c.c).join(", ")||"Masivo",vehiculoLabel:VEHK.find(v=>v.k===mVeh)?.label,
      modoLabel:"DISTRIBUCIÓN MASIVA",
      totalPDV:mTotPDV,
      lines:[
        ...mCiudades.map(c=>({label:"📍 "+c.c+" · "+c.pdv+" PDVs · "+c.vans+" vans",value:fmt((c.tarifa||0)*c.vans)})),
        mUrg&&{label:"⚡ Urgente +35%",value:"+"+fmt(mXU),color:ROSE},
        mXC>0&&{label:"🍽️ Comidas personal",value:"+"+fmt(mXC),color:AMBER},
        mXH>0&&{label:"🏨 Hotel personal",value:"+"+fmt(mXH),color:BLUE},
        {label:"Subtotal sin IVA",value:fmt(mSub)},
        {label:"IVA 16%",value:fmt(mIva),color:MUTED},
        {label:"TOTAL CON IVA",value:fmt(mTot),bold:true,color:A},
      ].filter(Boolean)};
  };

  const handleSave=async()=>{
    setSaving(true);
    try{await addDoc(collection(db,"cotizaciones"),{...buildQ(),createdAt:serverTimestamp()});onSaved&&onSaved();showT("✓ Cotización guardada");}
    catch(e){showT(e.message,"err");}
    setSaving(false);
  };

  // Row component for preview
  const Row=({l,v,c=TEXT,bold})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:(bold?"13":"8")+"px 0",borderBottom:bold?"none":"1px solid "+BORDER}}>
      <span style={{fontSize:bold?14:12,fontWeight:bold?800:400,color:bold?TEXT:MUTED}}>{l}</span>
      <span style={{fontFamily:MONO,fontSize:bold?22:12,fontWeight:700,color:c}}>{v}</span>
    </div>
  );

  return(
    <div style={{flex:1,overflowY:"auto",background:"#ffffff",display:"flex",flexDirection:"column"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}

      {/* STICKY HEADER */}
      <div style={{background:"#ffffff",borderBottom:"1px solid "+BORDER,padding:"18px 34px",position:"sticky",top:0,zIndex:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <h1 style={{fontFamily:DISPLAY,fontWeight:800,fontSize:24,color:TEXT,letterSpacing:"-0.02em"}}>Cotizador Pro</h1>
          <p style={{color:MUTED,fontSize:12,marginTop:2}}>Tarifas 2026 · Viáticos automáticos · PDF profesional</p>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {step==="preview"&&<button onClick={()=>setStep("form")} className="btn" style={{display:"flex",alignItems:"center",gap:6,border:"1.5px solid "+BORDER2,borderRadius:9,padding:"8px 15px",fontSize:13,fontWeight:600,color:MUTED}}><RefreshCw size={12}/>Nueva</button>}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",background:"#fff8f3",borderRadius:20,border:"1px solid "+A+"22"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:GREEN,boxShadow:"0 0 6px "+GREEN}}/>
            <span style={{fontSize:10,fontWeight:700,color:A,fontFamily:MONO,letterSpacing:"0.04em"}}>ACTUALIZACIÓN EN VIVO</span>
          </div>
        </div>
      </div>

      {/* MODO TABS */}
      <div style={{padding:"16px 34px 0",background:"#ffffff"}}>
        <div style={{display:"flex",background:"#f5f7fc",borderRadius:13,padding:3,width:"fit-content",gap:2}}>
          {[{id:"local",label:"📍 Local CDMX",color:GREEN},{id:"foraneo",label:"🚛 Foráneo",color:A},{id:"masivo",label:"📦 Distribución Masiva",color:BLUE}].map(({id,label,color})=>(
            <button key={id} onClick={()=>{setModo(id);setStep("form");}} className="btn"
              style={{padding:"9px 18px",borderRadius:10,background:modo===id?"#ffffff":"transparent",color:modo===id?color:MUTED,fontFamily:SANS,fontSize:13,fontWeight:modo===id?700:500,boxShadow:modo===id?"0 1px 6px rgba(12,24,41,.1)":"none",transition:"all .13s"}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 370px",gap:18,padding:"20px 34px",alignItems:"start"}}>

        {/* ── LEFT: FORMULARIO ── */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* CLIENTE */}
          <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
            <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Información del cliente</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
              <Inp label="Empresa / Cliente *" value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Ej: Walmart México"/>
              <Inp label="Contacto" value={contacto} onChange={e=>setContacto(e.target.value)} placeholder="Nombre del contacto"/>
              <Spin label="Plazo de entrega (días)" value={plazo} onChange={setPlazo} min={1} max={90}/>
            </div>
          </div>

          {/* ══ FORÁNEO ══ */}
          {modo==="foraneo"&&<>
            <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase"}}>Ciudades de destino <span style={{color:ROSE}}>*</span></div>
                {fCiudades.length>0&&<Tag color={A}>{fCiudades.length} ciudad(es) · {fmt(fBaseTotal)}</Tag>}
              </div>
              {/* Lista de ciudades agregadas */}
              {fCiudades.map((c,i)=>(
                <div key={c.id} style={{background:A+"06",border:"1.5px solid "+A+"22",borderRadius:12,marginBottom:10,overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 13px",borderBottom:"1px solid "+A+"15"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:A+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:9,fontWeight:800,color:A}}>{i+1}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:TEXT}}>{c.c}</div>
                      <div style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{c.km.toLocaleString()} km · tarifa: {fmt(c[fVeh]||0)}</div>
                    </div>
                    <button onClick={()=>setFCiudades(p=>p.filter(x=>x.id!==c.id))} className="btn" style={{width:22,height:22,borderRadius:"50%",border:"1px solid "+ROSE+"28",background:ROSE+"08",display:"flex",alignItems:"center",justifyContent:"center",color:ROSE}}><X size={10}/></button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"10px 13px"}}>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Puntos de entrega (PDVs)</div>
                      <input type="number" min="0" value={c.pdv||""} onChange={e=>setFCiudades(p=>p.map(x=>x.id===c.id?{...x,pdv:parseInt(e.target.value)||0}:x))}
                        placeholder="Ej: 17" style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:15,fontWeight:700,color:A}}/>
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Días de entrega en ciudad</div>
                      <input type="number" min="1" value={c.dias||""} onChange={e=>setFCiudades(p=>p.map(x=>x.id===c.id?{...x,dias:parseInt(e.target.value)||1}:x))}
                        placeholder="Ej: 2" style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:15,fontWeight:700,color:BLUE}}/>
                    </div>
                  </div>
                  {c.pdv>0&&c.dias>0&&<div style={{padding:"6px 13px 10px",display:"flex",gap:10}}>
                    <span style={{fontSize:10,color:MUTED}}>📦 {Math.ceil(c.pdv/c.dias)} PDVs/día</span>
                    <span style={{fontSize:10,color:MUTED}}>⏱️ {c.dias} día(s) en {c.c}</span>
                  </div>}
                </div>
              ))}
              {/* Buscador */}
              <div style={{padding:"10px 12px",background:A+"04",border:"1.5px dashed "+A+"30",borderRadius:10}}>
                <div style={{fontSize:10,fontWeight:700,color:A,marginBottom:7,letterSpacing:"0.05em"}}>+ AGREGAR CIUDAD</div>
                <CitySearch value={fSearch} onChange={setFSearch} onSelect={t=>{setFCiudades(p=>[...p,{...t,id:uid()}]);setFSearch("");}} veh={fVeh} exclude={fCiudades.map(c=>c.c)}/>
              </div>
              {fCiudades.length>0&&fCiudades.length<3&&<div style={{marginTop:8,fontSize:11,color:MUTED,fontStyle:"italic"}}>💡 Puedes agregar múltiples ciudades en un mismo viaje</div>}
            </div>

            <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Vehículo</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {VEHK.map(v=>{
                  const a=fVeh===v.k;
                  return(
                    <button key={v.k} onClick={()=>setFVeh(v.k)} className="btn" style={{display:"flex",alignItems:"center",gap:11,padding:"9px 13px",borderRadius:10,border:"1.5px solid "+(a?A:BORDER2),background:a?A+"08":"#fff",cursor:"pointer",transition:"all .13s"}}>
                      <span style={{fontSize:17}}>{v.icon}</span>
                      <div style={{flex:1,textAlign:"left"}}><div style={{fontSize:13,fontWeight:700,color:a?TEXT:MUTED}}>{v.label}</div><div style={{fontSize:11,color:MUTED}}>{v.cap} · {v.crew} persona(s) base</div></div>
                      {fCiudades.length>0&&<span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:a?A:MUTED}}>{fmt(fCiudades.reduce((s,c)=>s+(c[v.k]||0),0))}</span>}
                      {a&&<Check size={12} color={A}/>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13}}>
                <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase"}}>Viáticos del personal</div>
                {fDias>0&&<Tag color={BLUE}>{fDias} días fuera · {fNoches} noches</Tag>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:13}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Comida/persona/día</div>
                  <input type="number" value={fComida} onChange={e=>setFComida(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Hotel/persona/noche</div>
                  <input type="number" value={fHotel} onChange={e=>setFHotel(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"#f8fafd",borderRadius:9,border:"1px solid "+BORDER,marginBottom:13}}>
                <Users size={13} color={BLUE}/>
                <span style={{flex:1,fontSize:12}}>Tripulación base: <strong>{fVD?.crew||1}</strong> persona(s)</span>
                <Spin value={fExtra} onChange={setFExtra} min={0} max={8}/>
                <span style={{fontSize:11,color:MUTED,whiteSpace:"nowrap"}}>extras</span>
              </div>
              {fDias>0&&<div style={{padding:"9px 13px",background:BLUE+"08",borderRadius:9,border:"1px solid "+BLUE+"18"}}>
                <div style={{fontSize:11,color:BLUE,fontWeight:600}}>{fCrew}p × {fDias}d × ${fComida}/comida{fNoches>0?" + "+fNoches+"n × $"+fHotel+"/hotel":""}</div>
                <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:BLUE,marginTop:3}}>Viáticos: {fmt(fXV)}</div>
              </div>}
            </div>

            <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Servicios adicionales</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                <Tog checked={fUrg} onChange={setFUrg} label="⚡ Viaje urgente (+35%)" sub={fUrg?"+"+fmt(fXU):"Sin cargo adicional"} color={ROSE}/>
                <Tog checked={fMani} onChange={setFMani} label="💪 Maniobras / Ayudantes en destino" sub={"$"+AYUD.toLocaleString()+" por ayudante"} color={VIOLET}/>
                {fMani&&<div style={{paddingLeft:30,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:12,color:MUTED}}>Cantidad:</span>
                  <Spin value={fNumAyud} onChange={setFNumAyud} min={1} max={10}/>
                  <span style={{fontFamily:MONO,fontSize:12,color:VIOLET,fontWeight:700}}>{fmt(fXM)}</span>
                </div>}
                <Tog checked={fRes} onChange={setFRes} label={"🛡️ Resguardo de materiales (1 día) — "+fmt(LOC[fVeh]?.resguardo||0)} sub="" color={GREEN}/>
              </div>
            </div>
          </>}

          {/* ══ LOCAL ══ */}
          {modo==="local"&&<>
            <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Vehículo</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:16}}>
                {VEHK.map(v=>{
                  const a=lVeh===v.k; const tar=LOC[v.k];
                  return(
                    <button key={v.k} onClick={()=>setLVeh(v.k)} className="btn" style={{display:"flex",alignItems:"center",gap:9,padding:"10px 12px",borderRadius:11,border:"1.5px solid "+(a?A:BORDER2),background:a?A+"08":"#fff",cursor:"pointer",transition:"all .13s"}}>
                      <span style={{fontSize:20}}>{v.icon}</span>
                      <div style={{flex:1,textAlign:"left"}}>
                        <div style={{fontSize:12,fontWeight:700,color:a?TEXT:MUTED}}>{v.label}</div>
                        <div style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:a?A:MUTED}}>{fmt(tar?.normal||0)}</div>
                      </div>
                      {a&&<Check size={12} color={A}/>}
                    </button>
                  );
                })}
              </div>
              {/* TABLA DE TARIFAS LOCALES */}
              <div style={{background:"#f8fafd",borderRadius:11,padding:"12px 14px",border:"1px solid "+BORDER,marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:10}}>Tarifas {VEHK.find(v=>v.k===lVeh)?.label}</div>
                {[
                  ["Viaje normal",LOC[lVeh]?.normal],
                  ["Con ayudante",LOC[lVeh]?.ayudante],
                  ["Urgente",LOC[lVeh]?.urgente],
                  ["Urgente + ayudante",LOC[lVeh]?.urgente_ay],
                  ["Resguardo 1 día",LOC[lVeh]?.resguardo],
                  LOC[lVeh]?.renta_dia&&["Renta/día sin chofer",LOC[lVeh]?.renta_dia],
                  LOC[lVeh]?.renta_chofer&&["Renta/día con chofer",LOC[lVeh]?.renta_chofer],
                  LOC[lVeh]?.renta_mes&&["Renta/mes sin chofer",LOC[lVeh]?.renta_mes],
                ].filter(Boolean).map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+BORDER,fontSize:12}}>
                    <span style={{color:MUTED}}>{l}</span>
                    <span style={{fontFamily:MONO,fontWeight:700,color:TEXT}}>{fmt(v)}</span>
                  </div>
                ))}
                <div style={{fontSize:10,color:MUTED,marginTop:8,fontWeight:600}}>+ Entrega adicional en ruta: {fmt(ADIC)}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                <Tog checked={lUrg} onChange={setLUrg} label="⚡ Viaje urgente" sub={"Tarifa: "+fmt(LOC[lVeh]?.urgente)} color={ROSE}/>
                <Tog checked={lAyud} onChange={setLAyud} label="💪 Con ayudante / maniobras" sub={"Tarifa: "+fmt(LOC[lVeh]?.ayudante)} color={VIOLET}/>
                <Tog checked={lRes} onChange={setLRes} label={"🛡️ Resguardo 1 día — "+fmt(LOC[lVeh]?.resguardo||0)} sub="" color={GREEN}/>
              </div>
            </div>

            {/* PUNTOS DE ENVÍO LOCAL */}
            <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:13}}>
                <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase"}}>Puntos de envío</div>
                <Tag color={BLUE}>{lPuntos.filter(p=>p.dir.trim()).length} punto(s) · {lPuntosExtra>0?"+"+fmt(lXP)+" extra":fmt(0)+" extras"}</Tag>
              </div>
              <div style={{fontSize:11,color:MUTED,marginBottom:11}}>El primer punto está incluido en la tarifa. Cada punto adicional: <strong style={{color:A}}>{fmt(ADIC)}</strong></div>
              {lPuntos.map((p,i)=>(
                <div key={p.id} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:i===0?BLUE+"14":A+"14",border:"2px solid "+(i===0?BLUE:A),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:i===0?BLUE:A,flexShrink:0}}>{i+1}</div>
                  <input value={p.dir} onChange={e=>updLPunto(p.id,"dir",e.target.value)} placeholder={i===0?"Punto de recogida / origen":"Dirección de entrega"}
                    style={{flex:1,background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"8px 12px",fontSize:13}}/>
                  <input value={p.ref} onChange={e=>updLPunto(p.id,"ref",e.target.value)} placeholder="Ref" style={{width:90,background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"8px 10px",fontSize:12}}/>
                  {i>0&&<button onClick={()=>rmLPunto(p.id)} className="btn" style={{width:26,height:26,borderRadius:"50%",border:"1px solid "+ROSE+"28",background:ROSE+"08",display:"flex",alignItems:"center",justifyContent:"center",color:ROSE,flexShrink:0}}><X size={11}/></button>}
                </div>
              ))}
              <button onClick={addLPunto} className="btn" style={{display:"flex",alignItems:"center",gap:7,padding:"8px 14px",borderRadius:9,border:"1.5px dashed "+A+"40",background:A+"06",color:A,fontSize:13,fontWeight:600,cursor:"pointer",marginTop:4}}>
                <Plus size={13}/>Agregar punto de entrega
              </button>
            </div>
          </>}

          {/* ══ MASIVO ══ */}
          {modo==="masivo"&&<>
            {/* Config flota */}
            <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Configuración de flota</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:11,marginBottom:13}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Vehículo</div>
                  <select value={mVeh} onChange={e=>setMVeh(e.target.value)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 11px",fontSize:13}}>
                    {VEHK.map(v=><option key={v.k} value={v.k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <Spin label="Máx entregas/van/día" value={mMaxDia} onChange={setMMaxDia} min={1} max={300}/>
                <Spin label="Personas por van" value={mPersonas} onChange={setMPersonas} min={1} max={5}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:11}}>
                <Tog checked={mAyud} onChange={setMAyud} label="💪 Ayudante/van" color={VIOLET}/>
                <Tog checked={mUrg} onChange={setMUrg} label="⚡ Urgente +35%" color={ROSE}/>
              </div>
              {mCiudades.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                <InfoBox icon={Truck} color={A} title="Vans totales" value={mTotVans} sub={mCiudades.length+" ciudades"}/>
                <InfoBox icon={Package} color={BLUE} title="PDVs totales" value={mTotPDV.toLocaleString()} sub="entregas"/>
                <InfoBox icon={Users} color={VIOLET} title="Personal total" value={mPersonasT}/>
              </div>}
            </div>

            {/* Multi-ciudad */}
            <div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase"}}>Ciudades de distribución <span style={{color:ROSE}}>*</span></div>
                {mCiudades.length>0&&<Tag color={A}>{mCiudades.length} ciudad(es) · {mTotVans} vans · {fmt(mBaseTotal)}</Tag>}
              </div>

              {mCiudades.map((c,ci)=>(
                <div key={c.id} style={{border:"1.5px solid "+A+"22",borderRadius:12,marginBottom:12,overflow:"hidden"}}>
                  {/* Header ciudad */}
                  <div style={{display:"flex",alignItems:"center",gap:9,padding:"11px 14px",background:A+"06",borderBottom:"1px solid "+A+"15"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:A,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0}}>{ci+1}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:TEXT}}>{c.c}</div>
                      <div style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{c.km.toLocaleString()} km · tarifa: {fmt(c.tarifa||0)}/van</div>
                    </div>
                    <Tag color={VIOLET}>{c.vans} van(s)</Tag>
                    <button onClick={()=>rmMCiudad(c.id)} className="btn" style={{width:24,height:24,borderRadius:"50%",border:"1px solid "+ROSE+"28",background:ROSE+"08",display:"flex",alignItems:"center",justifyContent:"center",color:ROSE}}><X size={11}/></button>
                  </div>
                  {/* PDVs + días */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"12px 14px",borderBottom:"1px solid "+BORDER}}>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>PDVs en esta ciudad</div>
                      <input type="number" min="1" value={c.pdv} onChange={e=>updMCiudad(c.id,"pdv",Math.max(1,parseInt(e.target.value)||1))}
                        style={{width:"100%",background:"#fff",border:"1.5px solid "+A+"40",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:16,fontWeight:700,color:A}}/>
                      <div style={{fontSize:10,color:MUTED,marginTop:4}}>≈ {Math.ceil(c.pdv/c.dias)} PDVs/día · {c.vans} van(s)</div>
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>Días de operación</div>
                      <input type="number" min="1" max="90" value={c.dias} onChange={e=>updMCiudad(c.id,"dias",Math.max(1,parseInt(e.target.value)||1))}
                        style={{width:"100%",background:"#fff",border:"1.5px solid "+BLUE+"40",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:16,fontWeight:700,color:BLUE}}/>
                    </div>
                  </div>
                  {/* Paradas */}
                  <div style={{padding:"11px 14px"}}>
                    <div style={{fontSize:9,fontWeight:800,color:MUTED,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Puntos de entrega en {c.c} <span style={{color:MUTED,fontWeight:400}}>({c.paradas.length} punto(s))</span></div>
                    {c.paradas.map((p,pi)=>(
                      <div key={p.id} style={{display:"flex",gap:7,marginBottom:7,alignItems:"center"}}>
                        <div style={{width:20,height:20,borderRadius:"50%",background:pi===0?BLUE+"14":VIOLET+"14",border:"2px solid "+(pi===0?BLUE:VIOLET),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:pi===0?BLUE:VIOLET,flexShrink:0}}>{pi+1}</div>
                        <input value={p.dir} onChange={e=>updMParada(c.id,p.id,"dir",e.target.value)}
                          placeholder={pi===0?"Dirección de origen en "+c.c:"Dirección de entrega"}
                          style={{flex:1,background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"7px 10px",fontSize:12}}/>
                        <input value={p.ref} onChange={e=>updMParada(c.id,p.id,"ref",e.target.value)}
                          placeholder="Ref / Zona" style={{width:80,background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"7px 9px",fontSize:11}}/>
                        {pi>0&&<button onClick={()=>rmMParada(c.id,p.id)} className="btn" style={{width:22,height:22,borderRadius:"50%",border:"1px solid "+ROSE+"28",background:ROSE+"08",display:"flex",alignItems:"center",justifyContent:"center",color:ROSE,flexShrink:0}}><X size={9}/></button>}
                      </div>
                    ))}
                    <button onClick={()=>addMParada(c.id)} className="btn" style={{display:"flex",alignItems:"center",gap:6,padding:"6px 11px",borderRadius:7,border:"1.5px dashed "+VIOLET+"40",background:VIOLET+"05",color:VIOLET,fontSize:11,fontWeight:600,cursor:"pointer",marginTop:2}}>
                      <Plus size={11}/>Agregar punto en {c.c}
                    </button>
                  </div>
                </div>
              ))}

              {/* Buscador ciudad */}
              <div style={{padding:"10px 12px",background:A+"04",border:"1.5px dashed "+A+"30",borderRadius:10}}>
                <div style={{fontSize:10,fontWeight:700,color:A,marginBottom:7,letterSpacing:"0.05em"}}>+ AGREGAR CIUDAD</div>
                <CitySearch value={mSearch} onChange={setMSearch} onSelect={addMCiudad} veh={mVeh} exclude={mCiudades.map(c=>c.c)}/>
              </div>
            </div>

            {/* Viáticos */}
            {mMaxKm>0&&<div style={{background:"#ffffff",border:"1px solid "+BORDER,borderRadius:15,padding:20,boxShadow:"0 1px 4px rgba(12,24,41,.04)"}}>
              <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:13}}>Viáticos del personal</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Comida/persona/día</div>
                  <input type="number" value={mComida} onChange={e=>setMComida(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Hotel/persona/noche</div>
                  <input type="number" value={mHotel} onChange={e=>setMHotel(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
                </div>
              </div>
            </div>}
          </>}

          <Txt label="Notas / Condiciones especiales" value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Tipo de mercancía, instrucciones especiales…"/>

          <button onClick={()=>{if(canQ)setStep("preview");}} className="btn" style={{padding:"14px 20px",borderRadius:13,background:canQ?"linear-gradient(135deg,"+A+",#fb923c)":"#e8eef6",color:canQ?"#fff":MUTED,fontFamily:DISPLAY,fontWeight:700,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",gap:9,boxShadow:canQ?"0 6px 24px "+A+"38":"none",cursor:canQ?"pointer":"not-allowed",transition:"all .15s"}}>
            <DollarSign size={19}/>{canQ?"Generar cotización":"Completa los campos requeridos"}
          </button>
        </div>

        {/* ── RIGHT: PREVIEW EN VIVO ── */}
        <div style={{position:"sticky",top:78,display:"flex",flexDirection:"column",gap:13}}>
          <div style={{background:"#ffffff",border:"1.5px solid "+BORDER,borderRadius:16,overflow:"hidden",boxShadow:"0 4px 20px rgba(12,24,41,.07)"}}>
            <div style={{borderTop:"3px solid "+A,padding:"18px 20px 14px",borderBottom:"1px solid "+BORDER}}>
              <div style={{fontFamily:MONO,fontSize:9,color:A,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>● COTIZACIÓN EN VIVO</div>
              <div style={{fontFamily:MONO,fontWeight:700,fontSize:38,color:TEXT,letterSpacing:"-0.03em",lineHeight:1}}>{fmt(total)}</div>
              <div style={{fontSize:11,color:MUTED,marginTop:5,fontWeight:500}}>MXN con IVA incluido · {modo==="foraneo"?(fCiudades.length>0?fCiudades.map(c=>c.c).join(", "):"Sin destino"):modo==="local"?"CDMX":"Masivo"}</div>
            </div>
            <div style={{padding:"14px 18px"}}>
              {modo==="foraneo"&&<>
                {fCiudades.map(c=><Row key={c.id} l={"📍 "+c.c+(c.pdv?" · "+c.pdv+" PDVs":"")} v={fmt(c[fVeh]||0)}/>)}
                {fCiudades.length>1&&<Row l={"Total "+fCiudades.length+" ciudades"} v={fmt(fBaseTotal)}/>}
                {fUrg&&<Row l="⚡ Urgente +35%" v={"+"+fmt(fXU)} c={ROSE}/>}
                {fMani&&<Row l={"💪 Ayudantes ("+fNumAyud+")"} v={"+"+fmt(fXM)} c={VIOLET}/>}
                {fRes&&<Row l="🛡️ Resguardo" v={"+"+fmt(fXR)} c={GREEN}/>}
                {fXC>0&&<Row l="🍽️ Comidas" v={"+"+fmt(fXC)} c={AMBER}/>}
                {fXH>0&&<Row l="🏨 Hotel" v={"+"+fmt(fXH)} c={BLUE}/>}
                <Row l="Subtotal" v={fmt(fSub)}/>
                <Row l="IVA 16%" v={fmt(fIva)} c={MUTED}/>
                <Row l="TOTAL" v={fmt(fTot)} c={A} bold/>
                {fCiudades.length>0&&<div style={{marginTop:11,paddingTop:11,borderTop:"1px solid "+BORDER}}>
                  <div style={{fontSize:10,fontWeight:800,color:MUTED,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:7}}>Comparar vehículos</div>
                  {VEHK.map(v=>(
                    <button key={v.k} onClick={()=>setFVeh(v.k)} className="btn fr" style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 7px",marginBottom:2,borderRadius:7,background:fVeh===v.k?A+"0e":"transparent"}}>
                      <span style={{fontSize:11,color:fVeh===v.k?TEXT:MUTED}}>{v.icon} {v.label}</span>
                      <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:fVeh===v.k?A:MUTED}}>{fmt(fCiudades.reduce((a,c)=>a+(c[v.k]||0),0))}</span>
                    </button>
                  ))}
                </div>}
              </>}
              {modo==="local"&&<>
                <Row l={VEHK.find(v=>v.k===lVeh)?.label+" · "+(lUrg?"Urgente":"Normal")+(lAyud?" + Ayud.":"")} v={fmt(lBase)}/>
                {lPuntosExtra>0&&<Row l={"📦 Puntos extra ("+lPuntosExtra+")"} v={"+"+fmt(lXP)} c={BLUE}/>}
                {lRes&&<Row l="🛡️ Resguardo" v={"+"+fmt(lXR)} c={GREEN}/>}
                <Row l="Subtotal" v={fmt(lSub)}/>
                <Row l="IVA 16%" v={fmt(lIva)} c={MUTED}/>
                <Row l="TOTAL" v={fmt(lTot)} c={A} bold/>
              </>}
              {modo==="masivo"&&<>
                {mCiudades.map(c=><Row key={c.id} l={"📍 "+c.c+" · "+c.pdv+" PDVs"} v={fmt((c.tarifa||0)*c.vans)+" ("+c.vans+"v)"}/>)}
                {mUrg&&<Row l="⚡ Urgente +35%" v={"+"+fmt(mXU)} c={ROSE}/>}
                {mXC>0&&<Row l="🍽️ Comidas personal" v={"+"+fmt(mXC)} c={AMBER}/>}
                {mXH>0&&<Row l="🏨 Hospedaje" v={"+"+fmt(mXH)} c={BLUE}/>}
                <Row l="Subtotal" v={fmt(mSub)}/>
                <Row l="IVA 16%" v={fmt(mIva)} c={MUTED}/>
                <Row l="TOTAL" v={fmt(mTot)} c={A} bold/>
                {mTotVans>0&&<div style={{marginTop:9,padding:"7px 11px",background:VIOLET+"0e",borderRadius:8,border:"1px solid "+VIOLET+"24",fontSize:11,color:VIOLET}}>🚛 {mTotVans} vans · {mTotPDV.toLocaleString()} PDVs · {mCiudades.length} ciudades</div>}
              </>}
            </div>
          </div>

          {step==="preview"&&(
            <div style={{background:"#ffffff",border:"1.5px solid "+A+"28",borderRadius:14,padding:16,display:"flex",flexDirection:"column",gap:9}}>
              <div style={{fontSize:11,fontWeight:800,color:A,textTransform:"uppercase",letterSpacing:"0.07em"}}>Cotización lista ✓</div>
              <button onClick={handleSave} disabled={saving} className="btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:10,padding:"11px 0",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"30",opacity:saving?.7:1}}>
                {saving?<><div style={{width:13,height:13,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}} className="spin"/>Guardando…</>:<><Send size={14}/>Guardar en Firebase</>}
              </button>
              <button onClick={()=>printPDF(buildQ())} className="btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,border:"1.5px solid "+BORDER2,borderRadius:10,padding:"11px 0",fontFamily:SANS,fontWeight:700,fontSize:14,color:TEXT}}>
                <Printer size={14}/>Exportar PDF
              </button>
              {fCiudades.length>0&&modo==="foraneo"&&(
                <a href={mapsURL(["Ciudad de México",...fCiudades.map(c=>c.c)])} target="_blank" rel="noopener noreferrer"
                  style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:BLUE+"0e",border:"1.5px solid "+BLUE+"28",borderRadius:10,padding:"11px 0",textDecoration:"none",fontFamily:SANS,fontWeight:700,fontSize:14,color:BLUE}}>
                  <Globe size={14}/>Abrir en Google Maps
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── PLANIFICADOR RUTAS ─────────────────────────────────────────────────── */
function PlanificadorRutas(){
  const [nombre,setNombre]=useState("");
  const [cliente,setCliente]=useState("");
  const [veh,setVeh]=useState("cam");
  const [stops,setStops]=useState([{id:uid(),city:"Ciudad de México",pdv:0,km:0,base:0,isOrigin:true}]);
  const [search,setSearch]=useState("");
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
        <div><h1 style={{fontFamily:DISPLAY,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Planificador de Rutas</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>Multi-parada · Flota automática · Google Maps</p></div>
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
              <span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:14}}>Paradas ({stops.length})</span>
              <div style={{display:"flex",gap:7}}><Tag color={VIOLET}>{stops.filter(s=>!s.isOrigin).length} destinos</Tag><Tag color={A}>{totalPDV.toLocaleString()} PDVs</Tag></div>
            </div>
            <div style={{padding:14,display:"flex",flexDirection:"column",gap:8}}>
              {stops.map((s,i)=>(
                <div key={s.id} style={{display:"flex",alignItems:"flex-start",gap:9,background:s.isOrigin?"#f8fafd":"#fff",border:"1.5px solid "+(s.isOrigin?BORDER2:A+"24"),borderRadius:11,padding:"11px 13px",transition:"all .13s"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",paddingTop:5}}>
                    <div style={{width:11,height:11,borderRadius:"50%",background:s.isOrigin?BLUE:A,flexShrink:0}}/>
                    {i<stops.length-1&&<div style={{width:2,height:18,background:BORDER2,marginTop:3}}/>}
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
                            style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"7px 10px",fontFamily:MONO,fontSize:15,fontWeight:700,color:A}}/>
                        </div>
                        <div>
                          <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Zona / Referencia</div>
                          <input type="text" value={s.addr||""} onChange={e=>updStop(s.id,"addr",e.target.value)} placeholder="Opcional"
                            style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"7px 10px",fontSize:13}}/>
                        </div>
                      </div>
                    )}
                  </div>
                  {!s.isOrigin&&(
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      <button onClick={()=>mvUp(i)} className="btn" style={{border:"1px solid "+BORDER2,borderRadius:6,padding:"3px 5px",color:MUTED}}><ChevronUp size={10}/></button>
                      <button onClick={()=>mvDn(i)} className="btn" style={{border:"1px solid "+BORDER2,borderRadius:6,padding:"3px 5px",color:MUTED}}><ChevronDown size={10}/></button>
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
                <button key={v.k} onClick={()=>setVeh(v.k)} className="btn" style={{flex:1,minWidth:90,padding:"9px 6px",borderRadius:10,border:"2px solid "+(veh===v.k?A:BORDER2),background:veh===v.k?A+"08":"#fff",cursor:"pointer",textAlign:"center"}}>
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
                <input type="number" value={comida} onChange={e=>setComida(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Hotel/persona/noche</div>
                <input type="number" value={hotel} onChange={e=>setHotel(Number(e.target.value)||0)} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:15,fontWeight:700}}/>
              </div>
            </div>
            {diasF>0&&<div style={{padding:"9px 12px",background:BLUE+"08",borderRadius:9,border:"1px solid "+BLUE+"18"}}>
              <div style={{fontSize:11,color:BLUE,fontWeight:600}}>{crew}p × {diasF}d × ${comida}/comida{noches>0?" + "+noches+"n × $"+hotel+"/hotel":""}</div>
              <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:BLUE,marginTop:3}}>Total viáticos: {fmt(xViat)}</div>
            </div>}
          </div>

          <div style={{display:"flex",gap:9}}>
            <button onClick={handleSave} disabled={saving} className="btn" style={{flex:2,padding:"13px 0",borderRadius:12,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",fontFamily:DISPLAY,fontWeight:700,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 5px 20px "+A+"35",opacity:saving?.7:1}}>
              {saving?<><div style={{width:15,height:15,border:"2px solid #fff",borderTop:"2px solid transparent",borderRadius:"50%"}} className="spin"/>Guardando…</>:<><Map size={17}/>Guardar Ruta</>}
            </button>
            <button onClick={()=>{const q={folio:"RUT-"+uid(),cliente,modo:"ruta",modoLabel:"RUTA MULTI-PARADA",destino:stops.filter(s=>!s.isOrigin).map(s=>s.city).join(" → "),vehiculoLabel:vehD?.label,stops,lines:[{label:"Tarifa transporte",value:fmt(tarifaT)},urg&&{label:"⚡ Urgente",value:"+"+fmt(xU),color:ROSE},xViat>0&&{label:"Viáticos",value:"+"+fmt(xViat),color:AMBER},{label:"Subtotal",value:fmt(sub)},{label:"IVA 16%",value:fmt(iva),color:MUTED},{label:"TOTAL",value:fmt(total),bold:true,color:A}].filter(Boolean),flota:{vans,dias:diasOp,capDia},totalPDV,plazo,total};printPDF(q);}} className="btn"
              style={{flex:1,padding:"13px 0",borderRadius:12,border:"1.5px solid "+BORDER2,background:"#fff",fontFamily:SANS,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7,color:TEXT}}>
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
            <div style={{padding:"13px 16px",borderBottom:"1px solid "+BORDER}}><span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:13}}>Rutas guardadas ({rutas.length})</span></div>
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
          {viewR.mapURL&&<a href={viewR.mapURL} target="_blank" rel="noopener noreferrer" className="btn" style={{flex:1,padding:"10px 0",borderRadius:10,background:BLUE+"0e",border:"1.5px solid "+BLUE+"28",color:BLUE,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:SANS,fontWeight:700,fontSize:13}}><Globe size={14}/>Google Maps</a>}
          <button onClick={async()=>{await updateDoc(doc(db,"rutas",viewR.id),{status:viewR.status==="En curso"?"Completada":"En curso"});setViewR(null);}} className="btn"
            style={{flex:1,padding:"10px 0",borderRadius:10,background:"linear-gradient(135deg,"+A+",#fb923c)",border:"none",cursor:"pointer",fontFamily:SANS,fontWeight:700,fontSize:13,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            {viewR.status==="En curso"?<><CheckCircle size={14}/>Completar</>:<><Navigation size={14}/>Iniciar</>}
          </button>
        </div>
      </Modal>}
    </div>
  );
}

/* ─── FACTURACIÓN ────────────────────────────────────────────────────────── */
function Facturas(){
  const [items,setItems]=useState([]);const[load,setLoad]=useState(true);
  const[modal,setModal]=useState(false);const[toast,setToast]=useState(null);
  const[tab,setTab]=useState("registros");
  const[mesF,setMesF]=useState("todos");
  const MESES_LIST=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const MESES_ALL=["todos",...MESES_LIST];
  const PLANES=["Enterprise","Premium","Standard","Básico","Sin plan"];
  const ANIO=new Date().getFullYear();
  const emptyForm={mesOp:MESES_LIST[new Date().getMonth()],anio:ANIO,plan:"Standard",empresa:"",solicitante:"",servicio:"",subtotal:"",iva:true,status:"Pendiente",notas:""};
  const[form,setForm]=useState(emptyForm);
  const sf=k=>e=>setForm(f=>({...f,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  useEffect(()=>onSnapshot(collection(db,"facturas"),s=>{setItems(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));setLoad(false);}),[]);
  const save=async()=>{
    if(!form.empresa||!form.subtotal){showT("Empresa y subtotal requeridos","err");return;}
    const sub=parseFloat(form.subtotal)||0;const xIva=form.iva?sub*.16:0;const total=sub+xIva;
    try{await addDoc(collection(db,"facturas"),{...form,subtotal:sub,ivaAmt:xIva,total,folio:"FAC-"+uid(),createdAt:serverTimestamp()});
    setModal(false);setForm(emptyForm);showT("✓ Registro creado");}catch(e){showT(e.message,"err");}
  };
  const del=async id=>{if(!confirm("¿Eliminar?"))return;await deleteDoc(doc(db,"facturas",id));showT("Eliminado");};
  const upd=async(id,status)=>updateDoc(doc(db,"facturas",id),{status});
  const filt=mesF==="todos"?items:items.filter(f=>f.mesOp===mesF);
  const totSub=filt.reduce((a,f)=>a+(f.subtotal||f.monto||0),0);
  const totIva=filt.reduce((a,f)=>a+(f.ivaAmt||f.iva||0),0);
  const totTotal=filt.reduce((a,f)=>a+(f.total||0),0);
  const cobrado=filt.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0);
  const pendiente=filt.filter(f=>f.status==="Pendiente").reduce((a,f)=>a+(f.total||0),0);
  const porMes=MESES_LIST.map(m=>{const its=items.filter(f=>f.mesOp===m);return{mes:m,facturado:its.reduce((a,f)=>a+(f.total||0),0),cobrado:its.filter(f=>f.status==="Pagada").reduce((a,f)=>a+(f.total||0),0),n:its.length};});
  const maxVal=Math.max(...porMes.map(m=>m.facturado),1);
  const proyAnual=porMes.reduce((a,m)=>a+m.facturado,0);
  const avgMes=porMes.filter(m=>m.facturado>0).reduce((a,m,_,arr)=>a+m.facturado/arr.length,0)||0;
  const mesActual=MESES_LIST[new Date().getMonth()];
  const sc={Pendiente:AMBER,Pagada:GREEN,Vencida:ROSE};
  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div><h1 style={{fontFamily:DISPLAY,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Facturación & Finanzas</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>Control por mes · Proyecciones · Análisis financiero</p></div>
        <button onClick={()=>setModal(true)} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"30"}}><Plus size={14}/>Nuevo registro</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
        <KpiCard icon={BarChart2} color={BLUE} label="Total facturado" value={fmtK(totTotal)} sub={filt.length+" registros"}/>
        <KpiCard icon={CheckCircle} color={GREEN} label="Cobrado" value={fmtK(cobrado)} sub={totTotal>0?Math.round(cobrado/totTotal*100)+"%":"0%"}/>
        <KpiCard icon={Clock} color={AMBER} label="Por cobrar" value={fmtK(pendiente)}/>
        <KpiCard icon={TrendingUp} color={VIOLET} label="Proy. anual" value={fmtK(proyAnual)} sub={"Prom. "+fmtK(avgMes)+"/mes"}/>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:16}}>
        {[["registros","📋 Registros"],["proyecciones","📈 Proyecciones"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className="btn" style={{padding:"7px 18px",borderRadius:10,border:"1.5px solid "+(tab===k?A:BORDER2),background:tab===k?A+"10":"#fff",color:tab===k?A:MUTED,fontWeight:tab===k?700:500,fontSize:13,cursor:"pointer"}}>{l}</button>
        ))}
      </div>
      {tab==="registros"&&<>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
          {MESES_ALL.map(m=><button key={m} onClick={()=>setMesF(m)} className="btn" style={{padding:"5px 13px",borderRadius:8,border:"1.5px solid "+(mesF===m?A:BORDER2),background:mesF===m?A+"10":"#fff",color:mesF===m?A:MUTED,fontSize:12,fontWeight:mesF===m?700:500,cursor:"pointer"}}>{m==="todos"?"Todos":m}</button>)}
        </div>
        {mesF!=="todos"&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
          {[[MUTED,"Subtotal",fmt(totSub)],[MUTED,"IVA 16%",fmt(totIva)],[A,"Total c/IVA",fmt(totTotal)]].map(([c,l,v])=>(
            <div key={l} style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"12px 16px"}}>
              <div style={{fontSize:10,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
              <div style={{fontFamily:MONO,fontSize:20,fontWeight:800,color:c,marginTop:4}}>{v}</div>
            </div>
          ))}
        </div>}
        {load?<div style={{padding:40,textAlign:"center",color:MUTED}}>Cargando…</div>
        :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
          {filt.length===0?<div style={{padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin registros. <button onClick={()=>setModal(true)} style={{color:A,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Crear →</button></div>
          :<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
            <thead><tr style={{borderBottom:"1px solid "+BORDER}}>
              {["Folio","Mes","Empresa","Solicitante","Plan","Servicio","Subtotal","IVA","Total","Estado",""].map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:9,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>{filt.map((f,i)=>(
              <tr key={f.id||i} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:10,color:MUTED,whiteSpace:"nowrap"}}>{f.folio||"—"}</td>
                <td style={{padding:"10px 12px"}}><span style={{background:A+"12",color:A,borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700}}>{f.mesOp||"—"} {f.anio||""}</span></td>
                <td style={{padding:"10px 12px",fontWeight:700,fontSize:13}}>{f.empresa||f.cliente||"—"}</td>
                <td style={{padding:"10px 12px",fontSize:12,color:MUTED}}>{f.solicitante||"—"}</td>
                <td style={{padding:"10px 12px"}}><span style={{background:VIOLET+"12",color:VIOLET,borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:700}}>{f.plan||"—"}</span></td>
                <td style={{padding:"10px 12px",fontSize:12,color:MUTED,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.servicio||"—"}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:12}}>{fmt(f.subtotal||f.monto||0)}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:12,color:MUTED}}>{fmt(f.ivaAmt||f.iva||0)}</td>
                <td style={{padding:"10px 12px",fontFamily:MONO,fontSize:13,fontWeight:800}}>{fmt(f.total||0)}</td>
                <td style={{padding:"10px 12px"}}>
                  <select value={f.status||"Pendiente"} onChange={e=>upd(f.id,e.target.value)} style={{background:"transparent",border:"1.5px solid "+(sc[f.status]||MUTED)+"28",borderRadius:8,padding:"3px 7px",color:sc[f.status]||MUTED,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    {["Pendiente","Pagada","Vencida"].map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{padding:"10px 12px",display:"flex",gap:5,alignItems:"center"}}>
                  <button onClick={()=>printPDF({folio:f.folio||"FAC",cliente:f.empresa||f.cliente,modo:"factura",modoLabel:"FACTURA",destino:f.servicio||"Servicio",vehiculoLabel:"",lines:[{label:"Subtotal",value:fmt(f.subtotal||f.monto||0)},{label:"IVA 16%",value:fmt(f.ivaAmt||f.iva||0),color:MUTED},{label:"TOTAL",value:fmt(f.total||0),bold:true,color:A}].filter(Boolean),notas:f.notas||"",total:f.total||0})} className="btn" style={{color:BLUE}}><Printer size={12}/></button>
                  <button onClick={()=>del(f.id)} className="btn" style={{color:MUTED}}><Trash2 size={12}/></button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>}
        </div>}
      </>}
      {tab==="proyecciones"&&<>
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:24,marginBottom:16}}>
          <div style={{fontFamily:DISPLAY,fontWeight:700,fontSize:16,marginBottom:18}}>Facturación mensual {ANIO}</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:6,height:160}}>
            {porMes.map(m=>(
              <div key={m.mes} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{fontSize:9,fontFamily:MONO,color:m.facturado>0?A:MUTED,fontWeight:700}}>{m.facturado>0?fmtK(m.facturado):""}</div>
                <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:110,position:"relative"}}>
                  <div style={{width:"100%",background:m.mes===mesActual?A:A+"40",borderRadius:"4px 4px 0 0",height:m.facturado>0?Math.max(6,Math.round(m.facturado/maxVal*100))+"%":"6px",minHeight:4}}/>
                  {m.cobrado>0&&<div style={{position:"absolute",bottom:0,width:"100%",background:GREEN,borderRadius:"4px 4px 0 0",height:Math.max(3,Math.round(m.cobrado/maxVal*100))+"%",opacity:.7}}/>}
                </div>
                <div style={{fontSize:9,fontWeight:m.mes===mesActual?800:500,color:m.mes===mesActual?A:MUTED}}>{m.mes}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:14,marginTop:12}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:A}}/><span style={{fontSize:11,color:MUTED}}>Facturado</span></div>
            <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:GREEN}}/><span style={{fontSize:11,color:MUTED}}>Cobrado</span></div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {porMes.filter(m=>m.facturado>0).map(m=>(
            <div key={m.mes} style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:12,padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:15}}>{m.mes} {ANIO}</span>
                <span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{m.n} reg.</span>
              </div>
              <div style={{fontFamily:MONO,fontSize:20,fontWeight:800,color:A}}>{fmt(m.facturado)}</div>
              <div style={{display:"flex",gap:10,marginTop:7}}>
                <div><div style={{fontSize:9,color:MUTED,textTransform:"uppercase",fontWeight:700}}>Cobrado</div><div style={{fontFamily:MONO,fontSize:12,color:GREEN,fontWeight:700}}>{fmt(m.cobrado)}</div></div>
                <div><div style={{fontSize:9,color:MUTED,textTransform:"uppercase",fontWeight:700}}>Pendiente</div><div style={{fontFamily:MONO,fontSize:12,color:AMBER,fontWeight:700}}>{fmt(m.facturado-m.cobrado)}</div></div>
              </div>
            </div>
          ))}
          {porMes.filter(m=>m.facturado>0).length===0&&<div style={{gridColumn:"1/-1",padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin datos aún. Agrega registros para ver proyecciones.</div>}
        </div>
      </>}
      {modal&&<Modal title="Nuevo registro de facturación" onClose={()=>setModal(false)} icon={FileText} iconColor={BLUE} wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Mes de operación *</div>
            <select value={form.mesOp} onChange={sf("mesOp")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {MESES_LIST.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Año</div>
            <select value={form.anio} onChange={sf("anio")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {[ANIO-1,ANIO,ANIO+1].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Inp label="Plan al que se carga" value={form.plan} onChange={sf("plan")} placeholder="Ej: Plan Básico MTY, Cuenta 4521..."/>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Estado</div>
            <select value={form.status} onChange={sf("status")} style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontSize:13}}>
              {["Pendiente","Pagada","Vencida"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Inp label="Empresa a facturar *" value={form.empresa} onChange={sf("empresa")} placeholder="Nombre de la empresa"/>
          <Inp label="Quien solicita el servicio" value={form.solicitante} onChange={sf("solicitante")} placeholder="Nombre del contacto"/>
          <div style={{gridColumn:"1/-1"}}><Inp label="Servicio / Descripción" value={form.servicio} onChange={sf("servicio")} placeholder="Ej: Distribución masiva Monterrey — Ruta Norte"/></div>
          <Inp label="Subtotal (sin IVA) *" type="number" value={form.subtotal} onChange={sf("subtotal")} placeholder="0.00"/>
          <div style={{display:"flex",alignItems:"center"}}><Tog checked={form.iva} onChange={v=>setForm(f=>({...f,iva:v}))} label="Incluir IVA 16%" sub={form.subtotal?"IVA: "+fmt((parseFloat(form.subtotal)||0)*.16):""} color={BLUE}/></div>
          <div style={{gridColumn:"1/-1",padding:"14px 16px",background:"#fff8f3",borderRadius:12,border:"1.5px solid "+A+"24"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[["Subtotal",fmt(parseFloat(form.subtotal)||0),MUTED],["IVA 16%",fmt(form.iva?(parseFloat(form.subtotal)||0)*.16:0),MUTED],["Total",fmt((parseFloat(form.subtotal)||0)+(form.iva?(parseFloat(form.subtotal)||0)*.16:0)),A]].map(([l,v,c])=>(
                <div key={l}><div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:MONO,fontSize:18,fontWeight:800,color:c,marginTop:3}}>{v}</div></div>
              ))}
            </div>
          </div>
          <div style={{gridColumn:"1/-1"}}><Txt label="Notas" value={form.notas} onChange={sf("notas")} placeholder="Observaciones, número de OC, folio interno..."/></div>
          <button onClick={save} className="btn" style={{gridColumn:"1/-1",background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISPLAY,fontWeight:700,fontSize:16,cursor:"pointer"}}>Guardar registro</button>
        </div>
      </Modal>}
    </div>
  );
}

/* ─── CLIENTES ──────────────────────────────────────────────────────────── */
function Clientes(){
  const [items,setItems]=useState([]);const[load,setLoad]=useState(true);
  const[modal,setModal]=useState(false);const[toast,setToast]=useState(null);
  const[q,setQ]=useState("");
  const[form,setForm]=useState({nombre:"",contacto:"",email:"",tel:"",rfc:"",plan:"Standard",notas:""});
  const showT=(m,t="ok")=>setToast({msg:m,type:t});
  useEffect(()=>onSnapshot(collection(db,"cuentas"),s=>{setItems(s.docs.map(d=>({id:d.id,...d.data()})));setLoad(false);}),[]);
  const save=async()=>{if(!form.nombre){showT("Nombre requerido","err");return;}try{await addDoc(collection(db,"cuentas"),{...form,createdAt:serverTimestamp()});setModal(false);setForm({nombre:"",contacto:"",email:"",tel:"",rfc:"",plan:"Standard",notas:""});showT("✓ Cliente creado");}catch(e){showT(e.message,"err");}};
  const del=async id=>{if(!confirm("¿Eliminar?"))return;await deleteDoc(doc(db,"cuentas",id));showT("Eliminado");};
  const filt=items.filter(c=>c.nombre?.toLowerCase().includes(q.toLowerCase())||c.contacto?.toLowerCase().includes(q.toLowerCase()));
  const pc={Enterprise:A,Premium:VIOLET,Standard:BLUE,Básico:MUTED};
  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div><h1 style={{fontFamily:DISPLAY,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Clientes</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>{items.length} cuentas activas</p></div>
        <button onClick={()=>setModal(true)} className="btn" style={{display:"flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"10px 18px",fontFamily:SANS,fontWeight:700,fontSize:14,boxShadow:"0 4px 16px "+A+"30"}}><Plus size={14}/>Nuevo cliente</button>
      </div>
      <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:11,padding:"9px 14px",display:"flex",alignItems:"center",gap:9,marginBottom:13}}><Search size={13} color={MUTED}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente…" style={{background:"none",border:"none",fontSize:13,flex:1}}/></div>
      {load?<div style={{padding:40,textAlign:"center",color:MUTED}}>Cargando…</div>
      :<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:15,overflow:"hidden"}}>
        {filt.length===0?<div style={{padding:40,textAlign:"center",color:MUTED,fontSize:13}}>Sin clientes. <button onClick={()=>setModal(true)} style={{color:A,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Agregar →</button></div>
        :<table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{borderBottom:"1px solid "+BORDER}}>{["Empresa","Plan","Contacto","Email / Tel","RFC",""].map(h=><th key={h} style={{padding:"9px 16px",textAlign:"left",fontFamily:SANS,fontSize:10,color:MUTED,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{filt.map((c,i)=>(
            <tr key={c.id||i} className="fr" style={{borderBottom:"1px solid "+BORDER}}>
              <td style={{padding:"12px 16px",fontWeight:700,fontSize:13}}>{c.nombre}</td>
              <td style={{padding:"12px 16px"}}><Tag color={pc[c.plan]||MUTED}>{c.plan}</Tag></td>
              <td style={{padding:"12px 16px",fontSize:12,color:MUTED}}>{c.contacto||"—"}</td>
              <td style={{padding:"12px 16px",fontSize:12,color:MUTED}}>{[c.email,c.tel].filter(Boolean).join(" · ")||"—"}</td>
              <td style={{padding:"12px 16px",fontFamily:MONO,fontSize:11,color:MUTED}}>{c.rfc||"—"}</td>
              <td style={{padding:"12px 16px"}}><button onClick={()=>del(c.id)} className="btn" style={{color:MUTED}}><Trash2 size={12}/></button></td>
            </tr>
          ))}</tbody>
        </table>}
      </div>}
      {modal&&<Modal title="Nuevo cliente" onClose={()=>setModal(false)} icon={Building2} iconColor={BLUE}>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <Inp label="Empresa *" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
            <Inp label="Contacto" value={form.contacto} onChange={e=>setForm({...form,contacto:e.target.value})}/>
            <Inp label="Teléfono" value={form.tel} onChange={e=>setForm({...form,tel:e.target.value})}/>
            <Inp label="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
            <Inp label="RFC" value={form.rfc} onChange={e=>setForm({...form,rfc:e.target.value})}/>
          </div>
          <div><div style={{fontSize:10,fontWeight:800,color:MUTED,marginBottom:7,letterSpacing:"0.07em",textTransform:"uppercase"}}>Plan</div>
          <div style={{display:"flex",gap:7}}>{["Básico","Standard","Premium","Enterprise"].map(p=>(
            <button key={p} onClick={()=>setForm({...form,plan:p})} className="btn" style={{flex:1,padding:"8px 0",borderRadius:9,border:"2px solid "+(form.plan===p?(pc[p]||A):BORDER2),background:form.plan===p?(pc[p]||A)+"0e":"#fff",color:form.plan===p?(pc[p]||A):MUTED,cursor:"pointer",fontSize:12,fontWeight:form.plan===p?700:500}}>{p}</button>
          ))}</div></div>
          <Txt label="Notas" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})}/>
          <button onClick={save} className="btn" style={{background:"linear-gradient(135deg,"+A+",#fb923c)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISPLAY,fontWeight:700,fontSize:16}}>Crear cliente</button>
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
  const [diasTotal,setDiasTotal]=useState(5);
  const [ciudades,setCiudades]=useState([]);
  const [dragOver,setDragOver]=useState(false);
  const [loading,setLoading]=useState(false);
  const fileRef=useRef(null);
  const [addC,setAddC]=useState("");
  const [addE,setAddE]=useState("");
  const [addP,setAddP]=useState("");
  const [addD,setAddD]=useState("");
  const [xlsxLoaded,setXlsxLoaded]=useState(false);

  useEffect(()=>{
    if(window.XLSX){setXlsxLoaded(true);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload=()=>setXlsxLoaded(true);
    s.onerror=()=>showT("No se pudo cargar lector Excel","err");
    document.head.appendChild(s);
  },[]);

  useEffect(()=>onSnapshot(collection(db,"proyectos"),s=>{
    setProyectos(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  }),[]);

  const calcCiudad=(pdv,dias,mpd)=>{
    const d=Math.max(1,dias);const m=Math.max(1,mpd);
    const vans=Math.max(1,Math.ceil(pdv/(m*d)));
    const capDia=Math.ceil(pdv/d);
    return{vans,capDia};
  };

  useEffect(()=>{
    setCiudades(p=>p.map(c=>{const{vans,capDia}=calcCiudad(c.pdv,c.dias,maxPDia);return{...c,vans,capDia};}));
  },[maxPDia]);

  const processRows=(rows)=>{
    const header=rows[0].map(h=>String(h).trim().toLowerCase());
    const ci=header.findIndex(h=>h.includes("ciudad")||h.includes("city")||h.includes("municipio"));
    const st=header.findIndex(h=>h.includes("estado")||h.includes("state")||h.includes("entidad"));
    const pd=header.findIndex(h=>h.includes("pdv")||h.includes("punto")||h.includes("entrega")||h.includes("qty")||h.includes("cantidad")||h.includes("tienda"));
    const di=header.findIndex(h=>h.includes("dia")||h.includes("day"));
    if(ci===-1&&pd===-1){showT("No se detectaron columnas Ciudad o PDVs en el archivo","err");return;}
    const grouped={};
    rows.slice(1).forEach(r=>{
      const ciudad=String(r[ci>=0?ci:0]||"").trim();
      const estado=String(r[st>=0?st:1]||"").trim();
      const pdv=Math.abs(parseInt(r[pd>=0?pd:2])||0);
      const dias=di>=0?Math.max(1,parseInt(r[di])||diasTotal):diasTotal;
      if(!ciudad||pdv===0) return;
      const key=ciudad.toLowerCase()+"|"+estado.toLowerCase();
      if(grouped[key]) grouped[key].pdv+=pdv;
      else grouped[key]={id:uid(),ciudad,estado,pdv,dias};
    });
    const arr=Object.values(grouped).map(c=>{const{vans,capDia}=calcCiudad(c.pdv,c.dias,maxPDia);return{...c,vans,capDia};});
    if(arr.length===0){showT("No se encontraron filas válidas en el archivo","err");return;}
    setCiudades(arr);
    showT("✓ "+arr.length+" ciudades · "+arr.reduce((a,c)=>a+c.pdv,0).toLocaleString()+" PDVs importados");
  };

  const parseFile=async(file)=>{
    setLoading(true);
    try{
      const name=file.name.toLowerCase();
      if(name.endsWith(".csv")){
        const text=await file.text();
        const rows=text.split(/\r?\n/).filter(r=>r.trim()).map(r=>r.split(/[,;|\t]/));
        if(rows.length<2){showT("CSV vacío","err");setLoading(false);return;}
        processRows(rows);
      } else if(name.endsWith(".xlsx")||name.endsWith(".xls")){
        if(!window.XLSX){showT("Lector Excel cargando, intenta en 3 segundos","err");setLoading(false);return;}
        const buf=await file.arrayBuffer();
        const wb=window.XLSX.read(buf,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=window.XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        if(rows.length<2){showT("Excel vacío","err");setLoading(false);return;}
        processRows(rows);
      } else {
        showT("Formato no soportado. Usa .csv .xlsx .xls","err");
      }
    }catch(e){showT("Error: "+e.message,"err");}
    setLoading(false);
  };

  const onDrop=e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f) parseFile(f);};

  const addCiudad=()=>{
    if(!addC.trim()||!addP){showT("Ciudad y PDVs requeridos","err");return;}
    const pdv=parseInt(addP)||0;const dias=parseInt(addD)||diasTotal;
    const{vans,capDia}=calcCiudad(pdv,dias,maxPDia);
    setCiudades(p=>[...p,{id:uid(),ciudad:addC.trim(),estado:addE.trim(),pdv,dias,vans,capDia}]);
    setAddC("");setAddE("");setAddP("");setAddD("");
  };

  const updCiudad=(id,k,v)=>setCiudades(p=>p.map(c=>{
    if(c.id!==id) return c;
    const upd={...c,[k]:Math.max(1,parseInt(v)||1)};
    const{vans,capDia}=calcCiudad(upd.pdv,upd.dias,maxPDia);
    return{...upd,vans,capDia};
  }));

  const rmCiudad=id=>setCiudades(p=>p.filter(c=>c.id!==id));

  const totPDV=ciudades.reduce((a,c)=>a+c.pdv,0);
  const totVans=ciudades.reduce((a,c)=>a+c.vans,0);
  const totDias=ciudades.length>0?Math.max(...ciudades.map(c=>c.dias)):0;
  const porEstado={};
  [...ciudades].sort((a,b)=>(a.estado+a.ciudad).localeCompare(b.estado+b.ciudad)).forEach(c=>{
    const e=c.estado||"Sin estado";if(!porEstado[e]) porEstado[e]=[];porEstado[e].push(c);
  });

  const saveProyecto=async()=>{
    if(!nombre||ciudades.length===0){showT("Nombre y ciudades requeridos","err");return;}
    try{
      await addDoc(collection(db,"proyectos"),{nombre,cliente,ciudades,totPDV,totVans,maxPDia,diasTotal,createdAt:serverTimestamp(),status:"Activo"});
      showT("✓ Proyecto guardado");setTab("lista");
    }catch(e){showT(e.message,"err");}
  };

  const delProyecto=async id=>{if(!confirm("¿Eliminar?"))return;await deleteDoc(doc(db,"proyectos",id));showT("Eliminado");};

  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f1f4fb"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div className="au" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div>
          <h1 style={{fontFamily:DISPLAY,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Planificador Nacional</h1>
          <p style={{color:MUTED,fontSize:13,marginTop:3}}>Distribución simultánea · Importar Excel/CSV · Optimizador de flota</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {tab==="nuevo"&&ciudades.length>0&&nombre&&<button onClick={saveProyecto} className="btn" style={{display:"flex",alignItems:"center",gap:7,background:"linear-gradient(135deg,"+GREEN+",#059669)",color:"#fff",borderRadius:11,padding:"9px 16px",fontWeight:700,fontSize:13,boxShadow:"0 4px 14px "+GREEN+"30"}}>
            <Check size={13}/>Guardar proyecto
          </button>}
          <button onClick={()=>setTab(tab==="nuevo"?"lista":"nuevo")} className="btn" style={{display:"flex",alignItems:"center",gap:7,background:tab==="lista"?A+"10":"#fff",border:"1.5px solid "+(tab==="lista"?A:BORDER2),borderRadius:11,padding:"9px 16px",fontWeight:700,fontSize:13,color:tab==="lista"?A:TEXT}}>
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
                  <div><div style={{fontFamily:DISPLAY,fontWeight:700,fontSize:15}}>{p.nombre}</div>{p.cliente&&<div style={{fontSize:12,color:MUTED}}>{p.cliente}</div>}</div>
                  <button onClick={()=>delProyecto(p.id)} className="btn" style={{color:MUTED}}><Trash2 size={13}/></button>
                </div>
                <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[[A,"PDVs",(p.totPDV||0).toLocaleString()],[VIOLET,"Vans",p.totVans||0],[BLUE,"Ciudades",p.ciudades?.length||0]].map(([c,l,v])=>(
                    <div key={l}><div style={{fontSize:9,color:MUTED,fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:MONO,fontSize:17,fontWeight:800,color:c,marginTop:2}}>{v}</div></div>
                  ))}
                </div>
                {p.ciudades?.length>0&&<div style={{padding:"0 16px 14px"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {p.ciudades.slice(0,8).map(c=><span key={c.id} style={{background:VIOLET+"10",color:VIOLET,borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:600}}>{c.ciudad}</span>)}
                    {p.ciudades.length>8&&<span style={{fontSize:10,color:MUTED}}>+{p.ciudades.length-8} más</span>}
                  </div>
                </div>}
              </div>
            ))}
          </div>
        }
      </>}

      {tab==="nuevo"&&<>
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:13,padding:"16px 20px",marginBottom:16,display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:12}}>
          <Inp label="Nombre del proyecto *" value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej: Campaña Nacional Mar 2026"/>
          <Inp label="Cliente" value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Empresa"/>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Máx PDVs/van/día</div>
            <input type="number" min="1" value={maxPDia} onChange={e=>setMaxPDia(Math.max(1,parseInt(e.target.value)||1))}
              style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:16,fontWeight:700,color:A}}/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Días por defecto</div>
            <input type="number" min="1" value={diasTotal} onChange={e=>setDiasTotal(Math.max(1,parseInt(e.target.value)||1))}
              style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:9,padding:"9px 12px",fontFamily:MONO,fontSize:16,fontWeight:700,color:BLUE}}/>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:16,alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"13px 18px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:14}}>📂 Importar Excel / CSV</span>
                <div style={{display:"flex",gap:6}}>
                  <Tag color={GREEN}>.xlsx</Tag><Tag color={BLUE}>.xls</Tag><Tag color={MUTED}>.csv</Tag>
                  {!xlsxLoaded&&<Tag color={AMBER}>Preparando lector…</Tag>}
                </div>
              </div>
              <div style={{padding:16}}>
                <div
                  onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                  onDragLeave={()=>setDragOver(false)}
                  onDrop={onDrop}
                  onClick={()=>fileRef.current?.click()}
                  style={{border:"2px dashed "+(dragOver?A:BORDER2),borderRadius:12,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:dragOver?A+"06":"#fafbfd",transition:"all .15s"}}>
                  {loading
                    ?<><div style={{width:28,height:28,border:"3px solid "+A,borderTop:"3px solid transparent",borderRadius:"50%",margin:"0 auto 10px",animation:"spin 1s linear infinite"}}/><div style={{fontWeight:700,color:A}}>Procesando…</div></>
                    :<><Upload size={28} color={dragOver?A:MUTED} style={{margin:"0 auto 10px"}}/><div style={{fontWeight:700,fontSize:14,color:dragOver?A:TEXT}}>Arrastra tu archivo aquí</div><div style={{fontSize:12,color:MUTED,marginTop:4}}>o haz clic · .xlsx .xls .csv</div></>
                  }
                </div>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f) parseFile(f);e.target.value="";}}/>
                {ciudades.length>0&&<div style={{marginTop:10,padding:"9px 14px",background:GREEN+"08",borderRadius:9,border:"1px solid "+GREEN+"25",fontSize:12,color:GREEN,fontWeight:700}}>
                  ✓ {ciudades.length} ciudades · {totPDV.toLocaleString()} PDVs · {totVans} vans
                </div>}
                <div style={{marginTop:12,background:"#f8fafd",borderRadius:10,padding:"12px 14px",border:"1px solid "+BORDER}}>
                  <div style={{fontSize:10,fontWeight:800,color:MUTED,textTransform:"uppercase",marginBottom:8}}>Formato esperado:</div>
                  <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
                    <thead><tr style={{background:VIOLET+"10"}}>
                      {["Ciudad","Estado","PDVs","Dias"].map(h=><th key={h} style={{padding:"4px 10px",textAlign:"left",fontWeight:700,color:VIOLET,borderBottom:"1px solid "+BORDER}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {[["Monterrey","Nuevo León","384","3"],["Guadalajara","Jalisco","251","2"],["Mérida","Yucatán","128","2"],["Cancún","Q. Roo","97","1"]].map((r,i)=>(
                        <tr key={i}>{r.map((v,j)=><td key={j} style={{padding:"3px 10px",fontFamily:MONO,color:j===2?A:j===3?BLUE:TEXT}}>{v}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{fontSize:10,color:MUTED,marginTop:8}}>💡 También acepta: Municipio, Entidad, Cantidad, Tiendas, Puntos</div>
                </div>
              </div>
            </div>

            <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"13px 18px",borderBottom:"1px solid "+BORDER}}><span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:14}}>➕ Agregar ciudad manualmente</span></div>
              <div style={{padding:14,display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:9,alignItems:"end"}}>
                <div><div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>Ciudad *</div>
                  <input value={addC} onChange={e=>setAddC(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCiudad()} placeholder="Ej: Monterrey"
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"8px 11px",fontSize:13}}/>
                </div>
                <div><div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>Estado</div>
                  <input value={addE} onChange={e=>setAddE(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCiudad()} placeholder="NL"
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+BORDER2,borderRadius:8,padding:"8px 11px",fontSize:13}}/>
                </div>
                <div><div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>PDVs *</div>
                  <input type="number" value={addP} onChange={e=>setAddP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCiudad()} placeholder="384"
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+A+"40",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:14,fontWeight:700,color:A}}/>
                </div>
                <div><div style={{fontSize:9,fontWeight:700,color:MUTED,marginBottom:4,textTransform:"uppercase"}}>Días</div>
                  <input type="number" value={addD} onChange={e=>setAddD(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCiudad()} placeholder={String(diasTotal)}
                    style={{width:"100%",background:"#fff",border:"1.5px solid "+BLUE+"40",borderRadius:8,padding:"8px 11px",fontFamily:MONO,fontSize:14,fontWeight:700,color:BLUE}}/>
                </div>
                <button onClick={addCiudad} className="btn" style={{background:A,color:"#fff",borderRadius:9,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}><Plus size={15}/></button>
              </div>
            </div>

            {ciudades.length>0&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"13px 18px",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:DISPLAY,fontWeight:700,fontSize:14}}>📋 Distribución por ciudad</span>
                <div style={{display:"flex",gap:7}}>
                  <Tag color={A}>{totPDV.toLocaleString()} PDVs</Tag><Tag color={VIOLET}>{totVans} vans</Tag><Tag color={BLUE}>{Object.keys(porEstado).length} estados</Tag>
                  <button onClick={()=>setCiudades([])} className="btn" style={{padding:"2px 8px",borderRadius:6,border:"1px solid "+ROSE+"30",color:ROSE,fontSize:11}}>Limpiar</button>
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

          <div style={{position:"sticky",top:20,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflow:"hidden"}}>
              <div style={{borderTop:"3px solid "+VIOLET,padding:"16px 18px 12px"}}>
                <div style={{fontFamily:MONO,fontSize:9,color:VIOLET,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>● RESUMEN</div>
                <div style={{fontFamily:MONO,fontWeight:800,fontSize:36,color:TEXT,lineHeight:1}}>{totPDV.toLocaleString()}</div>
                <div style={{fontSize:11,color:MUTED,marginTop:4}}>PDVs en {ciudades.length} ciudad(es)</div>
              </div>
              <div style={{padding:"12px 18px",borderTop:"1px solid "+BORDER,display:"flex",flexDirection:"column",gap:4}}>
                <Row l="🏙️ Ciudades" v={ciudades.length}/><Row l="🗺️ Estados" v={Object.keys(porEstado).length}/>
                <Row l="🚛 Vans simultáneas" v={totVans} c={VIOLET}/>
                <Row l="📦 Máx PDVs/van/día" v={maxPDia}/>
                <Row l="⏱️ Días máx" v={totDias||"—"} c={BLUE}/>
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
              ?<button onClick={saveProyecto} className="btn" style={{background:"linear-gradient(135deg,"+GREEN+",#059669)",color:"#fff",borderRadius:12,padding:"13px 0",fontFamily:DISPLAY,fontWeight:700,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 16px "+GREEN+"30"}}><Check size={15}/>Guardar proyecto</button>
              :ciudades.length>0&&<div style={{padding:"10px 14px",background:AMBER+"10",borderRadius:10,border:"1px solid "+AMBER+"30",fontSize:12,color:AMBER,fontWeight:600}}>⚠️ Escribe un nombre para guardar</div>
            }
          </div>
        </div>
      </>}
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
        <div><h1 style={{fontFamily:DISPLAY,fontWeight:800,fontSize:28,color:TEXT,letterSpacing:"-0.03em"}}>Entregas</h1><p style={{color:MUTED,fontSize:13,marginTop:3}}>{items.length} registradas · {items.filter(e=>e.status==="Entregado").length} completadas</p></div>
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
        <div style={{fontFamily:DISPLAY,fontWeight:700,fontSize:14,marginBottom:14}}>Registrar entrega</div>
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

/* ─── ROOT ──────────────────────────────────────────────────────────────── */
export default function App(){
  const [view,setView]=useState("dashboard");
  const [cots,setCots]=useState([]);
  const [facts,setFacts]=useState([]);
  const [rutas,setRutas]=useState([]);
  const [entregas,setEntregas]=useState([]);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"cotizaciones"),s=>setCots(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2=onSnapshot(collection(db,"facturas"),s=>setFacts(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3=onSnapshot(collection(db,"rutas"),s=>setRutas(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u4=onSnapshot(collection(db,"entregas"),s=>setEntregas(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();u3();u4();};
  },[]);

  const VIEWS={
    dashboard:<Dashboard setView={setView} cots={cots} facts={facts} rutas={rutas} entregas={entregas}/>,
    cotizador:<Cotizador onSaved={()=>setView("dashboard")}/>,
    rutas:<PlanificadorRutas/>,
    proyectos:<PlanificadorNacional/>,
    facturas:<Facturas/>,
    clientes:<Clientes/>,
    entregas:<Entregas/>,
  };

  return(
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",minHeight:"100vh",background:"#f1f4fb",color:TEXT,fontFamily:SANS}}>
        <Sidebar view={view} setView={setView} stats={{cot:cots.length,fac:facts.length,rut:rutas.length}}/>
        <main style={{flex:1,overflowY:"auto",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
          {VIEWS[view]||VIEWS.dashboard}
        </main>
      </div>
    </>
  );
}
