import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, getMetadata, deleteObject } from 'firebase/storage';
import { reserveCfdi, invoiceArchiveFingerprint } from '../cfdiArchiveStore.js';
let env;
const projectId='demo-dmov-archive';
const UUID='12345678-1234-1234-1234-123456789ABC', XML='a'.repeat(64), PDF='b'.repeat(64);
const token={email:'admin@example.invalid',email_verified:true,firebase:{sign_in_provider:'google.com'}};
const context=(uid,provider='google.com')=>env.authenticatedContext(uid,{...token,firebase:{sign_in_provider:provider}});
const admin=()=>context('admin');
const metadata={contentType:'application/xml',customMetadata:{uuid:UUID,facturaId:'invoice',sha256:XML}};
const pending={uuid:UUID,facturaId:'invoice',facturaFolio:'FAC-1',facturaFingerprint:invoiceArchiveFingerprint({id:'invoice',empresa:'Example SA',total:116}),facturaTotal:116,empresa:'Example SA',cfdi:{estadoSat:'no_consultado'},xml:{sha256:XML},pdf:{sha256:PDF},estado:'pendiente',createdBy:'admin'};
before(async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8087,rules:readFileSync('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:9197,rules:readFileSync('storage.rules','utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   for(const [uid,rol,activo] of [['admin','admin',true],['ops','operaciones',true],['inactive','admin',false],['driver','chofer',true]])
     await setDoc(doc(db,'dmov_usuarios',uid),{uid,rol,activo,email:uid+'@example.invalid',nombre:uid});
   await setDoc(doc(db,'facturas','invoice'),{empresa:'Example SA',total:116});
 });
});
after(async()=>env?.cleanup());

test('deny unauthenticated, anonymous, inactive, operations and driver registry reads',async()=>{
 for(const ctx of [env.unauthenticatedContext(),context('admin','anonymous'),context('inactive'),context('ops'),context('driver'),context('stranger')])
   await assertFails(getDoc(doc(ctx.firestore(),'cfdi_archivo',UUID)));
});
test('deny self-promotion and activation',async()=>{
 await assertFails(updateDoc(doc(context('ops').firestore(),'dmov_usuarios','ops'),{rol:'admin'}));
 await assertFails(updateDoc(doc(context('inactive').firestore(),'dmov_usuarios','inactive'),{activo:true}));
 await assertFails(setDoc(doc(context('stranger').firestore(),'dmov_usuarios','stranger'),{uid:'stranger',email:'admin@example.invalid',rol:'admin',activo:true}));
});
test('admin cannot accidentally deactivate/demote/delete own profile',async()=>{
 await assertFails(updateDoc(doc(admin().firestore(),'dmov_usuarios','admin'),{activo:false}));
 await assertFails(updateDoc(doc(admin().firestore(),'dmov_usuarios','admin'),{rol:'operaciones'}));
 await assertFails(deleteDoc(doc(admin().firestore(),'dmov_usuarios','admin')));
});
test('existing active admin can read and maintain own nonprivileged fields',async()=>{
 await assertSucceeds(getDoc(doc(admin().firestore(),'dmov_usuarios','admin')));
 await assertSucceeds(updateDoc(doc(admin().firestore(),'dmov_usuarios','admin'),{nombre:'Verified Admin'}));
});
test('new user can only create an inactive operations profile with own verified email',async()=>{
 const db=context('new-user').firestore();
 await assertSucceeds(setDoc(doc(db,'dmov_usuarios','new-user'),{uid:'new-user',email:'admin@example.invalid',nombre:'New',rol:'operaciones',activo:false,createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db,'dmov_usuarios','new-user'),{email:'someone-else@example.invalid'}));
});
test('UUID registry and hashes reserved atomically for matching invoice',async()=>{
 const db=admin().firestore();
 await assertSucceeds(runTransaction(db,async tx=>{
   tx.update(doc(db,'facturas','invoice'),{cfdiArchiveLocked:true});
   tx.set(doc(db,'cfdi_archivo',UUID),{...pending,createdAt:serverTimestamp(),actualizadoAt:serverTimestamp()});
   tx.set(doc(db,'cfdi_hashes',XML),{uuid:UUID,facturaId:'invoice'});
   tx.set(doc(db,'cfdi_hashes',PDF),{uuid:UUID,facturaId:'invoice'});
 }));
});
test('registry cannot be overwritten or deleted, even by admin',async()=>{
 const db=admin().firestore();
 await assertFails(updateDoc(doc(db,'cfdi_archivo',UUID),{facturaId:'other'}));
 await assertFails(deleteDoc(doc(db,'cfdi_archivo',UUID)));
 await assertFails(setDoc(doc(db,'cfdi_hashes',XML),{uuid:'OTHER',facturaId:'other'}));
});
test('no archive upload for unauthenticated, anonymous, inactive, operations or driver',async()=>{
 for(const ctx of [env.unauthenticatedContext(),context('admin','anonymous'),context('inactive'),context('ops'),context('driver')])
   await assertFails(uploadBytes(ref(ctx.storage(),`cfdi/${UUID}/original.xml`),new TextEncoder().encode('<xml/>'),metadata));
});
test('wrong MIME, unexpected path, mismatched hash and oversized XML denied',async()=>{
 const store=admin().storage();
 await assertFails(uploadBytes(ref(store,`cfdi/${UUID}/original.xml`),new Uint8Array([1]),{...metadata,contentType:'text/html'}));
 await assertFails(uploadBytes(ref(store,`cfdi/${UUID}/other.xml`),new Uint8Array([1]),metadata));
 await assertFails(uploadBytes(ref(store,`cfdi/${UUID}/original.xml`),new Uint8Array([1]),{...metadata,customMetadata:{...metadata.customMetadata,sha256:'c'.repeat(64)}}));
 await assertFails(uploadBytes(ref(store,`cfdi/${UUID}/original.xml`),new Uint8Array(4*1024*1024+1),metadata));
});
test('admin uploads a reserved XML; authenticated download works',async()=>{
 const object=ref(admin().storage(),`cfdi/${UUID}/original.xml`);
 await assertSucceeds(uploadBytes(object,new TextEncoder().encode('<xml/>'),metadata));
 const bytes=await assertSucceeds(getBytes(object));assert.equal(bytes.byteLength,6);
});
test('private archive does not leak through legacy wildcard read',async()=>{
 for(const ctx of [env.unauthenticatedContext(),context('admin','anonymous'),context('ops'),context('driver'),context('stranger')])
   await assertFails(getBytes(ref(ctx.storage(),`cfdi/${UUID}/original.xml`)));
});
test('archive originals cannot be overwritten or deleted',async()=>{
 const object=ref(admin().storage(),`cfdi/${UUID}/original.xml`);
 await assertFails(uploadBytes(object,new TextEncoder().encode('<changed/>'),metadata));
 await assertFails(deleteObject(object));
});
test('operational image evidence permissions remain available for authenticated drivers',async()=>{
 const object=ref(context('driver','anonymous').storage(),'evidencias/driver-test.jpg');
 await assertSucceeds(uploadBytes(object,new Uint8Array([255,216,255]),{contentType:'image/jpeg'}));
 await assertSucceeds(getBytes(object));
});


test('concurrent duplicate UUID for different invoices admits only one origin',async()=>{
 const id='AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',xh='c'.repeat(64),ph='d'.repeat(64),db=admin().firestore();
 await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'facturas','other-invoice'),{empresa:'Example SA',total:116});});
 const pair={cfdi:{uuid:id,estadoSat:'no_consultado'},xml:{sha256:xh},pdf:{sha256:ph}};
 const reserve=invoiceId=>runTransaction(db,tx=>reserveCfdi(tx,[doc(db,'facturas',invoiceId),doc(db,'cfdi_archivo',id),doc(db,'cfdi_hashes',xh),doc(db,'cfdi_hashes',ph)],{id:invoiceId,empresa:'Example SA',total:116},pair,'admin',serverTimestamp()));
 const results=await Promise.allSettled([reserve('invoice'),reserve('other-invoice')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
});

test('interrupted pair can resume its missing PDF without overwriting XML or duplicate registry',async()=>{
 const db=admin().firestore(),store=admin().storage();
 const before=await getDoc(doc(db,'cfdi_archivo',UUID));
 const pair={cfdi:{uuid:UUID,estadoSat:'no_consultado'},xml:{sha256:XML},pdf:{sha256:PDF}};
 const resumed=await runTransaction(db,tx=>reserveCfdi(tx,[doc(db,'facturas','invoice'),doc(db,'cfdi_archivo',UUID),doc(db,'cfdi_hashes',XML),doc(db,'cfdi_hashes',PDF)],{id:'invoice',empresa:'Example SA',total:116},pair,'admin',serverTimestamp()));
 assert.equal(resumed.estado,'pendiente');
 const metadata=await getMetadata(ref(store,`cfdi/${UUID}/original.xml`));assert.equal(metadata.customMetadata.sha256,XML);
 await assertSucceeds(uploadBytes(ref(store,`cfdi/${UUID}/original.pdf`),new TextEncoder().encode('%PDF-1.7'),{contentType:'application/pdf',customMetadata:{uuid:UUID,facturaId:'invoice',sha256:PDF}}));
 await assertSucceeds(updateDoc(doc(db,'cfdi_archivo',UUID),{estado:'archivado',actualizadoAt:serverTimestamp()}));
 const after=await getDoc(doc(db,'cfdi_archivo',UUID));assert.equal(after.data().createdAt.toMillis(),before.data().createdAt.toMillis());assert.equal(after.data().estado,'archivado');
});


test('linked invoice financial identity cannot change or be deleted but payment notes remain editable',async()=>{
 const db=admin().firestore();
 await assertFails(updateDoc(doc(db,'facturas','invoice'),{empresa:'Different company'}));
 await assertFails(updateDoc(doc(db,'facturas','invoice'),{total:200}));
 await assertFails(updateDoc(doc(db,'facturas','invoice'),{cfdiArchiveLocked:false}));
 await assertFails(deleteDoc(doc(db,'facturas','invoice')));
 await assertSucceeds(updateDoc(doc(db,'facturas','invoice'),{notas:'Originals linked',status:'Pendiente'}));
});
