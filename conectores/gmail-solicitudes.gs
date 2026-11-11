/**
 * DMOV · Conector de correo para la bandeja de Solicitudes.
 * Corre en la nube de Google (Apps Script), dentro de la cuenta del buzón. No usa ninguna computadora.
 *
 * Qué hace cada minuto:
 *  1. Toma los correos con la etiqueta DMOV/Solicitudes que aún no están registrados,
 *     los manda a la bandeja y responde el acuse con folio en el mismo hilo.
 *  2. Detecta cuando alguien del equipo ya contestó ese hilo y detiene el reloj.
 *  3. Manda un latido para que la bandeja muestre "Correo: activo".
 *
 * Configuración (Configuración del proyecto → Propiedades de la secuencia de comandos):
 *   DMOV_URL    dirección del servidor de la bandeja
 *   DMOV_TOKEN  llave del conector
 * Después ejecuta una vez la función `instalar`.
 */
var ETIQUETA = 'DMOV/Solicitudes';
var REGISTRADA = 'DMOV/Solicitudes/Registrada';
var RESPONDIDA = 'DMOV/Solicitudes/Respondida';
var VERSION = '1.0';

function instalar() {
  [ETIQUETA, REGISTRADA, RESPONDIDA].forEach(function (n) { if (!GmailApp.getUserLabelByName(n)) GmailApp.createLabel(n); });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'revisarSolicitudes') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('revisarSolicitudes').timeBased().everyMinutes(1).create();
  var r = llamar_({ accion: 'latido', conector: 'gmail', version: VERSION });
  Logger.log('Instalado. Respuesta del servidor: ' + JSON.stringify(r));
}

function revisarSolicitudes() {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(1000)) return;                       // otra ejecución sigue corriendo
  try {
    registrarNuevas_();
    detectarRespuestas_();
    llamar_({ accion: 'latido', conector: 'gmail', version: VERSION });
  } finally { candado.releaseLock(); }
}

function misDirecciones_() {
  return [Session.getActiveUser().getEmail()].concat(GmailApp.getAliases()).map(function (x) { return String(x).toLowerCase(); });
}
function correoDe_(remitente) { var m = /<([^>]+)>/.exec(remitente); return (m ? m[1] : remitente).trim().toLowerCase(); }
function nombreDe_(remitente) { return remitente.replace(/<[^>]+>/, '').replace(/"/g, '').trim(); }
function esMio_(mensaje, mias) { return mias.indexOf(correoDe_(mensaje.getFrom())) !== -1; }
function cabecera_(mensaje, nombre) { try { return mensaje.getHeader(nombre) || ''; } catch (e) { return ''; } }

function registrarNuevas_() {
  var mias = misDirecciones_();
  var hilos = GmailApp.search('label:' + ETIQUETA.replace(/\//g, '-').toLowerCase() + ' -label:' + REGISTRADA.replace(/\//g, '-').toLowerCase() + ' newer_than:14d', 0, 15);
  var registrada = GmailApp.getUserLabelByName(REGISTRADA);
  hilos.forEach(function (hilo) {
    var mensajes = hilo.getMessages();
    var primero = null;
    for (var i = 0; i < mensajes.length; i++) { if (!esMio_(mensajes[i], mias)) { primero = mensajes[i]; break; } }
    if (!primero) { hilo.addLabel(registrada); return; }     // hilo iniciado por nosotros: no es solicitud entrante
    var r = llamar_({
      accion: 'ingresar', canal: 'Correo', idExterno: 'gmail:' + primero.getId(), hilo: hilo.getId(),
      remitenteNombre: nombreDe_(primero.getFrom()), remitenteCorreo: correoDe_(primero.getFrom()),
      asunto: primero.getSubject(), texto: primero.getPlainBody(), recibidaEn: primero.getDate().toISOString(),
      adjuntos: primero.getAttachments({ includeInlineImages: false }).map(function (a) { return { nombre: a.getName(), tipo: a.getContentType(), tamano: a.getSize() }; }),
      cabeceras: { 'Auto-Submitted': cabecera_(primero, 'Auto-Submitted'), 'Precedence': cabecera_(primero, 'Precedence'),
        'List-Unsubscribe': cabecera_(primero, 'List-Unsubscribe'), 'List-Id': cabecera_(primero, 'List-Id') }
    });
    if (!r || !r.ok) return;                                  // se reintenta en el siguiente minuto
    if (r.acusar) {
      primero.replyAll(r.acuse, { name: 'Logística D Movimiento' });
      llamar_({ accion: 'acuse', idExterno: 'gmail:' + primero.getId() });
    }
    hilo.addLabel(registrada);
  });
}

function detectarRespuestas_() {
  var mias = misDirecciones_();
  var hilos = GmailApp.search('label:' + REGISTRADA.replace(/\//g, '-').toLowerCase() + ' -label:' + RESPONDIDA.replace(/\//g, '-').toLowerCase() + ' newer_than:30d', 0, 30);
  var respondida = GmailApp.getUserLabelByName(RESPONDIDA);
  hilos.forEach(function (hilo) {
    var mensajes = hilo.getMessages();
    var primero = null, respuesta = null;
    for (var i = 0; i < mensajes.length; i++) {
      var m = mensajes[i];
      if (!primero) { if (!esMio_(m, mias)) primero = m; continue; }
      if (esMio_(m, mias) && m.getPlainBody().indexOf('(Acuse automático)') === -1) { respuesta = m; break; }
    }
    if (!primero) { hilo.addLabel(respondida); return; }
    if (!respuesta) return;
    var r = llamar_({ accion: 'respondida', idExterno: 'gmail:' + primero.getId(), respondidaEn: respuesta.getDate().toISOString() });
    if (r && (r.ok || r.codigo === 404)) hilo.addLabel(respondida);
  });
}

function llamar_(cuerpo) {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('DMOV_URL'), token = p.getProperty('DMOV_TOKEN');
  if (!url || !token) throw new Error('Faltan las propiedades DMOV_URL y DMOV_TOKEN');
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo),
    headers: { 'x-dmov-token': token }, muteHttpExceptions: true });
  var codigo = res.getResponseCode(), datos = {};
  try { datos = JSON.parse(res.getContentText()); } catch (e) { datos = { ok: false, error: 'Respuesta no válida' }; }
  datos.codigo = codigo;
  if (codigo >= 400) Logger.log('Bandeja respondió ' + codigo + ': ' + (datos.error || ''));
  return datos;
}
