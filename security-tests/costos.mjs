import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { crearServiciosStore } from '../serviciosStore.js';

/* Costos reales: la oficina captura y anula con motivo; nadie edita ni borra; el
   total del servicio solo lo escribe el servidor. */
let env, dbOps, dbAdmin, sOps, srv;
const projectId = 'demo-dmov-archive';
const ctx = (uid, provider = 'google.com') => env.authenticatedContext(uid, { email: uid + '@example.invalid', email_verified: true, firebase: { sign_in_provider: provider } });
const OPS = { uid: 'ops', rol: 'operaciones', nombre: 'ops' };

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for(const [uid, rol] of [['admin', 'admin'], ['ops', 'operaciones']]) await setDoc(doc(db, 'dmov_usuarios', uid), { uid, rol, activo: true, email: uid + '@example.invalid', nombre: uid });
    await setDoc(doc(db, 'choferes_auth', 'uidChofer'), { choferId: 'c1' });
  });
  dbOps = ctx('ops').firestore(); dbAdmin = ctx('admin').firestore();
  sOps = crearServiciosStore(dbOps);
  srv = await sOps.crear(OPS, { canal: 'Correo', recibidaEn: '2026-01-05T10:00', empresa: 'Cliente Ejemplo' });
});
after(async () => env?.cleanup());

test('operaciones captura un costo y su evento queda en la bitácora', async () => {
  await assertSucceeds(sOps.agregarCosto(OPS, srv, { concepto: 'Casetas', monto: '480.50' }));
  const c = await getDocs(collection(dbOps, 'servicios', srv.id, 'costos'));
  assert.equal(c.size, 1); assert.equal(c.docs[0].data().monto, 480.5);
  const ev = await getDocs(collection(dbOps, 'servicios', srv.id, 'eventos'));
  assert.ok(ev.docs.some(d => d.data().tipo === 'costo'));
});

test('no se aceptan costos inventados: concepto fuera de lista, monto inválido, autor falso u Otro sin nota', async () => {
  const col = collection(dbOps, 'servicios', srv.id, 'costos');
  const base = { concepto: 'Casetas', monto: 100, nota: '', actorUid: 'ops', actorNombre: 'ops', ts: serverTimestamp() };
  await assertSucceeds(addDoc(col, base));
  await assertFails(addDoc(col, { ...base, concepto: 'Propina' }));
  await assertFails(addDoc(col, { ...base, monto: 0 }));
  await assertFails(addDoc(col, { ...base, monto: '100' }));
  await assertFails(addDoc(col, { ...base, actorUid: 'admin' }));
  await assertFails(addDoc(col, { ...base, ts: new Date() }));
  await assertFails(addDoc(col, { ...base, concepto: 'Otro' }));
  await assertFails(addDoc(col, { ...base, anulado: true }));
  await assertFails(addDoc(collection(dbOps, 'servicios', 'no-existe', 'costos'), base));
  await assertFails(addDoc(collection(ctx('uidChofer').firestore(), 'servicios', srv.id, 'costos'), { ...base, actorUid: 'uidChofer' }));
});

test('nadie edita ni borra un costo; se anula una sola vez con motivo', async () => {
  const c = (await getDocs(collection(dbOps, 'servicios', srv.id, 'costos'))).docs[0];
  await assertFails(updateDoc(c.ref, { monto: 1 }));
  await assertFails(deleteDoc(doc(dbAdmin, 'servicios', srv.id, 'costos', c.id)));
  await assert.rejects(sOps.anularCosto(OPS, srv, { id: c.id, ...c.data() }, ' '), /motivo/);
  await assertSucceeds(sOps.anularCosto(OPS, srv, { id: c.id, ...c.data() }, 'Se capturó dos veces'));
  assert.equal((await getDoc(c.ref)).data().anulado, true);
  await assertFails(updateDoc(c.ref, { anulado: true, anuladoPor: 'ops', anuladoEn: serverTimestamp(), motivoAnulacion: 'otra vez' }));
});

test('el total de costos del servicio solo lo escribe el servidor', async () => {
  const ref = doc(dbAdmin, 'servicios', srv.id);
  await assertFails(updateDoc(ref, { costoTotal: 1 }));
  await assertFails(updateDoc(doc(dbOps, 'servicios', srv.id), { costosN: 9 }));
  await assertSucceeds(updateDoc(doc(dbOps, 'servicios', srv.id), { notas: 'cambio normal sigue permitido' }));
  // y la edición normal del servicio no se rompe aunque el formulario traiga los campos del servidor
  await env.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), 'servicios', srv.id), { costoTotal: 580.5, costosN: 2 }));
  const actual = { id: srv.id, ...(await getDoc(doc(dbOps, 'servicios', srv.id))).data() };
  await assertSucceeds(sOps.actualizar(OPS, actual, { ...actual, notas: 'otra nota', costoTotal: 1 }));
});

test('el link de seguimiento y la encuesta solo los escribe el servidor', async () => {
  const ref = doc(dbOps, 'servicios', srv.id);
  await assertFails(updateDoc(ref, { seguimientoToken: 'x'.repeat(43) }));
  await assertFails(updateDoc(doc(dbAdmin, 'servicios', srv.id), { encuestaCalificacion: 5 }));
  await assertFails(setDoc(doc(dbOps, 'servicios', srv.id, 'encuesta', 'respuesta'), { calificacion: 5 }));
});
