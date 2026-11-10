import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { crearServiciosStore } from '../serviciosStore.js';

let env;
const projectId = 'demo-dmov-archive';
const token = { email: 'user@example.invalid', email_verified: true };
const ctx = (uid, provider = 'google.com') => env.authenticatedContext(uid, { ...token, firebase: { sign_in_provider: provider } });
const usuario = (uid, rol) => ({ uid, rol, nombre: uid });
const datos = { canal: 'Slack', recibidaEn: '2026-11-10T09:00', empresa: 'Example SA', solicitante: 'Persona Ejemplo',
  origenes: [{ direccion: 'Calle 1' }], destinos: [{ direccion: 'Calle 2' }] };
const anio = new Date().getFullYear();
let creado;

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for(const [uid, rol, activo] of [['admin', 'admin', true], ['ops', 'operaciones', true], ['inactive', 'operaciones', false]])
      await setDoc(doc(db, 'dmov_usuarios', uid), { uid, rol, activo, email: uid + '@example.invalid', nombre: uid });
  });
});
after(async () => env?.cleanup());

test('operaciones registra servicios con folio consecutivo y evento de creación', async () => {
  const store = crearServiciosStore(ctx('ops').firestore());
  creado = await assertSucceeds(store.crear(usuario('ops', 'operaciones'), datos));
  assert.equal(creado.folio, `SRV-${anio}-0001`);
  const segundo = await assertSucceeds(store.crear(usuario('ops', 'operaciones'), datos));
  assert.equal(segundo.folio, `SRV-${anio}-0002`);
  const db = ctx('ops').firestore();
  const snap = await assertSucceeds(getDoc(doc(db, 'servicios', creado.id)));
  assert.equal(snap.data().estado, 'Solicitud');
  assert.equal(snap.data().creadoPor, 'ops');
  const eventos = await assertSucceeds(getDocs(collection(db, 'servicios', creado.id, 'eventos')));
  assert.equal(eventos.size, 1);
  assert.equal(eventos.docs[0].data().tipo, 'creado');
});

test('sin sesión, sesión anónima, perfil inactivo y desconocidos no leen ni registran servicios', async () => {
  for(const c of [env.unauthenticatedContext(), ctx('ops', 'anonymous'), ctx('inactive'), ctx('stranger')]){
    const db = c.firestore();                      // una sola instancia por contexto
    await assertFails(getDoc(doc(db, 'servicios', creado.id)));
    await assertFails(getDocs(collection(db, 'servicios', creado.id, 'eventos')));
  }
  await assertFails(crearServiciosStore(ctx('inactive').firestore()).crear(usuario('inactive', 'operaciones'), datos));
});

test('un servicio no se crea con folio ajeno al contador, ni a nombre de otro, ni ya avanzado', async () => {
  const db = ctx('ops').firestore();
  const cuerpo = { ...datos, folio: `SRV-${anio}-0099`, estado: 'Solicitud', creadoPor: 'ops', creadoEn: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'servicios', 'falso'), cuerpo));
  await assertFails(setDoc(doc(db, 'servicios', 'falso'), { ...cuerpo, folio: `SRV-${anio}-0002` }));          // folio ya emitido: no se reutiliza
  await assertFails(setDoc(doc(db, 'servicios', 'falso'), { ...cuerpo, folio: `SRV-${anio}-0002`, creadoPor: 'admin' }));
  await assertFails(setDoc(doc(db, 'servicios', 'falso'), { ...cuerpo, folio: `SRV-${anio}-0002`, estado: 'Cobrada' }));
});

test('el contador de folios solo avanza de uno en uno y no se borra', async () => {
  const ref = doc(ctx('ops').firestore(), 'contadores', 'servicios-' + anio);
  await assertFails(updateDoc(ref, { n: 10 }));
  await assertFails(updateDoc(ref, { n: 1 }));
  await assertFails(deleteDoc(doc(ctx('admin').firestore(), 'contadores', 'servicios-' + anio)));
});

test('operaciones edita y cambia estado, pero no fija el precio aprobado', async () => {
  const db = ctx('ops').firestore();
  const store = crearServiciosStore(db);
  const antes = { id: creado.id, ...datos, estado: 'Solicitud' };
  assert.equal(await assertSucceeds(store.actualizar(usuario('ops', 'operaciones'), antes, { ...datos, precioPropuesto: 4000, notas: 'Andén 3' })), 2);
  await assertSucceeds(store.cambiarEstado(usuario('ops', 'operaciones'), antes, 'Cotizada', { motivo: 'Urgente', faltantes: ['Folio de cotización'] }));
  await assertFails(updateDoc(doc(db, 'servicios', creado.id), { precio: 4640 }));
  await assertFails(updateDoc(doc(db, 'servicios', creado.id), { precioAprobadoPor: 'ops' }));
  await assertFails(store.aprobarPrecio(usuario('ops', 'admin'), antes, 4640));
});

test('admin aprueba el precio y queda en la bitácora', async () => {
  const db = ctx('admin').firestore();
  await assertSucceeds(crearServiciosStore(db).aprobarPrecio(usuario('admin', 'admin'), { id: creado.id }, 4640));
  const snap = await getDoc(doc(db, 'servicios', creado.id));
  assert.equal(snap.data().precio, 4640);
  assert.equal(snap.data().precioAprobadoPor, 'admin');
  const eventos = await getDocs(collection(db, 'servicios', creado.id, 'eventos'));
  assert.deepEqual(eventos.docs.map(d => d.data().tipo).sort(), ['creado', 'editado', 'estado', 'precio_aprobado']);
});

test('folio, autor y fecha de creación son inmutables; nadie borra un servicio', async () => {
  for(const c of [ctx('ops'), ctx('admin')]){
    const ref = doc(c.firestore(), 'servicios', creado.id);
    await assertFails(updateDoc(ref, { folio: `SRV-${anio}-9999` }));
    await assertFails(updateDoc(ref, { creadoPor: 'otro' }));
    await assertFails(updateDoc(ref, { creadoEn: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
  }
});

test('la bitácora solo se agrega: con autor real, hora del servidor y sin reescritura', async () => {
  const db = ctx('ops').firestore();
  const eventos = collection(db, 'servicios', creado.id, 'eventos');
  await assertFails(addDoc(eventos, { tipo: 'estado', actorUid: 'admin', ts: serverTimestamp() }));
  await assertFails(addDoc(eventos, { tipo: 'estado', actorUid: 'ops', ts: new Date(2020, 0, 1) }));
  const uno = (await getDocs(eventos)).docs[0].ref;
  for(const c of [db, ctx('admin').firestore()]){
    await assertFails(updateDoc(doc(c, uno.path), { tipo: 'alterado' }));
    await assertFails(deleteDoc(doc(c, uno.path)));
  }
});
