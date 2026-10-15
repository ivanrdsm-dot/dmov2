import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx-js-style';
const app=readFileSync(new URL('./App.jsx',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function setCell('),app.indexOf('function setCurrency('));
const setCell=Function(source+';return setCell;')();
describe('workbook numeric formula cells',()=>{
 it('preserves formula and cached numeric subtotal instead of [object Object]',()=>{const sheet={};setCell(sheet,'G13',{t:'n',f:'SUM(G5:G12)',v:12800},{font:{bold:true}},'"$"#,##0.00');expect(sheet.G13).toMatchObject({t:'n',f:'SUM(G5:G12)',v:12800});});
 it('round-trips formula and cached value through actual XLSX writer',()=>{const sheet={'!ref':'A1:A2'};setCell(sheet,'A1',25);setCell(sheet,'A2',{t:'n',f:'SUM(A1:A1)',v:25});const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Totals');const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});const restored=XLSX.read(bytes,{type:'buffer'}).Sheets.Totals;expect(restored.A2.t).toBe('n');expect(restored.A2.v).toBe(25);expect(restored.A2.f).toBe('SUM(A1:A1)');});
 it('does not turn ordinary text beginning = into a formula',()=>{const sheet={};setCell(sheet,'A1','=SUM(A1:A9)');expect(sheet.A1).toEqual({t:'s',v:'=SUM(A1:A9)'});});
 it('rejects arbitrary object values rather than silently stringifying',()=>expect(()=>setCell({},'A1',{value:100})).toThrow(/Celda/));
});
