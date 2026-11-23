/* DMOV · RESPALDO DIARIO (solo lectura)
   Copia TODAS las colecciones raíz de Firestore, más la bitácora de eventos de
   servicios, a SISTEMA DMOV/backups/AAAA-MM-DD/. No escribe nada en producción.
   Conserva los últimos 30 respaldos.

   Requiere SISTEMA DMOV/serviceAccount.json (ignorado por git; nunca al repo).
   Programado con launchd: com.dmov.daily-maintenance, 21:30.
   Manual:  node scripts/respaldo-diario.mjs */
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SA = join(ROOT, "serviceAccount.json");
const DESTINO = join(ROOT, "backups");
const marca = () => new Date().toLocaleString("sv");

if(!existsSync(SA)){
  console.error(`[${marca()}] RESPALDO NO EJECUTADO: falta ${SA}`);
  process.exit(1);
}
try {
  initializeApp({ credential: cert(JSON.parse(readFileSync(SA, "utf8"))), storageBucket: "salesflow-crm-13c4a.firebasestorage.app" });
  const db = getFirestore();
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const hoy = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;   // fecha local, no UTC
  const dir = join(DESTINO, hoy);
  mkdirSync(dir, { recursive: true });
  const limpio = v => v && typeof v.toDate === "function" ? v.toDate().toISOString()
    : Array.isArray(v) ? v.map(limpio)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpio(x)])) : v;

  const resumen = {}; let total = 0;
  for(const col of await db.listCollections()){
    const snap = await col.get();
    writeFileSync(join(dir, col.id + ".json"), JSON.stringify(snap.docs.map(x => ({ id: x.id, ...limpio(x.data()) })), null, 1));
    resumen[col.id] = snap.size; total += snap.size;
  }
  /* Subcolección: bitácora de eventos de cada servicio (se guarda con la ruta completa). */
  const ev = await db.collectionGroup("eventos").get();
  writeFileSync(join(dir, "_eventos.json"), JSON.stringify(ev.docs.map(x => ({ ruta: x.ref.path, ...limpio(x.data()) })), null, 1));
  resumen["*/eventos"] = ev.size; total += ev.size;
  /* Paradas (con la evidencia de cada entrega) y costos de cada servicio. */
  for(const sub of ["paradas", "costos"]){
    const g = await db.collectionGroup(sub).get();
    writeFileSync(join(dir, `_${sub}.json`), JSON.stringify(g.docs.map(x => ({ ruta: x.ref.path, ...limpio(x.data()) })), null, 1));
    resumen["*/" + sub] = g.size; total += g.size;
  }
  /* Fotos de evidencia y de inicio de día: se acumulan en backups/fotos/ (nunca cambian ni se borran);
     cada noche solo se bajan las nuevas. */
  let fotosNuevas = 0, fotosTotal = 0;
  for(const prefijo of ["evidencias/", "jornadas/"]){
    const [archivos] = await getStorage().bucket().getFiles({ prefix: prefijo });
    for(const f of archivos){
      fotosTotal++;
      const local = join(DESTINO, "fotos", f.name);
      if(existsSync(local)) continue;
      mkdirSync(dirname(local), { recursive: true });
      await f.download({ destination: local });
      fotosNuevas++;
    }
  }
  resumen["fotos (acumuladas)"] = fotosTotal;

  writeFileSync(join(dir, "_resumen.json"), JSON.stringify({ fecha: hoy, generado: marca(), totalDocs: total, colecciones: resumen }, null, 2));
  console.log(`[${marca()}] Respaldo ${hoy}: ${total} documentos en ${Object.keys(resumen).length} colecciones · fotos: ${fotosNuevas} nuevas, ${fotosTotal} en total`);

  const dias = readdirSync(DESTINO).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  while(dias.length > 30){ const viejo = dias.shift(); rmSync(join(DESTINO, viejo), { recursive: true, force: true }); console.log(`  retención: se borró el respaldo ${viejo}`); }
  process.exit(0);
} catch(e){
  console.error(`[${marca()}] RESPALDO FALLIDO: ${e.message}`);
  process.exit(1);
}
