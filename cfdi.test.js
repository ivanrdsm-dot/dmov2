import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { webcrypto } from 'node:crypto';
import { decimalMicros, inspectCfdiFiles, matchCfdi, parseCfdi, sha256 } from './cfdi.js';

// xmldom is a test-only adapter. Reject its recovery warnings to model the
// browser DOMParser's fatal XML/parsererror behavior; runtime remains native.
class TestDOMParser extends DOMParser {
  constructor() { super({ onError: (_level, message) => { throw new Error(message); } }); }
}
const ID = '12345678-1234-1234-1234-123456789ABC';
const RELATED = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
const NS = 'http://www.sat.gob.mx/cfd/4';
const TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital';
function xml({ prefix = 'cfdi', version = '4.0', namespace = NS, type = 'I', relations = '', timbre = '', rootAttrs = '', ...values } = {}) {
  const tag = name => prefix ? `${prefix}:${name}` : name;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${tag('Comprobante')} xmlns${prefix ? ':' + prefix : ''}="${namespace}" xmlns:tfd="${TFD}" Version="${version}" Serie="A" Folio="17" Fecha="${values.fecha ?? '2026-10-15T12:34:56'}" SubTotal="${values.subtotal ?? '100.00'}" Total="${values.total ?? '116.00'}" Moneda="${values.moneda ?? 'MXN'}" TipoDeComprobante="${type}" ${rootAttrs}>
<${tag('Emisor')} Rfc="${values.emisor ?? 'AAA010101AAA'}" Nombre="Emisor"/>
<${tag('Receptor')} Rfc="${values.receptor ?? 'BBB010101BBB'}" Nombre="Receptor"/>
${relations}<${tag('Complemento')}>${timbre || `<tfd:TimbreFiscalDigital UUID="${values.uuid ?? ID}" FechaTimbrado="${values.timbrado ?? '2026-10-15T12:35:00'}"/>`}</${tag('Complemento')}>
</${tag('Comprobante')}>`;
}
const parse = source => parseCfdi(source, TestDOMParser);
const expected = patch => ({ id: 'exp-1', emisorRfc: 'AAA010101AAA', receptorRfc: 'BBB010101BBB', moneda: 'MXN', total: '116', ...patch });
const bundle = options => ({ cfdi: parse(xml(options)), xml: { sha256: 'xml-hash' }, pdf: { sha256: 'pdf-hash' } });
const bytes = text => new TextEncoder().encode(text);
function file(name, content, size) {
  const data = typeof content === 'string' ? bytes(content) : content;
  return { name, size: size ?? data.byteLength, arrayBuffer: vi.fn(async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) };
}
afterEach(() => vi.unstubAllGlobals());

describe('CFDI namespace-aware local extraction', () => {
  it.each(['cfdi', 'invoice', ''])('accepts prefix/default namespace %j', prefix => {
    expect(parse(xml({ prefix }))).toMatchObject({ uuid: ID, version: '4.0', total: '116.00', fecha: '2026-10-15T12:34:56' });
  });
  it('supports 3.3 and arbitrary timbre namespace prefixes', () => {
    expect(parse(xml({ version: '3.3', namespace: 'http://www.sat.gob.mx/cfd/3' }).replaceAll('tfd:', 'stamp:').replace('xmlns:tfd', 'xmlns:stamp')).version).toBe('3.3');
  });
  it('accepts a default namespace for the timbre element', () => {
    expect(parse(xml().replace('<tfd:TimbreFiscalDigital ', `<TimbreFiscalDigital xmlns="${TFD}" `)).uuid).toBe(ID);
  });
  it.each(['Total', 'SubTotal', 'Moneda', 'Fecha', 'TipoDeComprobante', 'UUID', 'FechaTimbrado'])('rejects missing mandatory attribute %s', attribute => {
    expect(() => parse(xml().replace(new RegExp(`${attribute}="[^"]*"`), ''))).toThrow();
  });
  it('uses the browser DOMParser by default when available', () => {
    vi.stubGlobal('DOMParser', TestDOMParser);
    expect(parseCfdi(xml()).uuid).toBe(ID);
  });
  it.each([
    source => source.replace(NS, 'https://attacker.invalid/cfd/4'),
    source => source.replace(TFD, 'https://attacker.invalid/timbre'),
    source => source.replace('<cfdi:Emisor ', '<other:Emisor xmlns:other="urn:wrong" '),
    source => source.replace('Version="4.0"', 'Version="3.3"'),
    source => source.replace('</cfdi:Complemento>', `<tfd:TimbreFiscalDigital UUID="${RELATED}" FechaTimbrado="2026-10-15T12:35:00"/></cfdi:Complemento>`),
    source => source.replace('</cfdi:Comprobante>', `<tfd:TimbreFiscalDigital UUID="${RELATED}" FechaTimbrado="2026-10-15T12:35:00"/></cfdi:Comprobante>`),
    source => source.replace('</cfdi:Comprobante>', '<cfdi:Comprobante/></cfdi:Comprobante>'),
    source => source.replace('</cfdi:Comprobante>', ''),
  ])('rejects wrong namespaces, duplicate timbres, nested roots and malformed XML %#', mutate => expect(() => parse(mutate(xml()))).toThrow());
  it.each([
    { uuid: 'not-a-uuid' }, { uuid: '' }, { emisor: 'bad' }, { receptor: '' },
    { total: '-1' }, { subtotal: '1e2' }, { total: '1.0000001' }, { total: 'NaN' },
    { fecha: '2026-02-30T12:00:00' }, { fecha: '2026-10-15T24:00:00' },
    { fecha: '2026-10-15T12:60:00' }, { timbrado: '2026-10-15T12:00:60' },
    { timbrado: '2026-10-15T12:00:00Z' }, { moneda: 'mxn' }, { type: 'X' },
  ])('rejects invalid fiscal metadata %j', options => expect(() => parse(xml(options))).toThrow());
  it('normalizes UUID/RFC without interpreting dates as UTC', () => {
    expect(parse(xml({ uuid: ID.toLowerCase(), emisor: 'aaa010101aaa' }))).toMatchObject({ uuid: ID, emisorRfc: 'AAA010101AAA', fecha: '2026-10-15T12:34:56' });
  });
  it('extracts relationship 04 without claiming SAT validity or cancellation', () => {
    const data = bundle({ relations: `<cfdi:CfdiRelacionados TipoRelacion="04"><cfdi:CfdiRelacionado UUID="${RELATED}"/></cfdi:CfdiRelacionados>` });
    expect(data.cfdi).toMatchObject({ esSustitucion: true, relaciones: [{ tipoRelacion: '04', uuids: [RELATED] }], estadoSat: 'no_consultado', validacion: 'estructura_extraida_no_validacion_fiscal' });
    expect(matchCfdi(data, expected()).warnings.join(' ')).toMatch(/No acredita.*cancelado/);
  });
});

describe('untrusted XML rejection', () => {
  it.each([
    '<!DOCTYPE cfdi:Comprobante>',
    '<!DOCTYPE cfdi:Comprobante [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
    '<!DOCTYPE cfdi:Comprobante SYSTEM "https://attacker.invalid/external.dtd">',
    '<!ENTITY xxe "expanded">', '<?xml-stylesheet href="https://attacker.invalid/xsl"?>', '<?processing active?>', '\u0000',
  ])('rejects DTD, ENTITY, XXE, PI or NUL before invoking parser: %s', unsafe => {
    const parser = vi.fn();
    expect(() => parseCfdi(xml().replace('\n', '\n' + unsafe), parser)).toThrow();
    expect(parser).not.toHaveBeenCalled();
  });
  it.each(['', '  ', null, 'x'.repeat(4 * 1024 * 1024 + 1)])('rejects empty/nonstring/oversize input %#', source => expect(() => parse(source)).toThrow());
  it('enforces UTF-8 byte size instead of character count', () => expect(() => parse('ñ'.repeat(2 * 1024 * 1024 + 1))).toThrow(/4 MB/));
});

describe('expediente matching guards', () => {
  it('matches confirmed identity, currency and amount and always warns about SAT/PDF', () => {
    expect(matchCfdi(bundle(), expected())).toMatchObject({ ready: true, errors: [] });
    expect(matchCfdi(bundle(), expected()).warnings.join(' ')).toMatch(/No se consultó SAT.*PDF requiere cotejo manual/);
  });
  it.each(['E', 'T', 'N', 'P'])('blocks non-income type %s', type => expect(matchCfdi(bundle({ type }), expected()).ready).toBe(false));
  it.each([
    { id: '' }, { emisorRfc: '' }, { receptorRfc: '' }, { moneda: '' }, { total: undefined },
    { emisorRfc: 'CCC010101CCC' }, { receptorRfc: 'CCC010101CCC' }, { moneda: 'USD' }, { total: '117' }, { total: '115.98' }, { total: 'invalid' },
  ])('blocks missing/mismatched expected fields %j', patch => expect(matchCfdi(bundle(), expected(patch)).ready).toBe(false));
  it('compares decimals exactly and permits at most one cent difference', () => {
    expect(decimalMicros('1234567890123456.123456')).toBe(1234567890123456123456n);
    for (const total of ['115.99', '116.01']) expect(matchCfdi(bundle(), expected({ total })).ready).toBe(true);
    for (const total of ['115.989999', '116.010001']) expect(matchCfdi(bundle(), expected({ total })).ready).toBe(false);
  });
  it.each([
    { uuid: ID.toLowerCase() }, { cfdi: { uuid: ID.toLowerCase() } },
    { xml: { sha256: 'xml-hash' } }, { pdf: { sha256: 'pdf-hash' } },
    { xml: { sha256: 'pdf-hash' } }, { pdf: { sha256: 'xml-hash' } },
  ])('blocks existing UUID or either file hash across expedientes %j', entry => {
    expect(matchCfdi(bundle(), expected(), [{ id: 'other', folio: 'EXP-2', cfdiDocumentos: [entry] }]).ready).toBe(false);
  });
  it('does not treat unrelated records as duplicates', () => expect(matchCfdi(bundle(), expected(), [{ id: 'other', cfdiDocumentos: [{ uuid: RELATED, xml: { sha256: 'other' } }] }]).ready).toBe(true));
});

describe('file inspection and hashing', () => {
  it('hashes exact bytes stably using SHA-256', async () => {
    const hash = await sha256(bytes('abc'), webcrypto);
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256(bytes('abc'), webcrypto)).toBe(hash);
    expect(await sha256(bytes('abcd'), webcrypto)).not.toBe(hash);
  });
  it('fails closed without secure hashing support', async () => expect(sha256(bytes('abc'), {})).rejects.toThrow(/seguro/));
  it('inspects valid XML/PDF locally and sanitizes basename', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const result = await inspectCfdiFiles(file('../invoice.XML', xml()), file('C:\\docs\\invoice.PDF', '%PDF-1.7\nfixture'), TestDOMParser);
    expect(result.cfdi.uuid).toBe(ID);
    expect(result.xml.nombre).toBe('invoice.XML');
    expect(result.pdf.nombre).toBe('invoice.PDF');
    expect(result.xml.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.pdf.sha256).toBe(await sha256(bytes('%PDF-1.7\nfixture'), webcrypto));
  });
  it.each([
    ['invoice.txt', 'invoice.pdf', 1, 1], ['invoice.xml', 'invoice.html', 1, 1],
    ['invoice.xml', 'invoice.pdf', 4 * 1024 * 1024 + 1, 1],
    ['invoice.xml', 'invoice.pdf', 1, 10 * 1024 * 1024 + 1],
  ])('blocks extensions or advertised size: %s %s %s %s', async (xn, pn, xs, ps) => {
    const xf = file(xn, xml(), xs), pf = file(pn, '%PDF-1.7', ps);
    await expect(inspectCfdiFiles(xf, pf, TestDOMParser)).rejects.toThrow();
    expect(xf.arrayBuffer).not.toHaveBeenCalled();
    expect(pf.arrayBuffer).not.toHaveBeenCalled();
  });
  it.each(['', 'PDF-1.7', '<html>not a PDF</html>', ' %PDF-1.7'])('rejects invalid PDF magic %j', async pdf => expect(inspectCfdiFiles(file('a.xml', xml()), file('a.pdf', pdf), TestDOMParser)).rejects.toThrow(/cabecera PDF/));
  it('rejects invalid UTF-8 rather than replacing source bytes', async () => {
    await expect(inspectCfdiFiles(file('a.xml', new Uint8Array([0xff, 0xfe])), file('a.pdf', '%PDF-1.7'), TestDOMParser)).rejects.toThrow();
  });
  it('does not mutate approvals/status, submit, upload or fetch during parsing/inspection/matching', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetch = vi.fn(() => { throw new Error('network forbidden'); });
    vi.stubGlobal('fetch', fetch);
    const record = { ...expected(), status: 'Pendiente', approvalSnapshot: '', cfdiDocumentos: [] };
    const before = structuredClone(record);
    Object.freeze(record.cfdiDocumentos); Object.freeze(record);
    const result = await inspectCfdiFiles(file('a.xml', xml()), file('a.pdf', '%PDF-1.7'), TestDOMParser);
    matchCfdi(result, record, [record]);
    expect(record).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.cfdi).not.toHaveProperty('approvalSnapshot');
    expect(result.cfdi).not.toHaveProperty('status');
  });
});
