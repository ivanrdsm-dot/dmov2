import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { getBlob, getMetadata, ref, uploadBytes } from 'firebase/storage';
import { inspectCfdiFiles, matchCfdi } from './cfdi.js';

export const archiveEnabled = () => import.meta.env.VITE_CFDI_ARCHIVE_ENABLED === 'true';
export const invoiceArchiveFingerprint = invoice => JSON.stringify([
  invoice.id,invoice.empresa,invoice._clienteId||'',invoice.planOverride||invoice.plan||'',
  invoice.periodoServicio||'',invoice.solicitante||'',invoice.solicitanteVerificado||'',invoice.cuentaProyecto||'',
  Number(invoice.subtotal??invoice.monto),Number(invoice.ivaAmt),Number(invoice.total),
  invoice.mesOp||'',String(invoice.anio||''),invoice.servicio||'',invoice.sinPlan===true,invoice.moneda||'',
]);

// A pending UUID reservation is intentionally retained on partial upload failure.
// Retrying the same pair on the same invoice resumes; it never replaces files.
export async function reserveCfdi(tx, refs, invoice, bundle, uid, timestamp) {
  const [live,existing,xmlHash,pdfHash]=await Promise.all(refs.map(reference=>tx.get(reference)));
  if(!live.exists())throw new Error('El expediente ya no existe.');
  const current={...live.data(),id:invoice.id};
  if(invoiceArchiveFingerprint(current)!==invoiceArchiveFingerprint(invoice))throw new Error('El expediente cambió. Vuelve a abrirlo y coteja otra vez.');
  if(existing.exists()) {
    const saved=existing.data();
    if(saved.facturaFingerprint!==invoiceArchiveFingerprint(current))throw new Error('El expediente ya no coincide con la reserva fiscal. Requiere revisión.');
    if(saved.facturaId!==invoice.id||saved.xml.sha256!==bundle.xml.sha256||saved.pdf.sha256!==bundle.pdf.sha256)
      throw new Error('UUID ya registrado con otro expediente o archivos distintos.');
    if(saved.createdBy!==uid&&saved.estado!=='archivado')throw new Error('La carga pendiente pertenece a otro usuario; requiere revisión.');
    return saved;
  }
  if(xmlHash.exists()||pdfHash.exists())throw new Error('Uno de los archivos ya está registrado; no se duplicará.');
  const data={uuid:bundle.cfdi.uuid,facturaId:invoice.id,facturaFolio:invoice.folio||'',
    facturaFingerprint:invoiceArchiveFingerprint(invoice),facturaTotal:Number(invoice.total),empresa:invoice.empresa||'',...bundle,estado:'pendiente',createdBy:uid,createdAt:timestamp,actualizadoAt:timestamp};
  tx.update(refs[0],{cfdiArchiveLocked:true});
  tx.set(refs[1],data);
  tx.set(refs[2],{uuid:data.uuid,facturaId:invoice.id});tx.set(refs[3],{uuid:data.uuid,facturaId:invoice.id});
  return data;
}
export async function archiveCfdiPair({db,storage,user,invoice,bundle,xmlFile,pdfFile,expected,confirmed}) {
  if(!archiveEnabled())throw new Error('Archivo fiscal aún no habilitado después de la validación de permisos.');
  if(!confirmed||!user?.uid||user.isAnonymous)throw new Error('Falta sesión de oficina o cotejo explícito.');
  const checked=await inspectCfdiFiles(xmlFile,pdfFile);
  if(checked.xml.sha256!==bundle.xml.sha256||checked.pdf.sha256!==bundle.pdf.sha256)throw new Error('Los archivos cambiaron. Vuelve a cotejarlos.');
  const match=matchCfdi(checked,{...expected,id:invoice.id,total:invoice.total});
  if(!match.ready)throw new Error(match.errors.join('\n'));
  const uuid=checked.cfdi.uuid;
  const refs=[doc(db,'facturas',invoice.id),doc(db,'cfdi_archivo',uuid),doc(db,'cfdi_hashes',checked.xml.sha256),doc(db,'cfdi_hashes',checked.pdf.sha256)];
  const saved=await runTransaction(db,tx=>reserveCfdi(tx,refs,invoice,checked,user.uid,serverTimestamp()));
  if(saved.estado==='archivado')return saved;
  for(const [kind,file,mime] of [['xml',xmlFile,'application/xml'],['pdf',pdfFile,'application/pdf']]) {
    const object=ref(storage,`cfdi/${uuid}/original.${kind}`);
    let metadata;
    try { metadata=await getMetadata(object); }
    catch(error) { if(error.code!=='storage/object-not-found')throw error; }
    if(metadata) {
      if(metadata.customMetadata?.sha256!==checked[kind].sha256||metadata.size!==checked[kind].bytes)
        throw new Error('Existe un archivo diferente en el destino. No se sobrescribió.');
    } else {
      await uploadBytes(object,file,{contentType:mime,customMetadata:{uuid,facturaId:invoice.id,sha256:checked[kind].sha256}});
    }
  }
  await runTransaction(db,async tx=>{
    const [record,currentInvoice]=await Promise.all([tx.get(refs[1]),tx.get(refs[0])]);
    if(!currentInvoice.exists()||invoiceArchiveFingerprint({...currentInvoice.data(),id:invoice.id})!==saved.facturaFingerprint)
      throw new Error("El expediente cambió durante la carga; los archivos quedaron pendientes de revisión.");
    if(!record.exists()||record.data().facturaId!==invoice.id)throw new Error('El vínculo fiscal cambió. Requiere revisión.');
    if(record.data().estado==='archivado')return;
    tx.update(refs[1],{estado:'archivado',actualizadoAt:serverTimestamp()});
  });
  return {...saved,estado:'archivado'};
}
export async function listArchivedCfdi(db,invoiceId) {
  const records=await getDocs(query(collection(db,'cfdi_archivo'),where('facturaId','==',invoiceId)));
  return records.docs.map(entry=>entry.data());
}
export async function downloadArchivedCfdi(storage,entry,kind) {
  if(!['xml','pdf'].includes(kind)||entry.estado!=='archivado')throw new Error('Archivo no disponible.');
  // Authenticated bytes only: never generate shareable Firebase download tokens.
  const bytes=await getBlob(ref(storage,`cfdi/${entry.uuid}/original.${kind}`),kind==='xml'?4*1024*1024:10*1024*1024);
  const url=URL.createObjectURL(bytes),anchor=document.createElement('a');
  try {anchor.href=url;anchor.download=`${entry.uuid}.${kind}`;anchor.click();}
  finally {setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
