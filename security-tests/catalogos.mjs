import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { crearCatalogoStore } from '../catalogosStore.js';

/* Puntos de entrega y proveedores: solo oficina, nadie borra, historial que solo se agrega. */
let env;
const projectId = 'demo-dmov-archive';
const token = { email: 'user@example.invalid', email_verified: true };
const ctx = (uid, provider = 'google.com') => env.authenticatedContext(uid, { ...token, firebase: { sign_in_provider: provider } });
const usuario = (uid, rol) => ({ uid, rol, nombre: uid });
const ids = {};

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();                      // una sola instancia por contexto
    for(const [uid, rol, activo] of [['admin', 'admin', true], ['ops', 'operaciones', true], ['inactive', 'operaciones', false]])
      await setDoc(doc(db, 'dmov_usuarios', uid), { uid, rol, activo, email: uid + '@example.invalid', nombre: uid });
  });
});
after(async () => env?.cleanup());

for(const col of ['puntos_entrega', 'proveedores']){
  test(`${col}: operaciones crea y edita, y cada guardado deja su registro`, async () => {
    const db = ctx('ops').firestore(), store = crearCatalogoStore(db, col);
    ids[col] = await assertSucceeds(store.guardar(usuario('ops', 'operaciones'), null, { nombre: 'Ejemplo', direccion: 'Calle 1' }));
    await assertSucceeds(store.guardar(usuario('ops', 'operaciones'), { id: ids[col], nombre: 'Ejemplo', direccion: 'Calle 1' }, { nombre: 'Ejemplo', direccion: 'Calle 2' }));
    const cambios = await assertSucceeds(getDocs(collection(db, col, ids[col], 'cambios')));
    assert.deepEqual(cambios.docs.map(d => d.data().tipo).sort(), ['creado', 'editado']);
    assert.equal((await getDoc(doc(db, col, ids[col]))).data().direccion, 'Calle 2');
  });
  test(`${col}: sin sesión, anónimo, inactivo y ajenos no leen ni escriben`, async () => {
    for(const c of [env.unauthenticatedContext(), ctx('x', 'anonymous'), ctx('inactive'), ctx('stranger')]){
      const db = c.firestore();
      await assertFails(getDoc(doc(db, col, ids[col])));
      await assertFails(setDoc(doc(db, col, 'intruso'), { nombre: 'x' }));
      await assertFails(updateDoc(doc(db, col, ids[col]), { nombre: 'alterado' }));
    }
  });
  test(`${col}: nadie borra, y el historial no se reescribe`, async () => {
    for(const c of [ctx('ops'), ctx('admin')]){
      const db = c.firestore();
      await assertFails(deleteDoc(doc(db, col, ids[col])));
      const uno = (await getDocs(collection(db, col, ids[col], 'cambios'))).docs[0].ref;
      await assertFails(updateDoc(uno, { tipo: 'alterado' }));
      await assertFails(deleteDoc(uno));
    }
  });
}
