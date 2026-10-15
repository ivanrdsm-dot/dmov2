import { describe, it, expect } from 'vitest';
import { billingFields, billingSnapshot, resolveBilling, requireApproval, validateRequest, prepareRequest, convertBudgetTransaction, validateBatch } from './billing.js';
import { readFileSync } from 'node:fs';
const catalog = [
  { id:'campari',empresa:'ACTNOW SA',plan:'210201',cliente:'Campari' },
  { id:'hersheys',empresa:'ACTNOW SA',plan:'142805',cliente:'Hersheys' },
  { id:'cca',empresa:'CCA SA',plan:'212801',cliente:'CCA' },
];
const approve = r => { const data={...r,approvalSource:'Correo de aprobación, folio COT-1',approvalDate:'2026-10-15'}; return {...data,approvalSnapshot:billingSnapshot(data)}; };
const budget = (patch={}) => approve({id:'budget1',folio:'PRE-1',periodoServicio:'SEPTIEMBRE 2026',status:'Aprobado',_clienteId:'campari',empresa:'ACTNOW SA',cliente:'Campari',plan:'210212',planOverride:'',sinPlan:false,billingConfirmed:true,conceptos:[{desc:'Traslado',cant:1,precio:100}],subtotal:100,ivaAmt:16,total:116,...patch});
const request = patch => prepareRequest(budget(patch),catalog,new Date('2026-10-15T12:00:00Z'),'timestamp');
const snapshot = value => ({exists:()=>value!==undefined,data:()=>value});
const budgetRef={id:'budget1'}, requestRef={id:'presupuesto_budget1'};
function memoryTx(b, r) {
  const writes=[];
  return {writes,get:async ref=>snapshot(ref===budgetRef?b:r),set:(...args)=>writes.push(['set',...args]),update:(...args)=>writes.push(['update',...args])};
}
describe('explicit project, plan and approval',()=>{
  it('normalizes form number strings like the persisted budget',()=>{const b=budget();expect(billingSnapshot({...b,conceptos:[{desc:'Traslado',cant:'1',precio:'100'}],subtotal:'100'})).toBe(billingSnapshot(b));});
  it('does not infer a project from duplicate legal entity',()=>expect(()=>resolveBilling(budget({_clienteId:''}),catalog)).toThrow(/Selecciona/));
  it('honors saved ordinary plan over catalog suggestion',()=>expect(resolveBilling(budget(),catalog).plan).toBe('210212'));
  it('resolves second project of same legal entity',()=>expect(resolveBilling(budget({_clienteId:'hersheys',plan:'142805'}),catalog).matched.id).toBe('hersheys'));
  it('honors saved override and preserves it for editing',()=>{const b=budget({planOverride:'P-otro'});expect(resolveBilling(b,catalog).plan).toBe('P-otro');expect(billingFields(b).planOverride).toBe('P-otro');expect(billingFields(b)._clienteId).toBe('campari');});
  it('supports explicitly confirmed no-plan without using catalog',()=>expect(resolveBilling(budget({_clienteId:'cca',empresa:'CCA SA',plan:'',sinPlan:true}),catalog).plan).toBe(''));
  it('rejects missing, contradictory or unconfirmed plan',()=>{for(const patch of [{plan:''},{sinPlan:true},{billingConfirmed:false}])expect(()=>resolveBilling(budget(patch),catalog)).toThrow();});
  it('rejects client identity versus legal entity mismatch',()=>expect(()=>resolveBilling(budget({empresa:'CCA SA'}),catalog)).toThrow(/empresa/));
  it('does not treat historical Aprobado as evidence',()=>expect(()=>requireApproval({...budget(),approvalSnapshot:''})).toThrow(/evidencia/));
  it('invalidates approval after amounts, plan, company or concepts change',()=>{for(const patch of [{total:200},{plan:'wrong'},{empresa:'CCA SA'},{conceptos:[]}])expect(()=>requireApproval({...budget(),...patch})).toThrow();});
  it('requires source and approval date',()=>{for(const patch of [{approvalSource:''},{approvalDate:''},{approvalDate:'2026-99-99'},{approvalDate:'2026-02-30'},{approvalSource:'Otra fuente'}])expect(()=>requireApproval({...budget(),...patch})).toThrow();});
});
describe('internal request conversion',()=>{
  it('creates internal request with origin, verified plan and no fiscal dates',()=>{const r=request();expect(r.tipoDocumento).toBe('solicitud_interna');expect(r.folio).toBe('SOL-budget1');expect(r.status).toBe('Solicitud interna');expect(r.fechaEmision).toBe('');expect(r.plan).toBe('210212');expect(r.presupuestoOrigenId).toBe('budget1');expect(()=>validateRequest(r,catalog)).not.toThrow();});
  it.each(['Borrador','Enviado','Rechazado'])('blocks %s',status=>expect(()=>request({status})).toThrow(/aprobado/));
  it('atomically creates and links without changing approval status',async()=>{const tx=memoryTx(budget());await convertBudgetTransaction(tx,budgetRef,requestRef,catalog,new Date(),'ts');expect(tx.writes).toHaveLength(2);expect(tx.writes[1][2]).toEqual({convertidoAFacturaId:'presupuesto_budget1',convertidoEn:'ts'});});
  it('does not write when validation fails',async()=>{const tx=memoryTx(budget({status:'Borrador'}));await expect(convertBudgetTransaction(tx,budgetRef,requestRef,catalog,new Date(),'ts')).rejects.toThrow();expect(tx.writes).toEqual([]);});
  it('reuses pre-existing link, including a historical random ID',async()=>{const tx=memoryTx(budget({convertidoAFacturaId:'legacy-random-id'}));await expect(convertBudgetTransaction(tx,budgetRef,requestRef,catalog,new Date(),'ts')).rejects.toThrow(/vinculada/);expect(tx.writes).toEqual([]);});
  it('blocks orphan deterministic record rather than overwriting it',async()=>{const tx=memoryTx(budget(),request());await expect(convertBudgetTransaction(tx,budgetRef,requestRef,catalog,new Date(),'ts')).rejects.toThrow(/vínculo/);expect(tx.writes).toEqual([]);});
  it('blocks deleted budget without writes',async()=>{const tx=memoryTx();await expect(convertBudgetTransaction(tx,budgetRef,requestRef,catalog,new Date(),'ts')).rejects.toThrow(/existe/);expect(tx.writes).toEqual([]);});
  it('transaction retry after competing write uses existing request',async()=>{const first=memoryTx(budget());await convertBudgetTransaction(first,budgetRef,requestRef,catalog,new Date(),'ts');const committed={...budget(),...first.writes[1][2]};const retry=memoryTx(committed,first.writes[0][2]);await expect(convertBudgetTransaction(retry,budgetRef,requestRef,catalog,new Date(),'ts')).rejects.toThrow(/vinculada/);expect(retry.writes).toHaveLength(0);});
});
describe('complete batch export',()=>{
  it('accepts verified complete batch',()=>expect(()=>validateBatch([request()],catalog)).not.toThrow());
  it('fails entire batch for unknown client or unconfirmed record',()=>expect(()=>validateBatch([request(),{...request(),folio:'SOL-2',_clienteId:'unknown'}],catalog)).toThrow(/No se exportó ningún registro/));
  it('rejects repeated origin even if record IDs differ',()=>expect(()=>validateBatch([request(),{...request(),id:'another'}],catalog)).toThrow(/duplicada/));
  it('rejects empty batch, invalid totals and missing concepts',()=>{expect(()=>validateBatch([],catalog)).toThrow();for(const patch of [{subtotal:0},{total:115},{servicio:''},{periodoServicio:''},{status:'Cancelada'}])expect(()=>validateRequest(approve({...request(),...patch}),catalog)).toThrow();});
  it('renders saved ordinary plan and explicit no-plan in exported B20',()=>{
    const app=readFileSync(new URL('./App.jsx',import.meta.url),'utf8');
    const source=app.slice(app.indexOf('function buildSolicitudWs('),app.indexOf('// Descarga una sola factura'));
    const XLSX={utils:{encode_cell:({r,c})=>String.fromCharCode(65+c)+(r+1)}};
    const config={};
    const build=Function('validateRequest','CLIENTE_PLANES','SOLICITUD_FACTURA_CONFIG','XLSX',source+';return buildSolicitudWs;')(validateRequest,catalog,config,XLSX);
    expect(build(request()).ws.B20.v).toBe('210212');
    expect(build(request()).ws.B22.v).toBe('SEPTIEMBRE 2026');
    expect(build(request({ivaAmt:0,total:100})).ws.G25.v).toBe(0);
    expect(build(request({_clienteId:'cca',empresa:'CCA SA',plan:'',sinPlan:true})).ws.B20.v).toBe('');
  });
});
