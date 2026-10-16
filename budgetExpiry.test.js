import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { billingFields, billingSnapshot } from './billing.js';
const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const section = app.slice(app.indexOf('function Presupuestos('));
const editSource = section.slice(section.indexOf('const openEdit=p=>{'), section.indexOf('  const subtotal='));
const saveSource = section.slice(section.indexOf('const save=async()=>{'), section.indexOf('  const del='));
const emptyExpression = section.slice(section.indexOf('const empty=') + 'const empty='.length, section.indexOf('  const [form,setForm]')).trim().replace(/;$/, '');
const today = '2030-01-01', in15 = '2030-01-16';
const empty = Function('billingFields', 'today', 'in15', 'return (' + emptyExpression + ')')(billingFields, today, in15);
function open(record) {
  let form;
  const edit = Function('billingFields','today','in15','setForm','setEditItem','setModal', editSource + ';return openEdit;')(billingFields,today,in15,value=>{form=value;},()=>{},()=>{});
  edit(record); return form;
}
async function saveNotes(form) {
  const changed = {...form, notas:'Synthetic note'};
  const writes = [];
  const subtotal = changed.conceptos.reduce((a,c)=>a+c.cant*c.precio,0);
  const ivaAmt = changed.iva ? subtotal*.16 : 0;
  const save = Function('form','subtotal','ivaAmt','total','editItem','updateDoc','doc','db','showT','setModal','setForm','setEditItem','empty','billingSnapshot', saveSource + ';return save;')(
    changed,subtotal,ivaAmt,subtotal+ivaAmt,{id:'synthetic-budget'},async(ref,data)=>writes.push(data),(...parts)=>parts,{},()=>{},()=>{},()=>{},()=>{},empty,billingSnapshot);
  await save(); expect(writes).toHaveLength(1); return writes[0];
}
describe('preserve unspecified existing budget expiry',()=>{
  it.each(['',null,undefined])('does not invent an expiry for %s on open, notes save or reopen',async value=>{
    const record={id:'synthetic-budget',cliente:'Synthetic client',vigencia:value,conceptos:[{desc:'Synthetic service',cant:1,precio:10}],iva:false};
    const form=open(record); expect(form.vigencia).toBe('');
    const saved=await saveNotes(form); expect(saved.vigencia).toBe('');
    expect(open(saved).vigencia).toBe('');
  });
  it('preserves an explicit existing expiry',async()=>{
    const form=open({cliente:'Synthetic client',vigencia:'2030-02-01',conceptos:[{desc:'Synthetic service',cant:1,precio:10}],iva:false});
    expect((await saveNotes(form)).vigencia).toBe('2030-02-01');
  });
  it('retains the new-record expiry default',()=>expect(empty.vigencia).toBe(in15));
});
