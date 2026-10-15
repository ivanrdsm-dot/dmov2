import { describe,it,expect } from 'vitest';
import { reserveCfdi,invoiceArchiveFingerprint } from './cfdiArchiveStore.js';
const invoice={id:'one',folio:'FAC-1',empresa:'Example',total:116};
const bundle={cfdi:{uuid:'UUID',estadoSat:'no_consultado'},xml:{sha256:'xml'},pdf:{sha256:'pdf'}};
const refs=['invoice','archive','xml','pdf'];
const snapshot=value=>({exists:()=>value!==undefined,data:()=>value});
function tx(records){const writes=[];return {writes,get:async ref=>snapshot(records[refs.indexOf(ref)]),set:(...args)=>writes.push(args),update:(...args)=>writes.push(args)};}
describe('CFDI reservation has one canonical UUID and hashes',()=>{
 it('reserves all three records and locks invoice association without changing financial fields',async()=>{const t=tx([invoice]);const result=await reserveCfdi(t,refs,invoice,bundle,'office','timestamp');expect(t.writes.map(w=>w[0])).toEqual(['invoice','archive','xml','pdf']);expect(result.estado).toBe('pendiente');});
 it('rejects changed invoice before any write',async()=>{const t=tx([{...invoice,total:200}]);await expect(reserveCfdi(t,refs,invoice,bundle,'office','ts')).rejects.toThrow(/cambió/);expect(t.writes).toEqual([]);});
 it('rejects deleted invoice before any write',async()=>{const t=tx([]);await expect(reserveCfdi(t,refs,invoice,bundle,'office','ts')).rejects.toThrow(/existe/);expect(t.writes).toEqual([]);});
 it('resumes same pending pair without duplicating metadata',async()=>{const saved={facturaId:'one',...bundle,createdBy:'office',estado:'pendiente',facturaFingerprint:invoiceArchiveFingerprint(invoice)};const t=tx([invoice,saved]);expect(await reserveCfdi(t,refs,invoice,bundle,'office','ts')).toBe(saved);expect(t.writes).toEqual([]);});
 it('blocks same UUID on another invoice or changed files',async()=>{for(const saved of [{facturaId:'other',...bundle,facturaFingerprint:invoiceArchiveFingerprint(invoice)},{facturaId:'one',...bundle,pdf:{sha256:'changed'},facturaFingerprint:invoiceArchiveFingerprint(invoice)}]){const t=tx([invoice,saved]);await expect(reserveCfdi(t,refs,invoice,bundle,'office','ts')).rejects.toThrow(/UUID/);expect(t.writes).toEqual([]);}});
 it('rejects stale reservation even after reopening changed invoice',async()=>{const changed={...invoice,empresa:'New company'};const t=tx([changed,{facturaId:'one',...bundle,createdBy:'office',estado:'pendiente',facturaFingerprint:invoiceArchiveFingerprint(invoice)}]);await expect(reserveCfdi(t,refs,changed,bundle,'office','ts')).rejects.toThrow(/reserva fiscal/);expect(t.writes).toEqual([]);});
 it('blocks hash reused under another UUID',async()=>{for(const records of [[invoice,undefined,{uuid:'other'}],[invoice,undefined,undefined,{uuid:'other'}]]){const t=tx(records);await expect(reserveCfdi(t,refs,invoice,bundle,'office','ts')).rejects.toThrow(/duplicará/);expect(t.writes).toEqual([]);}});
 it('does not take over another users pending upload',async()=>{const t=tx([invoice,{facturaId:'one',...bundle,createdBy:'other',estado:'pendiente',facturaFingerprint:invoiceArchiveFingerprint(invoice)}]);await expect(reserveCfdi(t,refs,invoice,bundle,'office','ts')).rejects.toThrow(/otro usuario/);});
 it('fingerprint protects project and service-period changes',()=>{expect(invoiceArchiveFingerprint({...invoice,periodoServicio:'Sept'})).not.toBe(invoiceArchiveFingerprint({...invoice,periodoServicio:'Oct'}));});
});
