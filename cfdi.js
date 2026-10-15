// Parse locally only. Structural extraction is NOT SAT signature/status validation.
export const CFDI_NAMESPACES = { '3.3':'http://www.sat.gob.mx/cfd/3', '4.0':'http://www.sat.gob.mx/cfd/4' };
const TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const attr = (node,name) => (node.getAttribute(name)||'').trim();
const children = (node,ns,name) => Array.from(node.childNodes||[]).filter(n=>n.nodeType===1 && n.namespaceURI===ns && n.localName===name);
const one = (node,ns,name) => { const found=children(node,ns,name); if(found.length!==1) throw new Error(`XML: se requiere un único ${name}.`); return found[0]; };
const required = (node,name) => { const value=attr(node,name); if(!value)throw new Error(`XML: falta ${name}.`);return value; };
const uuid = value => { if(!UUID.test(value))throw new Error('XML: UUID inválido.');return value.toUpperCase(); };
const rfc = value => { const normalized=value.toUpperCase();if(!RFC.test(normalized))throw new Error('XML: RFC inválido.');return normalized; };
export function decimalMicros(value) {
  const source=String(value??'');
  if(!/^\d{1,16}(\.\d{1,6})?$/.test(source))throw new Error('Importe decimal inválido.');
  const [whole,fraction='']=source.split('.');
  return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
}
function decimal(node,name){const value=required(node,name);decimalMicros(value);return value;}
function dateTime(value) {
  const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  const parsed=match?new Date(match[1]+'T00:00:00Z'):null;
  if(!match || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==match[1] || +match[2]>23 || +match[3]>59 || +match[4]>59)
    throw new Error('XML: fecha inválida.');
  return value; // CFDI dates have no timezone: preserve the source exactly.
}
export function parseCfdi(xml, Parser=globalThis.DOMParser) {
  if(typeof xml!=='string'||new TextEncoder().encode(xml).length>4*1024*1024)throw new Error('XML vacío o mayor a 4 MB.');
  if(!xml.trim() || /\u0000|<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XML inseguro: no se permiten DTD ni entidades.');
  const withoutDeclaration=xml.replace(/^\uFEFF?\s*<\?xml\s[^?]*\?>/i,'');
  if(/<\?/.test(withoutDeclaration))throw new Error('XML inseguro: instrucciones de procesamiento no permitidas.');
  if(!Parser)throw new Error('El navegador no dispone de un analizador XML.');
  let document;
  try { document=new Parser().parseFromString(xml,'application/xml'); }
  catch { throw new Error('XML mal formado.'); }
  if(!document?.documentElement || document.getElementsByTagName('parsererror').length || document.getElementsByTagNameNS('*','parsererror').length)
    throw new Error('XML mal formado.');
  const root=document.documentElement;
  const version=required(root,'Version'), ns=CFDI_NAMESPACES[version];
  if(!ns || root.namespaceURI!==ns || root.localName!=='Comprobante')throw new Error('Sólo se aceptan comprobantes CFDI 3.3/4.0 con namespace SAT.');
  if(document.getElementsByTagNameNS(ns,'Comprobante').length!==1)throw new Error('XML: comprobantes anidados no permitidos.');
  const emisor=one(root,ns,'Emisor'), receptor=one(root,ns,'Receptor');
  const complemento=one(root,ns,'Complemento'), timbre=one(complemento,TFD,'TimbreFiscalDigital');
  if(document.getElementsByTagNameNS(TFD,'TimbreFiscalDigital').length!==1)throw new Error('XML: timbres ambiguos.');
  const type=required(root,'TipoDeComprobante');
  if(!['I','E','T','N','P'].includes(type))throw new Error('XML: tipo de comprobante inválido.');
  const currency=required(root,'Moneda');
  if(!/^[A-Z]{3}$/.test(currency))throw new Error('XML: moneda inválida.');
  const relationships=children(root,ns,'CfdiRelacionados').map(group=>{
    const relation=required(group,'TipoRelacion');
    if(!/^0[1-9]$/.test(relation))throw new Error('XML: tipo de relación inválido.');
    const related=children(group,ns,'CfdiRelacionado').map(n=>uuid(required(n,'UUID')));
    if(!related.length)throw new Error('XML: relación sin UUID.');
    return {tipoRelacion:relation,uuids:related};
  });
  return {
    version,uuid:uuid(required(timbre,'UUID')),serie:attr(root,'Serie'),folio:attr(root,'Folio'),
    emisorRfc:rfc(required(emisor,'Rfc')),emisorNombre:attr(emisor,'Nombre'),
    receptorRfc:rfc(required(receptor,'Rfc')),receptorNombre:attr(receptor,'Nombre'),
    subtotal:decimal(root,'SubTotal'),descuento:attr(root,'Descuento')?decimal(root,'Descuento'):'0',
    total:decimal(root,'Total'),moneda:currency,tipoComprobante:type,
    fecha:dateTime(required(root,'Fecha')),fechaTimbrado:dateTime(required(timbre,'FechaTimbrado')),
    relaciones:relationships,esSustitucion:relationships.some(r=>r.tipoRelacion==='04'),
    estadoSat:'no_consultado',validacion:'estructura_extraida_no_validacion_fiscal',
  };
}
export async function sha256(bytes, cryptoApi=globalThis.crypto) {
  if(!cryptoApi?.subtle)throw new Error('Se requiere un contexto seguro para calcular SHA-256.');
  const digest=await cryptoApi.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function inspectCfdiFiles(xmlFile,pdfFile,Parser) {
  if(!xmlFile || !/\.xml$/i.test(xmlFile.name) || xmlFile.size>4*1024*1024)throw new Error('Selecciona un XML de hasta 4 MB.');
  if(!pdfFile || !/\.pdf$/i.test(pdfFile.name) || pdfFile.size>10*1024*1024)throw new Error('Selecciona su PDF de hasta 10 MB.');
  const [xmlBytes,pdfBytes]=await Promise.all([xmlFile.arrayBuffer(),pdfFile.arrayBuffer()]);
  // Reject mismatched extension/MIME without ever rendering active PDF content.
  if(new TextDecoder('ascii').decode(pdfBytes.slice(0,5))!=='%PDF-')throw new Error('El archivo PDF no tiene una cabecera PDF válida.');
  const xmlText=new TextDecoder('utf-8',{fatal:true}).decode(xmlBytes);
  const parsed=parseCfdi(xmlText,Parser);
  const [xmlHash,pdfHash]=await Promise.all([sha256(xmlBytes),sha256(pdfBytes)]);
  const name=file=>file.name.split(/[\\/]/).pop().slice(0,180);
  return {cfdi:parsed,xml:{nombre:name(xmlFile),sha256:xmlHash,bytes:xmlBytes.byteLength},pdf:{nombre:name(pdfFile),sha256:pdfHash,bytes:pdfBytes.byteLength}};
}
export function matchCfdi(bundle,expected,records=[]) {
  const errors=[],warnings=[];const cfdi=bundle.cfdi;
  if(!expected.id)errors.push('Primero guarda y vuelve a abrir el registro del expediente.');
  if(!expected.emisorRfc || cfdi.emisorRfc!==expected.emisorRfc.trim().toUpperCase())errors.push('RFC emisor no confirmado o distinto.');
  if(!expected.receptorRfc || cfdi.receptorRfc!==expected.receptorRfc.trim().toUpperCase())errors.push('RFC receptor no confirmado o distinto.');
  if(!expected.moneda || cfdi.moneda!==expected.moneda.trim().toUpperCase())errors.push('Moneda no confirmada o distinta.');
  try { const delta=decimalMicros(cfdi.total)-decimalMicros(expected.total);if(delta>10000n||delta< -10000n)errors.push('El total difiere del expediente por más de $0.01.'); }
  catch { errors.push('Total del expediente no verificable.'); }
  if(cfdi.tipoComprobante!=='I')errors.push('Este comprobante no es de ingreso; requiere un flujo específico y revisión.');
  for(const record of records)for(const entry of record.cfdiDocumentos||[]) {
    if((entry.uuid||entry.cfdi?.uuid||'').toUpperCase()===cfdi.uuid)errors.push(`UUID ya registrado en ${record.folio||record.id}.`);
    if([entry.xml?.sha256,entry.pdf?.sha256].filter(Boolean).some(h=>h===bundle.xml.sha256||h===bundle.pdf.sha256))errors.push(`Archivo idéntico ya registrado en ${record.folio||record.id}.`);
  }
  if(cfdi.esSustitucion)warnings.push('El XML declara sustitución (04). No acredita que el CFDI anterior esté cancelado.');
  warnings.push('No se consultó SAT ni se verificaron firmas. El PDF requiere cotejo manual con el UUID, RFC e importe del XML.');
  return {errors:[...new Set(errors)],warnings,ready:errors.length===0};
}
