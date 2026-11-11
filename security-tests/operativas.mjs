import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';

/* RBAC v4: rutas, choferes y ubicaciones cerradas a oficina. Nada anónimo ni público. */
let env;
const projectId = 'demo-dmov-archive';
const token = { email: 'user@example.invalid', email_verified: true };
const ctx = (uid, provider = 'google.com') => env.authenticatedContext(uid, { ...token, firebase: { sign_in_provider: provider } });
const COLS = ['rutas', 'driverLocations', 'choferes', 'gastosChofer', 'jornadas', 'mensajes', 'alertas'];

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for(const [uid, rol, activo] of [['admin', 'admin', true], ['ops', 'operaciones', true], ['inactive', 'operaciones', false]])
      await setDoc(doc(db, 'dmov_usuarios', uid), { uid, rol, activo, email: uid + '@example.invalid', nombre: uid });
    for(const col of COLS) await setDoc(doc(db, col, 'uno'), { nombre: 'Ejemplo', trackingId: 'TRK-1', tel: '5500000000', codigoAcceso: 'ABC123', lat: 19.4, lng: -99.1 });
  });
});
after(async () => env?.cleanup());

test('sin sesión, sesión anónima, perfil inactivo y cuentas ajenas no leen ninguna colección operativa', async () => {
  for(const c of [env.unauthenticatedContext(), ctx('chofer-x', 'anonymous'), ctx('inactive'), ctx('stranger')]){
    const db = c.firestore();
    for(const col of COLS){
      await assertFails(getDoc(doc(db, col, 'uno')));
      await assertFails(getDocs(collection(db, col)));
    }
  }
});

test('el rastreo público por trackingId y el login de chofer por teléfono ya no exponen datos', async () => {
  for(const c of [env.unauthenticatedContext(), ctx('chofer-x', 'anonymous')]){
    const db = c.firestore();
    await assertFails(getDocs(query(collection(db, 'rutas'), where('trackingId', '==', 'TRK-1'))));
    await assertFails(getDocs(query(collection(db, 'choferes'), where('tel', '==', '5500000000'))));
  }
});

test('nadie sin perfil de oficina escribe ubicaciones, rutas, choferes ni alertas', async () => {
  for(const c of [env.unauthenticatedContext(), ctx('chofer-x', 'anonymous'), ctx('inactive'), ctx('stranger')]){
    const db = c.firestore();
    await assertFails(setDoc(doc(db, 'driverLocations', 'uno'), { lat: 0, lng: 0 }));
    await assertFails(updateDoc(doc(db, 'rutas', 'uno'), { progreso: 100 }));
    await assertFails(updateDoc(doc(db, 'choferes', 'uno'), { status: 'En ruta' }));
    await assertFails(setDoc(doc(db, 'alertas', 'nueva'), { type: 'sos' }));
    await assertFails(setDoc(doc(db, 'jornadas', 'nueva'), { horas: 8 }));
  }
});

test('operaciones lee, crea y edita lo operativo, pero no borra ni falsea ubicaciones', async () => {
  const db = ctx('ops').firestore();
  for(const col of COLS){
    await assertSucceeds(getDoc(doc(db, col, 'uno')));
    await assertSucceeds(getDocs(collection(db, col)));
    await assertFails(deleteDoc(doc(db, col, 'uno')));
  }
  for(const col of COLS.filter(c => c !== 'driverLocations')){
    await assertSucceeds(setDoc(doc(db, col, 'nuevo'), { nombre: 'Nuevo' }));
    await assertSucceeds(updateDoc(doc(db, col, 'uno'), { nombre: 'Editado' }));
  }
  await assertFails(setDoc(doc(db, 'driverLocations', 'uno'), { lat: 0, lng: 0 }));
});

test('admin borra y administra ubicaciones', async () => {
  const db = ctx('admin').firestore();
  await assertSucceeds(setDoc(doc(db, 'driverLocations', 'limpieza'), { lat: 1, lng: 1 }));
  for(const col of COLS) await assertSucceeds(deleteDoc(doc(db, col, 'uno')));
});
