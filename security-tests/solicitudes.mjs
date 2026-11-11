import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { crearSolicitudesStore } from '../solicitudesStore.js';

/* Bandeja de solicitudes: el mensaje original es inmutable, el reloj no se manipula y nadie borra. */
let env;
const projectId = 'demo-dmov-archive';
const token = { email: 'user@example.invalid', email_verified: true };
const ctx = (uid, provider = 'google.com') => env.authenticatedContext(uid, { ...token, firebase: { sign_in_provider: provider } });
const usuario = (uid, rol) => ({ uid, rol, nombre: uid });
const anio = new Date().getFullYear();
const manual = { canal: 'WhatsApp', recibidaEn: new Date(Date.now() - 3600000).toISOString(), remitenteNombre: 'Persona Ejemplo', remitenteContacto: '5500000000', asunto: 'Camioneta', texto: 'Necesito una camioneta mañana' };
let creada;

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for(const [uid, rol, activo] of [['admin', 'admin', true], ['ops', 'operaciones', true], ['inactive', 'operaciones', false]])
      await setDoc(doc(db, 'dmov_usuarios', uid), { uid, rol, activo, email: uid + '@example.invalid', nombre: uid });
    /* Así las deja el servidor (Cloud Function) al recibir un correo. */
    await setDoc(doc(db, 'solicitudes', 'gmail_abc'), { folio: `SOL-${anio}-0900`, estado: 'Nueva', origen: 'conector', creadoPor: 'conector', canal: 'Correo',
      idExterno: 'gmail:abc', remitenteNombre: 'Cliente', remitenteCorreo: 'cliente@example.invalid', asunto: 'Cotización', texto: 'Texto original',
      recibidaEn: Timestamp.fromMillis(Date.now() - 600000), registradaEn: Timestamp.fromMillis(Date.now() - 590000), acuseEnviadoEn: Timestamp.fromMillis(Date.now() - 580000) });
    await setDoc(doc(db, 'sistema', 'conectores'), { gmail: { ultimoLatido: Timestamp.now() } });
  });
});
after(async () => env?.cleanup());

test('operaciones registra una solicitud manual con folio consecutivo', async () => {
  const store = crearSolicitudesStore(ctx('ops').firestore());
  creada = await assertSucceeds(store.crearManual(usuario('ops', 'operaciones'), manual));
  assert.equal(creada.folio, `SOL-${anio}-0001`);
  const db = ctx('ops').firestore();
  const snap = await assertSucceeds(getDoc(doc(db, 'solicitudes', creada.id)));
  assert.equal(snap.data().origen, 'manual');
  assert.equal(snap.data().estado, 'Nueva');
});

test('sin sesión, anónimo, inactivo y ajenos no leen solicitudes ni el estado de conectores', async () => {
  for(const c of [env.unauthenticatedContext(), ctx('x', 'anonymous'), ctx('inactive'), ctx('stranger')]){
    const db = c.firestore();
    await assertFails(getDoc(doc(db, 'solicitudes', 'gmail_abc')));
    await assertFails(getDocs(collection(db, 'solicitudes')));
    await assertFails(getDoc(doc(db, 'sistema', 'conectores')));
  }
});

test('la oficina no puede hacerse pasar por el conector, ni registrar a futuro, ni nacer respondida', async () => {
  const db = ctx('ops').firestore();
  const base = { folio: `SOL-${anio}-0001`, estado: 'Nueva', origen: 'manual', creadoPor: 'ops', canal: 'WhatsApp', texto: 'x',
    recibidaEn: Timestamp.fromMillis(Date.now() - 1000), registradaEn: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'solicitudes', 'f1'), base));                                           // folio ya emitido
  await assertFails(setDoc(doc(db, 'solicitudes', 'f2'), { ...base, folio: `SOL-${anio}-0777` }));         // folio ajeno al contador
  await assertFails(setDoc(doc(db, 'solicitudes', 'f3'), { ...base, origen: 'conector' }));
  await assertFails(setDoc(doc(db, 'solicitudes', 'f4'), { ...base, recibidaEn: Timestamp.fromMillis(Date.now() + 3600000) }));
  await assertFails(setDoc(doc(db, 'solicitudes', 'f5'), { ...base, primeraRespuestaEn: serverTimestamp() }));
});

test('el mensaje original, el folio, el canal y las horas de recepción y acuse son inmutables', async () => {
  for(const c of [ctx('ops'), ctx('admin')]){
    const ref = doc(c.firestore(), 'solicitudes', 'gmail_abc');
    for(const cambio of [{ texto: 'otro texto' }, { asunto: 'otro' }, { remitenteCorreo: 'otro@example.invalid' }, { folio: 'SOL-2026-0001' }, { canal: 'Slack' },
      { recibidaEn: Timestamp.now() }, { registradaEn: Timestamp.now() }, { acuseEnviadoEn: Timestamp.now() }, { origen: 'manual' }])
      await assertFails(updateDoc(ref, cambio));
    await assertFails(deleteDoc(ref));
  }
});

test('el reloj no se manipula: la primera respuesta se fija una vez y con hora del servidor', async () => {
  const db = ctx('ops').firestore();
  const ref = doc(db, 'solicitudes', 'gmail_abc');
  await assertFails(updateDoc(ref, { primeraRespuestaEn: Timestamp.fromMillis(Date.now() - 500000) }));   // hora inventada
  await assertFails(updateDoc(ref, { estado: 'Inventado' }));
  const store = crearSolicitudesStore(db);
  await assertSucceeds(store.cambiarEstado(usuario('ops', 'operaciones'), { id: 'gmail_abc', estado: 'Nueva' }, 'En revisión', ''));
  await assertSucceeds(store.marcarRespondida(usuario('ops', 'operaciones'), { id: 'gmail_abc', estado: 'En revisión' }, 'Le llamé'));
  await assertFails(updateDoc(ref, { primeraRespuestaEn: serverTimestamp() }));                           // ya estaba fijada
  await assertSucceeds(store.vincularServicio(usuario('ops', 'operaciones'), { id: 'gmail_abc', estado: 'Respondida', primeraRespuestaEn: 1 }, { id: 's1', folio: `SRV-${anio}-0001` }));
  const snap = await getDoc(ref);
  assert.equal(snap.data().estado, 'Convertida');
  assert.equal(snap.data().servicioFolio, `SRV-${anio}-0001`);
});

test('la bitácora solo se agrega y el estado de conectores lo escribe solo el servidor', async () => {
  const db = ctx('admin').firestore();
  const eventos = collection(db, 'solicitudes', 'gmail_abc', 'eventos');
  const lista = await assertSucceeds(getDocs(eventos));
  assert.equal(lista.size, 3);
  await assertFails(addDoc(eventos, { tipo: 'estado', actorUid: 'ops', ts: serverTimestamp() }));          // autor ajeno
  await assertFails(updateDoc(lista.docs[0].ref, { tipo: 'alterado' }));
  await assertFails(deleteDoc(lista.docs[0].ref));
  await assertSucceeds(getDoc(doc(db, 'sistema', 'conectores')));
  await assertFails(setDoc(doc(db, 'sistema', 'conectores'), { gmail: { ultimoLatido: serverTimestamp() } }));
});
