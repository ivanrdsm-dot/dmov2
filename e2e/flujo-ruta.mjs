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
/* Foto de check-in: el servidor exige un archivo de tamaño real (≥ 8 KB) y subido hace minutos. */
const FOTO = (() => { const a = new Uint8Array(12 * 1024); a.set(JPG); return a; })();
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
  /* Segundo chofer de la ruta (hasta 2 por ruta) y un tercero ajeno a ella. */
  for(const [id, tel] of [["ch2", "5512340002"], ["ch3", "5512340003"]]){
    const u = await auth.createUser({ email: correoDeChofer(tel), password: "clave-" + id + "-123" });
    await db.doc("choferes/" + id).set({ nombre: "Chofer " + id, tel, status: "Disponible", authUid: u.uid, activo: true });
    await db.doc("choferes_auth/" + u.uid).set({ choferId: id, correo: correoDeChofer(tel) });
    await auth.setCustomUserClaims(u.uid, { choferId: id });
  }
  oficina = cliente("admin"); await signInWithEmailAndPassword(oficina.auth, "admin@example.invalid", "clave-admin-123");
  ilse = cliente("ilse"); await signInWithEmailAndPassword(ilse.auth, "ilse@example.invalid", "clave-ilse-123");
});
after(async () => { for(const a of apps) await deleteApp(a).catch(() => {}); await adm?.delete().catch(() => {}); });

test("1 · un admin le da acceso al chofer con su celular; Ilse no puede", async () => {
  await assert.rejects(ilse.llamar("oficinaVincularChofer", { choferId: "ch1", correo: correoDeChofer(TEL) }), /administrador/);
  const r = await oficina.llamar("oficinaVincularChofer", { choferId: "ch1", correo: correoDeChofer(TEL) });
  // Enlace propio de 7 días (no el de Firebase, que vencía en 1 hora).
  assert.match(r.enlace, /^https:\/\/salesflow-crm-13c4a\.web\.app\/chofer\?activar=[A-Za-z0-9_-]{20,}$/);
  const token = new URL(r.enlace).searchParams.get("activar");
  const nadie = cliente("sin-sesion");
  assert.equal((await nadie.llamar("choferActivar", { token: "inventado-xxxxxxxxxxxxxxxxxxxx" })).estado, "invalida");
  const info = await nadie.llamar("choferActivar", { token });
  assert.equal(info.estado, "lista"); assert.equal(info.tel, TEL);
  await assert.rejects(nadie.llamar("choferActivar", { token, clave: "123" }), /al menos 6/);
  const creada = await nadie.llamar("choferActivar", { token, clave: CLAVE_CHOFER });
  assert.equal(creada.estado, "creada"); assert.equal(creada.correo, correoDeChofer(TEL));
  // Abrir otra vez el mismo enlace no da error: dice que ya la creó (la app le pone "Entrar" con su celular).
  assert.equal((await nadie.llamar("choferActivar", { token })).estado, "usada");
  assert.equal((await nadie.llamar("choferActivar", { token, clave: "otra-clave-999" })).estado, "usada");
  // Nadie lee los enlaces desde la app, ni el admin.
  await assert.rejects(getDocs(collection(oficina.db, "activaciones")));
  const u = await admin.auth().getUserByEmail(correoDeChofer(TEL));
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
  await assert.rejects(terminarAsignacion(ilse.db, usuario, ilse.llamar, { id, folio, datos, choferId: "ch1", segundoChoferId: "ch1", ordenar: true }), /otra persona/);
  const p = { id, folio, datos, choferId: "ch1", segundoChoferId: "ch2", ordenar: true };
  const r = await terminarAsignacion(ilse.db, usuario, ilse.llamar, p);
  assert.ok(r.faltantes.includes("Folio de cotización"));            // se anota, no se inventa
  await terminarAsignacion(ilse.db, usuario, ilse.llamar, p);          // "Reintentar" no rompe ni duplica
  servicioId = id;
  const s = (await admin.firestore().doc("servicios/" + id).get()).data();
  assert.equal(s.estado, "Asignada"); assert.equal(s.choferId, "ch1"); assert.equal(s.unidadPlaca, "ABC1234");
  assert.equal(s.segundoChoferId, "ch2"); assert.equal(s.segundoChoferNombre, "Chofer ch2");
  // El segundo chofer ve la ruta y sus paradas; un chofer ajeno no.
  const c2 = cliente("chofer2"); await signInWithEmailAndPassword(c2.auth, correoDeChofer("5512340002"), "clave-ch2-123");
  const q2 = await getDocs(query(collection(c2.db, "servicios"), where("segundoChoferId", "==", "ch2"), where("estado", "in", ["Asignada", "En ruta"])));
  assert.equal(q2.size, 1);
  assert.ok((await getDocs(collection(c2.db, "servicios", id, "paradas"))).size >= 3);
  const c3 = cliente("chofer3"); await signInWithEmailAndPassword(c3.auth, correoDeChofer("5512340003"), "clave-ch3-123");
  await assert.rejects(getDoc(doc(c3.db, "servicios", id)));
  await assert.rejects(getDocs(collection(c3.db, "servicios", id, "paradas")));
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

test("4b · Ilse edita la ruta ya enviada: agrega una tienda y la vuelve a quitar (queda marcada, no se borra)", async () => {
  const usuario = { uid: "ilse1", rol: "operaciones", nombre: "Ilse Prueba" };
  const [c] = await guardarLugares(ilse.db, usuario, [{ tipo: "entrega", nombre: "Tienda C", direccion: "Calle C 3", lat: 19.4300, lng: -99.1500, confirmada: true }], []);
  const r = await ilse.llamar("oficinaEditarRuta", { servicioId, agregar: [{ puntoId: c.puntoId, nombre: "Tienda C", tipo: "entrega" }] });
  assert.equal(r.agregadas, 1);
  let ps = (await getDocs(query(collection(chofer.db, "servicios", servicioId, "paradas"), orderBy("orden")))).docs.map(d => ({ id: d.id, ...d.data() }));
  const nueva = ps.find(p => p.nombre === "Tienda C");
  assert.equal(nueva.orden, 4); assert.equal(nueva.agregadaDespues, true); assert.equal(nueva.estado, "Pendiente");   // el chofer ya la ve
  await assert.rejects(chofer.llamar("oficinaEditarRuta", { servicioId, quitar: [nueva.id] }));                         // el chofer no edita rutas
  await assert.rejects(ilse.llamar("oficinaEditarRuta", { servicioId, agregar: [{ puntoId: "no-existe", nombre: "X" }] }), /no están confirmados/);
  await assert.rejects(ilse.llamar("oficinaEditarRuta", { servicioId, quitar: ps.map(p => p.id) }), /sin paradas pendientes/);
  assert.equal((await ilse.llamar("oficinaEditarRuta", { servicioId, quitar: [nueva.id] })).quitadas, 1);
  ps = (await getDocs(query(collection(chofer.db, "servicios", servicioId, "paradas"), orderBy("orden")))).docs.map(d => d.data());
  assert.equal(ps.length, 4);
  const q = ps.find(p => p.nombre === "Tienda C");
  assert.equal(q.estado, "Quitada"); assert.equal(q.quitadaPor, "Ilse Prueba");
  const ev = (await admin.firestore().collection(`servicios/${servicioId}/eventos`).where("tipo", "==", "ruta_editada").get()).size;
  assert.equal(ev, 2);
  // El sistema la marcó local (todo cerca de CDMX); la oficina puede corregir los días fuera y queda en la bitácora.
  assert.equal((await admin.firestore().doc("servicios/" + servicioId).get()).data().foraneo, false);
  assert.equal((await ilse.llamar("oficinaEditarRuta", { servicioId, diasFuera: 3 })).diasFuera, 3);
  const sd = (await admin.firestore().doc("servicios/" + servicioId).get()).data();
  assert.equal(sd.diasFueraManual, true); assert.ok(sd.regresoEstimado > sd.fechaServicio);
  await assert.rejects(ilse.llamar("oficinaEditarRuta", { servicioId, diasFuera: 99 }), /1 a 30/);
  // ⛔ Detener entrega: Ilse frena Tienda A; el chofer ve el aviso y confirma con "Enterado"; luego se reanuda.
  const pa = (await getDocs(query(collection(chofer.db, "servicios", servicioId, "paradas"), orderBy("orden")))).docs.find(d => d.data().nombre === "Tienda A");
  await assert.rejects(ilse.llamar("oficinaDetenerParada", { servicioId, paradaId: pa.id, detener: true, motivo: "" }), /motivo/);
  await assert.rejects(chofer.llamar("oficinaDetenerParada", { servicioId, paradaId: pa.id, detener: true, motivo: "no entregar hoy" }));   // el chofer no puede
  const d1 = await ilse.llamar("oficinaDetenerParada", { servicioId, paradaId: pa.id, detener: true, motivo: "No entregar hoy, se reprograma" });
  let sv = (await getDoc(doc(chofer.db, "servicios", servicioId))).data();
  assert.equal(sv.cambioPendiente.id, d1.cambioId); assert.equal(sv.cambioPendiente.enteradoMs, null);
  assert.match(sv.cambioPendiente.lineas[0], /NO ENTREGAR en Tienda A/);
  assert.equal((await getDoc(doc(chofer.db, "servicios", servicioId, "paradas", pa.id))).data().detenida.activa, true);
  assert.equal((await chofer.llamar("choferEnterado", { dispositivoId: "equipo-prueba-0001", servicioId, cambioId: d1.cambioId })).ok, true);
  sv = (await getDoc(doc(chofer.db, "servicios", servicioId))).data();
  assert.ok(sv.cambioPendiente.enteradoMs > 0, "queda la hora del Enterado");
  const d2 = await ilse.llamar("oficinaDetenerParada", { servicioId, paradaId: pa.id, detener: false });
  assert.ok(d2.cambioId && d2.cambioId !== d1.cambioId);
  await chofer.llamar("choferEnterado", { dispositivoId: "equipo-prueba-0001", servicioId, cambioId: d2.cambioId });
  assert.equal((await getDoc(doc(chofer.db, "servicios", servicioId, "paradas", pa.id))).data().detenida.activa, false);
});

test("5 · empieza su día con 3 fotos; sin check-in no puede salir", async () => {
  await assert.rejects(chofer.llamar("choferIniciarRuta", { dispositivoId: "equipo-prueba-0001", servicioId }), /check-in/);
  const base = `jornadas/ch1/${fechaCDMX()}_${Date.now()}_`, sello = { sello: "D MOVIMIENTO · CHECK-IN · prueba", tomadaMs: String(Date.now()) };
  const subir = async (n, datos = FOTO) => { await uploadBytes(ref(chofer.st, base + n), datos, { contentType: "image/jpeg", customMetadata: sello }); return base + n; };
  const [s, pl, od] = [await subir("selfie.jpg"), await subir("placas.jpg"), await subir("odometro.jpg")];
  const datos = { dispositivoId: "equipo-prueba-0001", selfieRuta: s, fotoPlacasRuta: pl, fotoOdometroRuta: od, unidadPlaca: "ABC1234", odometroKm: 85000, combustiblePct: 75, simulada: false };
  await assert.rejects(chofer.llamar("choferCheckIn", datos), /ubicación/);                                       // sin GPS no hay check-in
  await assert.rejects(chofer.llamar("choferCheckIn", { ...datos, lat: BODEGA.lat, lng: BODEGA.lng, selfieRuta: await subir("vacia.jpg", JPG) }), /vacía|pequeña/);   // foto falsa
  await chofer.llamar("choferCheckIn", { ...datos, lat: BODEGA.lat, lng: BODEGA.lng, precisionM: 12, posTMs: Date.now() - 2 * MIN });
  const j = await getDoc(doc(chofer.db, "jornadas", `ch1_${fechaCDMX()}`));
  assert.equal(j.data().estado, "Abierta");
  assert.ok(j.data().fotos.selfie.md5, "huella de la foto");
  assert.ok(j.data().fotos.selfie.subidaEnMs > Date.now() - 5 * MIN, "hora real de subida (la pone Google)");
  assert.deepEqual(j.data().dudas, []);
  // Se registra si llegó tarde (contra las 7:00) y dónde estaba; al director le llega el aviso con la ubicación.
  assert.equal(typeof j.data().llegoTarde, "boolean"); assert.equal(j.data().fueraDeCdmxEntrada, false); assert.equal(j.data().placaRuta, "ABC1234");
  const avisoIn = (await admin.firestore().collection("alertas").where("choferId", "==", "ch1").get()).docs.map(d => d.data()).find(a => ["checkin_registrado", "checkin_tarde"].includes(a.type));
  assert.ok(avisoIn && avisoIn.informativa === true && avisoIn.atendida === true && Number.isFinite(avisoIn.lat), "aviso de check-in con ubicación");
  // Gasolina: foto del ticket obligatoria; el servidor calcula el precio por litro y queda pendiente de aprobar.
  await assert.rejects(chofer.llamar("choferRegistrarGasto", { dispositivoId: "equipo-prueba-0001", tipo: "gasolina", monto: 1200, litros: 50, odometroKm: 85010, lat: BODEGA.lat, lng: BODEGA.lng }), /ticket/);
  const ticket = await subir("ticket_gasolina.jpg");
  const g = await chofer.llamar("choferRegistrarGasto", { dispositivoId: "equipo-prueba-0001", tipo: "gasolina", monto: 1200, litros: 50, odometroKm: 85010, fotoTicketRuta: ticket, lat: BODEGA.lat, lng: BODEGA.lng });
  assert.equal(g.precioLitro, 24);
  const gd = (await admin.firestore().doc("gastosChofer/" + g.id).get()).data();
  assert.equal(gd.estado, "pendiente"); assert.equal(gd.unidadPlaca, "ABC1234"); assert.ok(gd.fotoTicket.md5, "huella del ticket");
  await assert.rejects(chofer.llamar("choferRegistrarGasto", { dispositivoId: "equipo-prueba-0001", tipo: "gasolina", monto: 1200, litros: 50, odometroKm: 84000, fotoTicketRuta: await subir("ticket2.jpg"), lat: BODEGA.lat, lng: BODEGA.lng }).then(r => { if(r.dudas < 1) throw new Error("debió marcar duda"); throw new Error("ok"); }), /ok/);   // km hacia atrás → duda
  // Con la jornada abierta (aún sin ruta) su ubicación también se registra.
  const r = await chofer.llamar("choferSubirPosiciones", { dispositivoId: "equipo-prueba-0001", servicioId: "", posiciones: [{ ...BODEGA, tMs: Date.now() - 2 * MIN + 1000, precisionM: 10 }] });   // antes de salir a ruta
  assert.equal(r.aceptadas, 1);
  assert.equal((await getDocs(collection(ilse.db, "jornadas", `ch1_${fechaCDMX()}`, "posiciones"))).size, 1);
});

test("6 · sale a la ruta, manda su ubicación y cierra cada parada (una con problema, sin nombre de quien recibe)", async () => {
  const c = chofer.llamar, D = "equipo-prueba-0001";
  assert.equal((await c("choferIniciarRuta", { dispositivoId: D, servicioId })).estado, "En ruta");
  const ahora = Date.now(), tiempos = [ahora - 100000, ahora - 60000, ahora - 10000];
  const sitios = [BODEGA, TIENDA_A, TIENDA_B];
  for(const [i, p] of paradas.entries()){
    // Primera lectura aproximada (wifi) lejos: no debe causar "salto imposible".
    const pos = [...(i === 0 ? [{ lat: 19.45, lng: -99.20, tMs: tiempos[i] - 15000, precisionM: 2500 }] : []), { ...sitios[i], tMs: tiempos[i], precisionM: 10 }];
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
    await c("choferLlegue", { dispositivoId: D, servicioId, paradaId: p.id });   // "Llegué": hora del servidor
    const r2 = await c("choferCerrarParada", { dispositivoId: D, servicioId, paradaId: p.id, evidencia: ev });
    assert.equal(r2.ok, true);
  }
  // Para medir desempeño: cada parada tiene hora de llegada (botón y GPS) y de cierre.
  for(const d of (await admin.firestore().collection(`servicios/${servicioId}/paradas`).get()).docs.filter(d => d.data().estado !== "Quitada" && d.data().cerradaMs)){
    assert.ok(Number.isFinite(d.data().llegadaMs), "hora de 'Llegué'");
    assert.ok(d.data().cerradaMs >= d.data().llegadaMs);
    assert.ok("llegadaGpsMs" in d.data());
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
  const D = "equipo-prueba-0001", salida = `jornadas/ch1/${fechaCDMX()}_${Date.now()}_odometro_salida.jpg`;
  await uploadBytes(ref(chofer.st, salida), FOTO, { contentType: "image/jpeg", customMetadata: { sello: "CHECK-OUT", tomadaMs: String(Date.now()) } });
  await assert.rejects(chofer.llamar("choferTerminarJornada", { dispositivoId: D, lat: TIENDA_B.lat, lng: TIENDA_B.lng, odometroKm: 85012 }), /fotos|foto/i);   // sin foto no
  await assert.rejects(chofer.llamar("choferTerminarJornada", { dispositivoId: D, lat: TIENDA_B.lat, lng: TIENDA_B.lng, odometroKm: 84000, fotoOdometroRuta: salida }), /menos/);
  await chofer.llamar("choferTerminarJornada", { dispositivoId: D, lat: TIENDA_B.lat, lng: TIENDA_B.lng, odometroKm: 85012, fotoOdometroRuta: salida });
  const jc = (await getDoc(doc(ilse.db, "jornadas", `ch1_${fechaCDMX()}`))).data();
  assert.equal(jc.kmRecorridos, 12); assert.ok(jc.fotosSalida.odometroSalida.md5);
  assert.ok(Number.isFinite(jc.kmGps) || jc.kmGps === null); assert.equal(jc.fueraDeCdmxSalida, false);
  const tiposCh1 = (await admin.firestore().collection("alertas").where("choferId", "==", "ch1").get()).docs.map(d => d.data().type);
  assert.ok(tiposCh1.includes("checkout_registrado"), "aviso de check-out");
  assert.ok(!tiposCh1.includes("fuera_de_cdmx") && !tiposCh1.includes("unidad_no_coincide"), "sin falsas alarmas dentro de CDMX y con su camioneta");
  assert.equal((await getDoc(doc(chofer.db, "jornadas", `ch1_${fechaCDMX()}`))).data().estado, "Cerrada");
  // Otro chofer (o alguien sin cuenta) no ve esta ruta.
  await assert.rejects(getDocs(query(collection(cliente("anonimo").db, "servicios"), where("choferId", "==", "ch1"))));
});
