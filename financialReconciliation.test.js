import {describe,it,expect} from 'vitest';
import {reconcileMonth} from './financialReconciliation.js';
const revenue = {id:'r',sourceKey:'xml:r',kind:'revenue',servicePeriod:'2026-09',issuePeriod:'2026-10',currency:'MXN',net:10000,tax:1600,gross:11600,verified:true,evidence:'archive:r',uuid:'12345678-1234-1234-1234-123456789abc',documentMatched:true,documentType:'I'};
const cost = {id:'c',sourceKey:'receipt:c',kind:'cost',servicePeriod:'2026-09',currency:'MXN',net:5000,tax:800,gross:5800,verified:true,evidence:'receipt:c',classificationVerified:true,taxTreatmentVerified:true,recurringKey:'rent'};
const run = (entries,extra={})=>reconcileMonth({period:'2026-09',entries,...extra});
describe('evidence-only monthly reconciliation',()=>{
 it('recognizes service month separately from issue month and cash',()=>{expect(run([revenue,cost])).toMatchObject({revenueNet:10000,costsNet:5000,partialResultNet:5000,collectionsGross:0,complete:false}); expect(reconcileMonth({period:'2026-10',entries:[revenue]}).revenueNet).toBe(0);});
 it('never equates paid status with collections',()=>expect(run([{...revenue,status:'Pagada'}]).collectionsGross).toBe(0));
 it('tracks independently evidenced cash in its own period',()=>expect(reconcileMonth({period:'2026-10',entries:[{...revenue,cashPeriod:'2026-10',cashDirection:'in',cashGross:11600,cashVerified:true,cashEvidence:'bank:1'}]})).toMatchObject({revenueNet:0,collectionsGross:11600}));
 it('quarantines every copy of a duplicate UUID case insensitively',()=>expect(run([revenue,{...revenue,id:'r2',sourceKey:'xml:r2',uuid:revenue.uuid.toUpperCase()}])).toMatchObject({revenueNet:0,accepted:[]}));
 it('deduplicates costs across sources by business source key',()=>expect(run([cost,{...cost,id:'copy'}]).costsNet).toBe(0));
 it.each(['transfer','capital','loan_principal','tax_settlement'])('excludes %s from expenses but keeps evidenced disbursement',kind=>expect(run([{...cost,kind,cashPeriod:'2026-09',cashDirection:'out',cashGross:5800,cashVerified:true,cashEvidence:'bank'}])).toMatchObject({costsNet:0,disbursementsGross:5800}));
 it('does not assume gross legacy cost is net',()=>expect(run([{...cost,net:undefined,monto:5800}]).costsNet).toBe(0));
 it.each([{verified:false},{documentMatched:false},{documentType:'E'},{currency:'USD'},{net:'10000'},{gross:11000},{cancelled:true},{superseded:true}])('rejects unverified or unsupported revenue %j',changes=>expect(run([{...revenue,...changes}]).revenueNet).toBe(0));
 it('keeps unbilled separate',()=>expect(run([{...revenue,kind:'provisional_revenue'}])).toMatchObject({revenueNet:0,provisionalRevenueNet:10000}));
 it('shows missing recurring costs without fabricating entries',()=>expect(run([cost],{expectedRecurring:[{period:'2026-09',key:'rent'},{period:'2026-09',key:'payroll'}]}).missingRecurring).toEqual(['payroll']));
 it('does not infer service period from accounting or issue month',()=>expect(run([{...revenue,servicePeriod:null}]).issues[0].reason).toBe('missing_service_period'));
 it('never claims SAT verification or full completeness',()=>expect(run([])).toMatchObject({complete:false,satValidated:false}));
});
