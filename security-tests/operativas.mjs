import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { borrarConRastro, recuperar, listarPapelera } from '../papelera.js';

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

test('admin borra y administra ubicaciones; rutas y choferes solo con copia en la papelera', async () => {
  const db = ctx('admin').firestore();
  await assertSucceeds(setDoc(doc(db, 'driverLocations', 'limpieza'), { lat: 1, lng: 1 }));
  for(const col of ['rutas', 'choferes']){
    await assertFails(deleteDoc(doc(db, col, 'uno')));                                  // sin copia no se borra
    await assertSucceeds(borrarConRastro(db, { uid: 'admin', nombre: 'admin' }, col, 'uno'));
    const copia = await getDoc(doc(db, 'papelera', col + '__uno'));
    if(copia.data().datos.nombre !== 'Editado' || copia.data().borradoPorUid !== 'admin') throw new Error('copia incompleta en ' + col);
  }
  await assertSucceeds(deleteDoc(doc(db, 'driverLocations', 'uno')));                      // ubicaciones: efímeras
  for(const col of ['gastosChofer', 'jornadas', 'mensajes', 'alertas']) await assertFails(deleteDoc(doc(db, col, 'uno')));   // historia: nadie borra
});

test('la copia de la papelera tiene que ser idéntica y el registro se borra en el mismo lote', async () => {
  const dbA = ctx('admin').firestore();
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'cuentas', 'c1'), { empresa: 'Cliente Ejemplo', rfc: 'XAXX010101000' }));
  const base = { coleccion: 'cuentas', docId: 'c1', borradoPorUid: 'admin', borradoPorNombre: 'admin', motivo: '', borradoEn: serverTimestamp() };
  let lote = writeBatch(dbA); lote.set(doc(dbA, 'papelera', 'cuentas__c1'), { ...base, datos: {} }); lote.delete(doc(dbA, 'cuentas', 'c1'));
  await assertFails(lote.commit());                                                         // copia vacía: no
  await assertFails(setDoc(doc(dbA, 'papelera', 'cuentas__c1'), { ...base, datos: { empresa: 'Cliente Ejemplo', rfc: 'XAXX010101000' } }));   // copia sin borrar: no
  lote = writeBatch(dbA); lote.set(doc(dbA, 'papelera', 'dmov_usuarios__ops'), { ...base, coleccion: 'dmov_usuarios', docId: 'ops', datos: {} });
  await assertFails(lote.commit());                                                         // colección fuera de la lista: no
  await assertSucceeds(borrarConRastro(dbA, { uid: 'admin' }, 'cuentas', 'c1'));
});

test('la papelera: solo admin la lee y escribe, con su propio uid; nadie la edita ni la borra', async () => {
  const dbA = ctx('admin').firestore(), dbO = ctx('ops').firestore();
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'viaticos', 'v1'), { concepto: 'Comida', monto: 100 }));
  await assertFails(borrarConRastro(dbO, { uid: 'ops' }, 'viaticos', 'v1'));            // operaciones no borra
  await assertFails(getDoc(doc(dbO, 'papelera', 'rutas__uno')));                         // ni lee la papelera
  await assertFails(setDoc(doc(dbA, 'papelera', 'viaticos__v1'), { coleccion: 'viaticos', docId: 'v1', datos: {}, borradoPorUid: 'otro', borradoEn: new Date() }));
  await assertSucceeds(borrarConRastro(dbA, { uid: 'admin' }, 'viaticos', 'v1'));
  await assertFails(updateDoc(doc(dbA, 'papelera', 'viaticos__v1'), { motivo: 'cambio' }));
  await assertFails(deleteDoc(doc(dbA, 'papelera', 'viaticos__v1')));
  await assertFails(updateDoc(doc(dbA, 'papelera', 'viaticos__v1'), { recuperadoPorUid: 'admin', recuperadoEn: new Date() }));  // sin devolver el registro no
});

test('recuperar devuelve el registro con su id; volver a borrarlo pide copia nueva (__2)', async () => {
  const dbA = ctx('admin').firestore();
  const copia = (await listarPapelera(dbA)).find(c => c.id === 'viaticos__v1');
  await assertSucceeds(recuperar(dbA, { uid: 'admin' }, copia));
  const vuelta = await getDoc(doc(dbA, 'viaticos', 'v1'));
  if(vuelta.data().concepto !== 'Comida') throw new Error('no regresó igual');
  await assert_rechaza(recuperar(dbA, { uid: 'admin' }, (await listarPapelera(dbA)).find(c => c.id === 'viaticos__v1')));   // una sola vez
  await assertFails(deleteDoc(doc(dbA, 'viaticos', 'v1')));                              // la copia vieja no sirve
  await assertSucceeds(borrarConRastro(dbA, { uid: 'admin' }, 'viaticos', 'v1'));
  if(!(await getDoc(doc(dbA, 'papelera', 'viaticos__v1__2'))).exists()) throw new Error('falta la segunda copia');
});
const assert_rechaza = async p => { let ok = false; try { await p; } catch { ok = true; } if(!ok) throw new Error('debía rechazarse'); };
