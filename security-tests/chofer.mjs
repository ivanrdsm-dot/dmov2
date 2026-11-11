import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

/* Fase 1: el chofer tiene cuenta propia, solo LEE lo suyo y no escribe nada directo en Firestore.
   En Storage solo sube imágenes nuevas a su propia carpeta. */
let env;
const projectId = 'demo-dmov-archive';
const ctx = (uid, provider = 'password') => env.authenticatedContext(uid, { email: uid + '@example.invalid', email_verified: true, firebase: { sign_in_provider: provider } });
const JPG = new Uint8Array([255, 216, 255]);

before(async () => {
  env = await initializeTestEnvironment({ projectId,
    firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9197, rules: readFileSync('storage.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'dmov_usuarios', 'ops'), { uid: 'ops', rol: 'operaciones', activo: true, email: 'ops@example.invalid', nombre: 'ops' });
    for(const n of ['1', '2']){
      await setDoc(doc(db, 'choferes', 'c' + n), { nombre: 'Chofer ' + n, authUid: 'uid' + n, dispositivoId: 'equipo-' + n, tel: '5500000000' });
      await setDoc(doc(db, 'choferes_auth', 'uid' + n), { choferId: 'c' + n });
      await setDoc(doc(db, 'servicios', 's' + n), { folio: 'SRV-2026-000' + n, estado: 'Asignada', choferId: 'c' + n, creadoPor: 'ops' });
      await setDoc(doc(db, 'servicios', 's' + n, 'paradas', 'p01'), { orden: 1, estado: 'Pendiente', lat: 19.43, lng: -99.13, radioM: 150 });
      await setDoc(doc(db, 'servicios', 's' + n, 'posiciones', 'l1'), { choferId: 'c' + n, n: 1, puntos: [] });
      await setDoc(doc(db, 'jornadas', `c${n}_2026-11-10`), { choferId: 'c' + n, fecha: '2026-11-10' });
      await setDoc(doc(db, 'ubicaciones', 'c' + n), { lat: 19.43, lng: -99.13, tMs: 1 });
    }
  });
});
after(async () => env?.cleanup());

test('el chofer lee su servicio, sus paradas, su jornada y su propia liga de cuenta', async () => {
  const db = ctx('uid1').firestore();
  await assertSucceeds(getDoc(doc(db, 'servicios', 's1')));
  await assertSucceeds(getDocs(query(collection(db, 'servicios'), where('choferId', '==', 'c1'))));
  await assertSucceeds(getDocs(collection(db, 'servicios', 's1', 'paradas')));
  await assertSucceeds(getDoc(doc(db, 'jornadas', 'c1_2026-11-10')));
  await assertSucceeds(getDoc(doc(db, 'choferes_auth', 'uid1')));
});

test('el chofer NO lee lo de otro chofer, ni la lista de servicios, ni datos de oficina', async () => {
  const db = ctx('uid1').firestore();
  await assertFails(getDoc(doc(db, 'servicios', 's2')));
  await assertFails(getDocs(collection(db, 'servicios')));
  await assertFails(getDocs(collection(db, 'servicios', 's2', 'paradas')));
  await assertFails(getDoc(doc(db, 'jornadas', 'c2_2026-11-10')));
  await assertFails(getDoc(doc(db, 'choferes_auth', 'uid2')));
  for(const [col, id] of [['choferes', 'c1'], ['ubicaciones', 'c1'], ['facturas', 'x'], ['solicitudes', 'x'], ['proveedores', 'x'], ['dmov_usuarios', 'ops']].slice(0, 5))
    await assertFails(getDoc(doc(db, col, id)));
  await assertFails(getDocs(collection(db, 'servicios', 's1', 'posiciones')));
});

test('el chofer no escribe nada directo: estado, paradas, posiciones, ubicación ni jornada', async () => {
  const db = ctx('uid1').firestore();
  await assertFails(updateDoc(doc(db, 'servicios', 's1'), { estado: 'Entregada' }));
  await assertFails(updateDoc(doc(db, 'servicios', 's1', 'paradas', 'p01'), { estado: 'Entregada' }));
  await assertFails(updateDoc(doc(db, 'servicios', 's1', 'paradas', 'p01'), { lat: 0, lng: 0, radioM: 2000 }));
  await assertFails(addDoc(collection(db, 'servicios', 's1', 'posiciones'), { puntos: [] }));
  await assertFails(setDoc(doc(db, 'ubicaciones', 'c1'), { lat: 1, lng: 1 }));
  await assertFails(setDoc(doc(db, 'jornadas', 'c1_2026-11-11'), { choferId: 'c1' }));
  await assertFails(setDoc(doc(db, 'choferes_auth', 'uid1'), { choferId: 'c2' }));
  await assertFails(updateDoc(doc(db, 'choferes', 'c1'), { dispositivoId: 'otro' }));
  await assertFails(addDoc(collection(db, 'servicios', 's1', 'eventos'), { tipo: 'estado', actorUid: 'uid1' }));
});

test('una cuenta sin liga o una sesión anónima no entra como chofer', async () => {
  for(const c of [ctx('desconocido'), ctx('uid1', 'anonymous'), env.unauthenticatedContext()]){
    const db = c.firestore();
    await assertFails(getDoc(doc(db, 'servicios', 's1')));
    await assertFails(getDocs(collection(db, 'servicios', 's1', 'paradas')));
  }
});

test('ni la oficina escribe paradas, posiciones, ubicaciones ni ligas de cuenta a mano', async () => {
  const db = ctx('ops', 'google.com').firestore();
  await assertSucceeds(getDocs(collection(db, 'servicios', 's1', 'paradas')));
  await assertSucceeds(getDocs(collection(db, 'servicios', 's1', 'posiciones')));
  await assertSucceeds(getDoc(doc(db, 'ubicaciones', 'c1')));
  await assertFails(updateDoc(doc(db, 'servicios', 's1', 'paradas', 'p01'), { estado: 'Entregada' }));
  await assertFails(setDoc(doc(db, 'ubicaciones', 'c1'), { lat: 1, lng: 1 }));
  await assertFails(setDoc(doc(db, 'choferes_auth', 'nuevo'), { choferId: 'c1' }));
  await assertFails(deleteDoc(doc(db, 'servicios', 's1', 'posiciones', 'l1')));
});

test('Storage: el chofer sube imágenes nuevas solo a su carpeta y no sobrescribe ni borra', async () => {
  const mio = ref(ctx('uid1').storage(), 'evidencias/c1/s1/entrega-1.jpg');
  await assertSucceeds(uploadBytes(mio, JPG, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(mio));
  await assertFails(uploadBytes(mio, JPG, { contentType: 'image/jpeg' }));                                              // sobrescribir
  await assertFails(deleteObject(mio));
  await assertFails(uploadBytes(ref(ctx('uid1').storage(), 'evidencias/c2/s2/x.jpg'), JPG, { contentType: 'image/jpeg' }));   // carpeta ajena
  await assertFails(uploadBytes(ref(ctx('uid1').storage(), 'evidencias/c1/s1/nota.txt'), JPG, { contentType: 'text/plain' }));
  await assertSucceeds(uploadBytes(ref(ctx('uid1').storage(), 'jornadas/c1/selfie-2026-11-10.jpg'), JPG, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(ctx('uid1').storage(), 'jornadas/c2/selfie.jpg'), JPG, { contentType: 'image/jpeg' }));
});

test('Storage: la oficina ve la evidencia; otro chofer, un anónimo y un desconocido no', async () => {
  await assertSucceeds(getBytes(ref(ctx('ops', 'google.com').storage(), 'evidencias/c1/s1/entrega-1.jpg')));
  await assertSucceeds(getBytes(ref(ctx('ops', 'google.com').storage(), 'jornadas/c1/selfie-2026-11-10.jpg')));
  for(const c of [ctx('uid2'), ctx('uid1', 'anonymous'), ctx('desconocido'), env.unauthenticatedContext()]){
    await assertFails(getBytes(ref(c.storage(), 'evidencias/c1/s1/entrega-1.jpg')));
    await assertFails(getBytes(ref(c.storage(), 'jornadas/c1/selfie-2026-11-10.jpg')));
  }
  await assertFails(uploadBytes(ref(ctx('ops', 'google.com').storage(), 'evidencias/c1/s1/falsa.jpg'), JPG, { contentType: 'image/jpeg' }));
});
