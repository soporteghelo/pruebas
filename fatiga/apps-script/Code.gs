/**
 * Receptor del Test de Fatiga para Google Sheets.
 *
 * Instalación: en tu Google Sheet → Extensiones → Apps Script → pega este archivo →
 * Implementar → Nueva implementación → Aplicación web (Ejecutar como: Yo; Acceso: Cualquier usuario).
 * Copia la URL /exec en Ajustes de la app (modo supervisor).
 *
 * Recibe {registros: [{columna: valor, ...}]}. Crea la hoja "Evaluaciones" si no existe,
 * agrega al final las columnas que falten y no duplica evaluaciones (columna ID).
 */
var HOJA = 'Evaluaciones';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    var registros = body.registros || (body.registro ? [body.registro] : []);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);

    var enc = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    var nuevas = [];
    registros.forEach(function (r) {
      Object.keys(r).forEach(function (k) {
        if (enc.indexOf(k) === -1 && nuevas.indexOf(k) === -1) nuevas.push(k);
      });
    });
    if (nuevas.length) {
      sh.getRange(1, enc.length + 1, 1, nuevas.length).setValues([nuevas]).setFontWeight('bold');
      enc = enc.concat(nuevas);
      sh.setFrozenRows(1);
    }

    var colId = enc.indexOf('ID');
    var existentes = {};
    if (colId >= 0 && sh.getLastRow() > 1) {
      sh.getRange(2, colId + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (f) { existentes[String(f[0])] = true; });
    }

    var filas = registros
      .filter(function (r) { return !existentes[String(r.ID)]; })
      .map(function (r) {
        return enc.map(function (k) { return r[k] === undefined || r[k] === null ? '' : r[k]; });
      });
    if (filas.length) {
      var rango = sh.getRange(sh.getLastRow() + 1, 1, filas.length, enc.length);
      rango.setNumberFormat('@'); // texto: conserva ceros a la izquierda del DNI
      rango.setValues(filas);
      colorear_(sh, enc, sh.getLastRow() - filas.length + 1, filas.length);
    }
    return json_({ ok: true, agregadas: filas.length, duplicadas: registros.length - filas.length });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/** Pinta la celda "Resultado" con el color del semáforo. */
function colorear_(sh, enc, desde, n) {
  var col = enc.indexOf('Resultado');
  if (col < 0) return;
  var rango = sh.getRange(desde, col + 1, n, 1);
  var colores = rango.getValues().map(function (f) {
    var v = String(f[0]);
    return [v === 'Rojo' ? '#fecaca' : v === 'Ámbar' ? '#fde68a' : v === 'Verde' ? '#bbf7d0' : null];
  });
  rango.setBackgrounds(colores);
}

function doGet() {
  return json_({ ok: true, servicio: 'Test de Fatiga' });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
