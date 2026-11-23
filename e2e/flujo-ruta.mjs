/* Prueba de punta a punta del arranque: Firebase de prueba (emuladores de Firestore, Storage, Auth y
   Functions con el código real de functions/). Recorre el día completo como lo harán Ilse y el chofer,
   usando el MISMO código de la hoja Asignar ruta (asignarRutaFlujo.js) y las mismas llamadas que la app
   del chofer (ChoferWeb.jsx). No toca producción: proyecto "demo-…".
   Correr: npm run test:e2e */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp as iniciarCliente, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getStorage, connectStorageEmulator, ref, uploadBytes } from "firebase/storage";
import { guardarLugares, datosServicio, crearServicioRuta, terminarAsignacion } from "../asignarRutaFlujo.js";
import { correoDeChofer } from "../lugares.ts";

const PROYECTO = "demo-dmov-e2e", BUCKET = PROYECTO + ".appspot.com";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const JPG = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
const fechaCDMX = (ms = Date.now()) => new Date(ms - 6 * 3600000).toISOString().slice(0, 10);
const MIN = 60000;

let adm, apps = [];
function cliente(nombre){
  const app = iniciarCliente({ projectId: PROYECTO, apiKey: "clave-de-prueba", storageBucket: BUCKET, authDomain: "localhost" }, nombre);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8088);
  const fns = getFunctions(app, "us-central1"); connectFunctionsEmulator(fns, "127.0.0.1", 5011);
  const st = getStorage(app); connectStorageEmulator(st, "127.0.0.1", 9198);
  const llamar = (n, d = {}) => httpsCallable(fns, n)(d).then(r => r.data);
  return { app, auth, db, st, llamar };
}

const TEL = "5512345678", CLAVE_CHOFER = "clave-chofer-123";
/* Tres lugares a ~800 m uno del otro (CDMX): una recolección y dos entregas. */
const BODEGA = { lat: 19.4000, lng: -99.1500 }, TIENDA_A = { lat: 19.4072, lng: -99.1500 }, TIENDA_B = { lat: 19.4144, lng: -99.1500 };
let oficina, ilse, chofer, servicioId, paradas, seguimientoToken;

before(async () => {
  adm = admin.initializeApp({ projectId: PROYECTO });
  const db = admin.firestore(), auth = admin.auth();
  await auth.createUser({ uid: "admin1", email: "admin@example.invalid", password: "clave-admin-123" });
  await auth.createUser({ uid: "ilse1", email: "ilse@example.invalid", password: "clave-ilse-123" });
  await db.doc("dmov_usuarios/admin1").set({ uid: "admin1", rol: "admin", activo: true, nombre: "Admin Prueba", email: "admin@example.invalid" });
  await db.doc("dmov_usuarios/ilse1").set({ uid: "ilse1", rol: "operaciones", activo: true, nombre: "Ilse Prueba", email: "ilse@example.invalid" });
  await db.doc("choferes/ch1").set({ nombre: "Chofer Prueba", tel: TEL, status: "Disponible" });
  oficina = cliente("admin"); await signInWithEmailAndPassword(oficina.auth, "admin@example.invalid", "clave-admin-123");
  ilse = cliente("ilse"); await signInWithEmailAndPassword(ilse.auth, "ilse@example.invalid", "clave-ilse-123");
});
after(async () => { for(const a of apps) await deleteApp(a).catch(() => {}); await adm?.delete().catch(() => {}); });

test("1 · un admin le da acceso al chofer con su celular; Ilse no puede", async () => {
  await assert.rejects(ilse.llamar("oficinaVincularChofer", { choferId: "ch1", correo: correoDeChofer(TEL) }), /administrador/);
  const r = await oficina.llamar("oficinaVincularChofer", { choferId: "ch1", correo: correoDeChofer(TEL) });
  assert.match(r.enlace, /lang=es/);
  // El chofer pone su contraseña con el enlace (aquí se hace directo en el Auth de prueba).
  const u = await admin.auth().getUserByEmail(correoDeChofer(TEL));
  await admin.auth().updateUser(u.uid, { password: CLAVE_CHOFER });
  assert.equal((await admin.firestore().doc("choferes/ch1").get()).data().authUid, u.uid);
});

test("2 · el chofer entra con su celular y su equipo queda ligado; antes de su ruta no ve nada y puede leer su jornada vacía", async () => {
  chofer = cliente("chofer");
  await signInWithEmailAndPassword(chofer.auth, correoDeChofer(TEL), CLAVE_CHOFER);
  const r = await chofer.llamar("choferRegistrarDispositivo", { dispositivoId: "equipo-prueba-0001", modelo: "prueba" });
  assert.equal(r.choferId, "ch1");
  const q = await getDocs(query(collection(chofer.db, "servicios"), where("choferId", "==", "ch1"), where("estado", "in", ["Asignada", "En ruta"])));
  assert.equal(q.size, 0);
  const j = await getDoc(doc(chofer.db, "jornadas", `ch1_${fechaCDMX()}`));     // antes se negaba y la app se atoraba
  assert.equal(j.exists(), false);
  await assert.rejects(chofer.llamar("choferRegistrarDispositivo", { dispositivoId: "otro-equipo-9999" }), /otro equipo/);
});

test("3 · Ilse asigna la ruta con la hoja (mismo código): lugares, servicio, ruta armada y Asignada", async () => {
  const usuario = { uid: "ilse1", rol: "operaciones", nombre: "Ilse Prueba" };
  const lista = [
    { tipo: "entrega", nombre: "Tienda B", direccion: "Calle B 2", ...TIENDA_B, confirmada: true },
    { tipo: "carga", nombre: "Bodega", direccion: "", ...BODEGA, confirmada: true },               // sin dirección escrita: no se pierde
    { tipo: "entrega", nombre: "Tienda A", direccion: "Calle A 1", ...TIENDA_A, confirmada: true, contacto: "Ana", telefono: "5500000001" },
  ];
  const conId = await guardarLugares(ilse.db, usuario, lista, []);
  assert.ok(conId.every(p => p.puntoId));
  const datos = datosServicio({ usuario, cliente: "Cliente Prueba", fecha: fechaCDMX(), paradas: conId, placa: "ABC1234", chofer: { nombre: "Chofer Prueba" }, indicaciones: "Pedir sello" });
  const { id, folio } = await crearServicioRuta(ilse.db, usuario, datos);
  assert.match(folio, /^SRV-20\d{2}-\d{4,}$/);
  const p = { id, folio, datos, choferId: "ch1", ordenar: true };
  const r = await terminarAsignacion(ilse.db, usuario, ilse.llamar, p);
  assert.ok(r.faltantes.includes("Folio de cotización"));            // se anota, no se inventa
  await terminarAsignacion(ilse.db, usuario, ilse.llamar, p);          // "Reintentar" no rompe ni duplica
  servicioId = id;
  const s = (await admin.firestore().doc("servicios/" + id).get()).data();
  assert.equal(s.estado, "Asignada"); assert.equal(s.choferId, "ch1"); assert.equal(s.unidadPlaca, "ABC1234");
  assert.equal((await admin.firestore().collection("servicios").get()).size, 1);
});

test("4 · al chofer le aparece la ruta con sus paradas: primero recoger, luego entregas por cercanía", async () => {
  const q = await getDocs(query(collection(chofer.db, "servicios"), where("choferId", "==", "ch1"), where("estado", "in", ["Asignada", "En ruta"])));
  assert.equal(q.size, 1);
  assert.equal(q.docs[0].data().indicaciones, "Pedir sello");
  const ps = await getDocs(query(collection(chofer.db, "servicios", servicioId, "paradas"), orderBy("orden")));
  paradas = ps.docs.map(d => ({ id: d.id, ...d.data() }));
  assert.deepEqual(paradas.map(p => p.nombre), ["Bodega", "Tienda A", "Tienda B"]);
  assert.ok(paradas[0].direccion);                                      // la bodega sin dirección trae la del catálogo/coordenada
});

test("5 · empieza su día con 3 fotos; sin check-in no puede salir", async () => {
  await assert.rejects(chofer.llamar("choferIniciarRuta", { dispositivoId: "equipo-prueba-0001", servicioId }), /check-in/);
  const base = `jornadas/ch1/${fechaCDMX()}_${Date.now()}_`, subir = async n => { await uploadBytes(ref(chofer.st, base + n), JPG, { contentType: "image/jpeg" }); return base + n; };
  const [s, pl, od] = [await subir("selfie.jpg"), await subir("placas.jpg"), await subir("odometro.jpg")];
  await chofer.llamar("choferCheckIn", { dispositivoId: "equipo-prueba-0001", selfieRuta: s, fotoPlacasRuta: pl, fotoOdometroRuta: od, unidadPlaca: "ABC1234",
    odometroKm: 85000, combustiblePct: 75, lat: BODEGA.lat, lng: BODEGA.lng, simulada: false });
  const j = await getDoc(doc(chofer.db, "jornadas", `ch1_${fechaCDMX()}`));
  assert.equal(j.data().estado, "Abierta");
});

test("6 · sale a la ruta, manda su ubicación y cierra cada parada (una con problema, sin nombre de quien recibe)", async () => {
  const c = chofer.llamar, D = "equipo-prueba-0001";
  assert.equal((await c("choferIniciarRuta", { dispositivoId: D, servicioId })).estado, "En ruta");
  const ahora = Date.now(), tiempos = [ahora - 4 * MIN, ahora - 2 * MIN, ahora - 10000];
  const sitios = [BODEGA, TIENDA_A, TIENDA_B];
  for(const [i, p] of paradas.entries()){
    // Primera lectura aproximada (wifi) lejos: no debe causar "salto imposible".
    const pos = [...(i === 0 ? [{ lat: 19.45, lng: -99.20, tMs: tiempos[i] - 30000, precisionM: 2500 }] : []), { ...sitios[i], tMs: tiempos[i], precisionM: 10 }];
    const r = await c("choferSubirPosiciones", { dispositivoId: D, servicioId, posiciones: pos });
    assert.equal(r.aceptadas, pos.length);
    if(i === 1){
      /* El CLIENTE, con su link privado, ve la camioneta en el mapa a medio camino y sus avisos. */
      const { token } = await ilse.llamar("oficinaLinkSeguimiento", { servicioId });
      const j = await (await fetch(`http://127.0.0.1:5011/${PROYECTO}/us-central1/seguimiento?t=${token}&formato=json`)).json();
      assert.ok(j.mapa.vehiculo, "el cliente ve la camioneta");
      assert.equal(j.mapa.puntos.length, 2);                                  // solo sus 2 entregas, no la bodega
      assert.match(j.vivo, /va en camino/);
      assert.ok(j.avisos.some(a => /salió a ruta/.test(a.texto)));
      assert.ok(!JSON.stringify(j).includes("ABC1234"), "sin placas");
      const html = await (await fetch(`http://127.0.0.1:5011/${PROYECTO}/us-central1/seguimiento?t=${token}`)).text();
      assert.match(html, /Tu servicio SRV-/);
      seguimientoToken = token;
      // El cliente activa "Avísame en este celular": su suscripción queda guardada (solo la escribe el servidor).
      const sub = { endpoint: "https://push.example.invalid/dmov-prueba-123456", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
      const rs = await fetch(`http://127.0.0.1:5011/${PROYECTO}/us-central1/seguimiento?t=${token}&accion=suscribir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      assert.equal(rs.status, 200);
      assert.equal((await admin.firestore().collection(`servicios/${servicioId}/suscripciones`).where("activo", "==", true).get()).size, 1);
      const malo = await fetch(`http://127.0.0.1:5011/${PROYECTO}/us-central1/seguimiento?t=${token}&accion=suscribir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: "http://x" }) });
      assert.equal(malo.status, 400);
    }
    const foto = `evidencias/ch1/${servicioId}/${p.id}_${Date.now()}_1.jpg`;
    await uploadBytes(ref(chofer.st, foto), JPG, { contentType: "image/jpeg" });
    const problema = p.nombre === "Tienda B" ? "Cliente ausente" : "";
    const ev = { fotos: [foto], receptor: problema ? "" : "Ana", notas: "", incidencia: problema };
    const r2 = await c("choferCerrarParada", { dispositivoId: D, servicioId, paradaId: p.id, evidencia: ev });
    assert.equal(r2.ok, true);
  }
  const s = (await admin.firestore().doc("servicios/" + servicioId).get()).data();
  assert.equal(s.estado, "Entregada");
  assert.equal(s.paradasConProblema, 1); assert.equal(s.paradasEntregadas, 2); assert.equal(s.sinEntregas, false);
  const alertas = (await admin.firestore().collection("alertas").get()).docs.map(d => d.data().type);
  assert.ok(!alertas.includes("velocidad_imposible"), "no debe haber falsas alertas de salto");
  assert.ok(alertas.includes("incidencia"));
  // Ya entregado: el cliente deja de ver la camioneta y ve el aviso de la parada con problema.
  const j = await (await fetch(`http://127.0.0.1:5011/${PROYECTO}/us-central1/seguimiento?t=${seguimientoToken}&formato=json`)).json();
  assert.equal(j.mapa.vehiculo, null); assert.equal(j.final, true);
  assert.ok(j.avisos.some(a => /Cliente ausente/.test(a.texto)));
  // Con link de seguimiento activo, al acercarse a la Tienda B quedó UNA vez el aviso "está por llegar".
  const llegando = (await admin.firestore().collection(`servicios/${servicioId}/eventos`).where("tipo", "==", "llegando").get()).docs.map(d => d.data().paradaNombre);
  assert.deepEqual(llegando, ["Tienda B"]);
  assert.ok(j.avisos.some(a => /por llegar a Tienda B/.test(a.texto)));
});

test("7 · la oficina lo ve en vivo y el chofer termina su día", async () => {
  const u = await getDoc(doc(ilse.db, "ubicaciones", "ch1"));
  assert.equal(u.exists(), true); assert.equal(u.data().servicioId, servicioId);
  await chofer.llamar("choferTerminarJornada", { dispositivoId: "equipo-prueba-0001", lat: TIENDA_B.lat, lng: TIENDA_B.lng, odometroKm: 85012 });
  assert.equal((await getDoc(doc(chofer.db, "jornadas", `ch1_${fechaCDMX()}`))).data().estado, "Cerrada");
  // Otro chofer (o alguien sin cuenta) no ve esta ruta.
  await assert.rejects(getDocs(query(collection(cliente("anonimo").db, "servicios"), where("choferId", "==", "ch1"))));
});
