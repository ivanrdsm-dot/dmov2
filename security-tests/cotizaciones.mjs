import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { crearCotizacionesStore, COLECCION_COTIZACIONES as COL } from '../cotizacionesStore.js';
import { crearServiciosStore } from '../serviciosStore.js';

/* Cotizaciones: la oficina propone, solo un admin aprueba el precio, el cálculo
   guardado no se toca y el precio de un servicio puede heredarse de una aceptada. */
let env, dbAdmin, dbOps, sAdmin, sOps;
const projectId = 'demo-dmov-archive';
const ctx = (uid, provider = 'google.com') => env.authenticatedContext(uid, { email: uid + '@example.invalid', email_verified: true, firebase: { sign_in_provider: provider } });
const usuario = (uid, rol) => ({ uid, rol, nombre: uid });
const ADMIN = usuario('admin', 'admin'), OPS = usuario('ops', 'operaciones');
const resultado = { unidadClave: 'sprinter', unidadNombre: 'Mercedes Sprinter', unidades: 1, conProveedor: false, tarimas: 2, pesoKg: 800, volumenM3: null,
  maniobra: null, ayudantes: 0, motivoUnidad: 'Ejemplo', conceptos: [{ concepto: 'Viaje local', detalle: '1 unidad', monto: 3600 }],
  subtotalBase: 3600, gananciaPct: 0, precio: 3600, iva: 576, total: 4176, supuestos: [], pendientes: [], lista: true };
const datos = { empresa: 'Cliente Ejemplo', solicitante: 'Persona', entrada: { modo: 'Tarimas', tarimas: '2' }, resultado };
const leer = async (db, id) => ({ id, ...(await getDoc(doc(db, COL, id))).data() });
let cot;

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8087, rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for(const [uid, rol] of [['admin', 'admin'], ['ops', 'operaciones']]) await setDoc(doc(db, 'dmov_usuarios', uid), { uid, rol, activo: true, email: uid + '@example.invalid', nombre: uid });
  });
  dbAdmin = ctx('admin').firestore(); dbOps = ctx('ops').firestore();
  sAdmin = crearCotizacionesStore(dbAdmin); sOps = crearCotizacionesStore(dbOps);
});
after(async () => env?.cleanup());

test('operaciones guarda la propuesta con folio consecutivo y sin precio aprobado', async () => {
  cot = await assertSucceeds(sOps.crear(OPS, datos));
  assert.equal(cot.folio, 'COT-' + new Date().getFullYear() + '-0001');
  const otra = await assertSucceeds(sOps.crear(OPS, datos));
  assert.equal(otra.folio.slice(-4), '0002');
  const d = await leer(dbOps, cot.id);
  assert.equal(d.estado, 'Propuesta'); assert.equal(d.precioPropuesto, 3600); assert.equal(d.precioAprobado, undefined);
  assert.equal((await getDocs(collection(dbOps, COL, cot.id, 'eventos'))).size, 1);
});

test('nadie crea una cotización ya aprobada, con folio inventado o sin sesión de oficina', async () => {
  const base = { ...datos, folio: 'COT-2026-9999', estado: 'Propuesta', precioPropuesto: 3600, creadoPor: 'ops' };
  await assertFails(setDoc(doc(dbOps, COL, 'x1'), base));
  await assertFails(setDoc(doc(dbOps, COL, 'x2'), { ...base, precioAprobado: 1 }));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), COL, cot.id)));
  await assertFails(getDoc(doc(ctx('anon', 'anonymous').firestore(), COL, cot.id)));
});

test('operaciones no aprueba ni fija el precio; no puede enviar una propuesta sin aprobar', async () => {
  const d = await leer(dbOps, cot.id);
  await assert.rejects(sOps.aprobar(OPS, d, 3600), /administrador/);
  await assertFails(updateDoc(doc(dbOps, COL, cot.id), { estado: 'Aprobada', precioAprobado: 1, aprobadoPor: 'ops', aprobadoEn: new Date() }));
  await assertFails(updateDoc(doc(dbOps, COL, cot.id), { precioAprobado: 1 }));
  await assertFails(updateDoc(doc(dbOps, COL, cot.id), { estado: 'Enviada' }));
  await assertFails(updateDoc(doc(dbOps, COL, cot.id), { estado: 'Aceptada' }));
});

test('el cálculo guardado y el folio no se pueden cambiar, ni por un admin; nadie borra', async () => {
  for(const cambio of [{ resultado: { ...resultado, precio: 1 } }, { entrada: {} }, { precioPropuesto: 1 }, { folio: 'COT-2026-0009' }, { empresa: 'Otra' }])
    await assertFails(updateDoc(doc(dbAdmin, COL, cot.id), cambio));
  await assertFails(deleteDoc(doc(dbAdmin, COL, cot.id)));
});

test('admin aprueba con su precio; después cualquiera de oficina la envía y registra la respuesta', async () => {
  await assertFails(updateDoc(doc(dbAdmin, COL, cot.id), { estado: 'Aprobada' }));          // aprobar sin precio no existe
  await assertFails(updateDoc(doc(dbAdmin, COL, cot.id), { estado: 'Aprobada', precioAprobado: 3900, aprobadoPor: 'otro',
    aprobadoPorUid: 'otro', aprobadoEn: serverTimestamp() }));                                // nadie aprueba a nombre de otro
  await assertSucceeds(sAdmin.aprobar(ADMIN, await leer(dbAdmin, cot.id), 3900, 'Ajuste por temporada'));
  let d = await leer(dbOps, cot.id);
  assert.equal(d.estado, 'Aprobada'); assert.equal(d.precioAprobado, 3900); assert.equal(d.aprobadoPor, 'admin'); assert.equal(d.aprobadoPorUid, 'admin');
  await assertFails(updateDoc(doc(dbAdmin, COL, cot.id), { precioAprobado: 5000 }));         // ya aprobada: el precio no se mueve
  await assertFails(updateDoc(doc(dbOps, COL, cot.id), { servicioId: 's', servicioFolio: 'SRV-2026-0001' }));   // aún no aceptada
  await assertSucceeds(sOps.cambiarEstado(OPS, d, 'Enviada'));
  d = await leer(dbOps, cot.id);
  await assert.rejects(sOps.cambiarEstado(OPS, d, 'Rechazada'), /motivo/);
  await assertSucceeds(sOps.cambiarEstado(OPS, d, 'Aceptada'));
  d = await leer(dbOps, cot.id);
  await assertFails(updateDoc(doc(dbOps, COL, cot.id), { estado: 'Cancelada' }));            // una aceptada ya no cambia
  await assertFails(updateDoc(doc(dbAdmin, COL, cot.id), { estado: 'Propuesta' }));
  const ev = await getDocs(collection(dbOps, COL, cot.id, 'eventos'));
  assert.deepEqual(ev.docs.map(e => e.data().tipo).sort(), ['creada', 'estado', 'estado', 'precio_aprobado']);
});

test('la bitácora solo se agrega, con autor real y hora del servidor', async () => {
  const ev = await getDocs(collection(dbOps, COL, cot.id, 'eventos'));
  await assertFails(updateDoc(ev.docs[0].ref, { tipo: 'otro' }));
  await assertFails(deleteDoc(ev.docs[0].ref));
  await assertFails(setDoc(doc(collection(dbOps, COL, cot.id, 'eventos')), { tipo: 'x', actorUid: 'admin', ts: new Date() }));
});

test('un servicio hereda el precio de la cotización aceptada solo si coincide exacto', async () => {
  const srv = crearServiciosStore(dbOps);
  const d = await leer(dbOps, cot.id);
  const base = { canal: 'Correo', recibidaEn: '2026-01-05T10:00', empresa: 'Cliente Ejemplo', cotizacionId: cot.id, cotizacionFolio: d.folio, precioAprobadoPor: d.aprobadoPor };
  await assertFails(srv.crear(OPS, { ...base, precio: 1 }));                                 // precio distinto al aprobado
  await assertFails(srv.crear(OPS, { ...base, precio: 3900, precioAprobadoPor: 'ops' }));    // otro aprobador
  const otra = await sOps.crear(OPS, datos);                                                  // propuesta sin aprobar
  await assertFails(srv.crear(OPS, { ...base, cotizacionId: otra.id, cotizacionFolio: otra.folio, precio: 3600 }));
  await assertFails(srv.crear(OPS, { ...base, empresa: 'Otro cliente', precio: 3900 }));        // el precio de un cliente no pasa a otro
  const s = await assertSucceeds(srv.crear(OPS, { ...base, precio: 3900 }));
  assert.equal((await getDoc(doc(dbOps, 'servicios', s.id))).data().precio, 3900);
  await assertSucceeds(sOps.vincularServicio(OPS, d, s));
  assert.equal((await leer(dbOps, cot.id)).servicioFolio, s.folio);
  await assertFails(updateDoc(doc(dbOps, COL, cot.id), { servicioId: 'otro' }));             // se liga una sola vez
  await assertFails(srv.crear(OPS, { ...base, precio: 3900 }));                               // ya ligada: no se crea un segundo servicio con su precio
});
