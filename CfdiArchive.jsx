import { useEffect, useRef, useState } from 'react';
import { inspectCfdiFiles, matchCfdi } from './cfdi.js';
import { archiveEnabled, archiveCfdiPair, listArchivedCfdi, downloadArchivedCfdi } from './cfdiArchiveStore.js';

// Upload stays behind an explicit rollout flag after private rules are validated.
export default function CfdiArchive({factura,records=[],receptorRfc='',emisorRfc='',db,storage,user,dirty=false}) {
  const [xml,setXml]=useState(null),[pdf,setPdf]=useState(null),[bundle,setBundle]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [expected,setExpected]=useState({emisorRfc,receptorRfc,moneda:factura.moneda||''});
  const [archived,setArchived]=useState([]),[uploading,setUploading]=useState(false),[notice,setNotice]=useState('');
  const enabled=archiveEnabled();
  useEffect(()=>{let closed=false;if(enabled&&db)listArchivedCfdi(db,factura.id).then(rows=>{if(!closed)setArchived(rows);}).catch(e=>{if(!closed)setError(e.message);});return()=>{closed=true;generation.current++;};},[db,factura.id,enabled]);
  const generation=useRef(0);
  useEffect(()=>{if(dirty)setConfirmed(false);},[dirty]);
  const save=async()=>{
    if(dirty){setError("Guarda los cambios y vuelve a abrir el registro antes de archivar.");return;}
    setUploading(true);setError('');setNotice('');
    try {
      const saved=await archiveCfdiPair({db,storage,user,invoice:factura,bundle,xmlFile:xml,pdfFile:pdf,expected,confirmed});
      setArchived(rows=>[...rows.filter(row=>row.uuid!==saved.uuid),saved]);
      setNotice('PDF y XML guardados y vinculados. Estado SAT no consultado.');setConfirmed(false);
    } catch(e){setError(e.message+' Si se reservó el UUID, conserva los mismos archivos para reintentar sin duplicar.');}
    finally {setUploading(false);}
  };
  const download=async(entry,kind)=>{try{await downloadArchivedCfdi(storage,entry,kind);}catch(e){setError(e.message);}};
  const invalidate=()=>{generation.current++;setBundle(null);setError('');setConfirmed(false);setBusy(false);};
  const select=(setter,event)=>{invalidate();setter(event.target.files?.[0]||null);};
  const inspect=async()=>{
    const current=++generation.current;setBusy(true);setError('');setBundle(null);setConfirmed(false);
    try { const result=await inspectCfdiFiles(xml,pdf);if(generation.current===current)setBundle(result); }
    catch(e){if(generation.current===current)setError(e.message);}
    finally {if(generation.current===current)setBusy(false);}
  };
  const match=bundle?matchCfdi(bundle,{...expected,id:factura.id,total:factura.total},records):null;
  const input=(field,label)=><label>{label}<input disabled={uploading} value={expected[field]} onChange={e=>{setExpected(v=>({...v,[field]:e.target.value}));setConfirmed(false);}} style={{display:'block',width:'100%',padding:7}}/></label>;
  return <section aria-label="Expediente fiscal PDF y XML" style={{marginTop:16,padding:14,border:'1px solid #cbd5e1',borderRadius:10,display:'grid',gap:9}}>
    <strong>Factura fiscal · PDF y XML</strong>
    <div>Expediente: {factura.folio||factura.id} · {factura.empresa||factura.cliente} · Total registrado: {factura.total}</div>
    <small>{dirty?"Hay cambios sin guardar: el archivo fiscal está bloqueado. ":""}Trabaja con los datos guardados. Si modificaste el registro, guarda y vuelve a abrirlo antes de cotejar archivos.</small>
    <label>XML original (máximo 4 MB)<input type="file" accept=".xml,application/xml,text/xml" disabled={uploading} onChange={e=>select(setXml,e)}/></label>
    <label>PDF correspondiente (máximo 10 MB)<input type="file" accept=".pdf,application/pdf" disabled={uploading} onChange={e=>select(setPdf,e)}/></label>
    <button type="button" onClick={inspect} disabled={busy||uploading||!xml||!pdf}>{busy?'Revisando localmente…':'Revisar PDF y XML localmente'}</button>
    {error&&<div role="alert" style={{color:'#b91c1c'}}>{error}</div>}
    {bundle&&<>
      <div style={{overflowWrap:'anywhere'}}>
        <div>UUID: {bundle.cfdi.uuid}</div>
        <div>Emisor: {bundle.cfdi.emisorNombre} · {bundle.cfdi.emisorRfc}</div>
        <div>Receptor: {bundle.cfdi.receptorNombre} · {bundle.cfdi.receptorRfc}</div>
        <div>Fecha XML: {bundle.cfdi.fecha} · Timbrado declarado: {bundle.cfdi.fechaTimbrado}</div>
        <div>Serie / folio fiscal: {bundle.cfdi.serie} {bundle.cfdi.folio} · Tipo: {bundle.cfdi.tipoComprobante}</div>
        <div>Total XML: {bundle.cfdi.total} {bundle.cfdi.moneda} · CFDI {bundle.cfdi.version}</div>
        {bundle.cfdi.relaciones.map((r,i)=><div key={i}>Relación {r.tipoRelacion}: {r.uuids.join(', ')}</div>)}
        <div>XML SHA-256: {bundle.xml.sha256}</div><div>PDF SHA-256: {bundle.pdf.sha256}</div>
      </div>
      {input('emisorRfc','RFC emisor esperado, verificado en expediente')}
      {input('receptorRfc','RFC receptor esperado, verificado en expediente')}
      {input('moneda','Moneda esperada, verificada en cotización')}
      {match.errors.map((message,i)=><div key={i} role="alert" style={{color:'#b91c1c'}}>{message}</div>)}
      {match.warnings.map((message,i)=><small key={i}>{message}</small>)}
      <label><input type="checkbox" disabled={dirty||uploading||!match.ready} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Cotejé el PDF con el UUID/RFC/total del XML y ambos corresponden a este expediente</label>
      {confirmed&&match.ready&&<div>Cotejo local confirmado. Los archivos aún no están guardados.</div>}
    </>}
    <button type="button" disabled={dirty||!enabled||!confirmed||!match?.ready||uploading} onClick={save}>{uploading?"Guardando originales…":enabled?"Guardar PDF y XML en expediente":"Guardar en expediente (pendiente de habilitación segura)"}</button>
    {notice&&<div role="status">{notice}</div>}
    <small>{enabled?"Acceso privado de oficina. Sólo Guardar envía los archivos al archivo fiscal.":"La carga está bloqueada hasta verificar acceso privado exclusivo de oficina; la revisión es local."} No emite facturas, no acredita vigencia SAT y no cambia importes ni estados de pago.</small>
    {archived.map(entry=><div key={entry.uuid}><strong>{entry.uuid}</strong> · {entry.estado} · SAT: {entry.cfdi?.estadoSat||"no_consultado"}{entry.estado==="archivado"&&<><button type="button" onClick={()=>download(entry,"pdf")}>Descargar PDF</button><button type="button" onClick={()=>download(entry,"xml")}>Descargar XML</button></>}</div>)}
    {(factura.cfdiDocumentos||[]).length>0&&<div>
      <strong>Referencias fiscales ya registradas</strong>
      {factura.cfdiDocumentos.map((entry,index)=><div key={entry.uuid||index}>{entry.uuid||entry.cfdi?.uuid||'Sin UUID'} · Estado SAT: {entry.estadoSat||entry.cfdi?.estadoSat||'no consultado'}</div>)}
    </div>}
  </section>;
}
