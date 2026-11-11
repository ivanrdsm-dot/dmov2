import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { crearTarifarioStore } from '../tarifarioStore.js';

/* Tarifario: lo lee la oficina; los precios solo los cambia un admin; nada se borra. */
let env;
const projectId = 'demo-dmov-archive';
const ctx = (uid, provider = 'google.com') => env.authenticatedContext(uid, { email: uid + '@example.invalid', email_verified: true, firebase: { sign_in_provider: provider } });
const usuario = (uid, rol) => ({ uid, rol, nombre: uid });
const tarifa = { tipo: 'nacional', nombre: 'Destino Ejemplo', km: 100, base: { eur: 1000 }, cliente: { eur: 1120 } };
let id;

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for(const [uid, rol] of [['admin', 'admin'], ['ops', 'operaciones']]) await setDoc(doc(db, 'dmov_usuarios', uid), { uid, rol, activo: true, email: uid + '@example.invalid', nombre: uid });
    await setDoc(doc(db, 'choferes_auth', 'uidChofer'), { choferId: 'c1' });
  });
});
after(async () => env?.cleanup());

test('admin da de alta y cambia precios; cada cambio queda en el historial', async () => {
  const db = ctx('admin').firestore(), store = crearTarifarioStore(db);
  assert.equal(await assertSucceeds(store.guardar(usuario('admin', 'admin'), null, tarifa)), 3);
  id = 'nacional_destino-ejemplo';
  assert.equal(await assertSucceeds(store.guardar(usuario('admin', 'admin'), { id, ...tarifa }, { ...tarifa, base: { eur: 1100 } })), 1);
  assert.equal((await getDoc(doc(db, 'tarifario', id))).data().base.eur, 1100);
  const cambios = await getDocs(collection(db, 'tarifario', id, 'cambios'));
  assert.deepEqual(cambios.docs.map(d => d.data().tipo).sort(), ['alta', 'precio']);
});

test('operaciones consulta el tarifario pero no cambia precios ni escribe historial', async () => {
  const db = ctx('ops').firestore();
  await assertSucceeds(getDoc(doc(db, 'tarifario', id)));
  await assertSucceeds(getDocs(collection(db, 'tarifario')));
  await assertFails(updateDoc(doc(db, 'tarifario', id), { 'base.eur': 1 }));
  await assertFails(setDoc(doc(db, 'tarifario', 'nacional_falso'), tarifa));
  await assertFails(crearTarifarioStore(db).guardar(usuario('ops', 'admin'), { id, ...tarifa, base: { eur: 1100 } }, { ...tarifa, base: { eur: 5 } }));
});

test('choferes, sesiones anónimas y cuentas ajenas no ven precios', async () => {
  for(const c of [ctx('uidChofer', 'password'), ctx('x', 'anonymous'), ctx('stranger'), env.unauthenticatedContext()]){
    const db = c.firestore();
    await assertFails(getDoc(doc(db, 'tarifario', id)));
    await assertFails(getDocs(collection(db, 'tarifario')));
  }
});

test('nadie borra una tarifa ni reescribe su historial, ni siquiera admin', async () => {
  const db = ctx('admin').firestore();
  await assertFails(deleteDoc(doc(db, 'tarifario', id)));
  const uno = (await getDocs(collection(db, 'tarifario', id, 'cambios'))).docs[0].ref;
  await assertFails(updateDoc(uno, { tipo: 'alterado' }));
  await assertFails(deleteDoc(uno));
});
