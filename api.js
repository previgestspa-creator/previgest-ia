/*
 * Cliente del backend (Google Apps Script).
 * Usa POST con Content-Type text/plain para evitar la verificación previa CORS.
 * La clave personal viaja en el cuerpo (HTTPS), nunca en la URL.
 */
(function () {
  'use strict';

  function ErrorApi(codigo, mensaje) {
    var e = new Error(mensaje);
    e.codigo = codigo;
    return e;
  }

  function llamar(accion, datos, opciones) {
    var cfg = window.App ? App.config() : {};
    var url = (cfg.apiUrl || '').trim();
    if (!url) return Promise.reject(ErrorApi('SIN_SERVIDOR', 'Configure la dirección del servidor en Configuración.'));
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      return Promise.reject(ErrorApi('SIN_SERVIDOR', 'La dirección del servidor debe ser una implementación de Google Apps Script (https://script.google.com/…).'));
    }
    if (!cfg.clave) return Promise.reject(ErrorApi('NO_AUTORIZADO', 'Ingrese su clave de acceso en Configuración.'));
    if (!navigator.onLine) return Promise.reject(ErrorApi('SIN_CONEXION', 'Sin conexión a Internet.'));

    var ctrl = new AbortController();
    var ms = (opciones && opciones.timeout) || 60000;
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: accion, clave: cfg.clave, datos: datos || {} }),
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl.signal
    }).then(function (r) {
      if (!r.ok) throw ErrorApi('ERROR_RED', 'El servidor respondió con error ' + r.status + '.');
      return r.json().catch(function () {
        throw ErrorApi('ERROR_RED', 'Respuesta no válida del servidor. Verifique que la implementación esté publicada para "Cualquier persona".');
      });
    }, function (err) {
      if (err && err.name === 'AbortError') throw ErrorApi('TIEMPO_AGOTADO', 'El servidor tardó demasiado en responder.');
      throw ErrorApi('ERROR_RED', 'No fue posible conectar con el servidor.');
    }).then(function (j) {
      if (!j || j.ok !== true) throw ErrorApi((j && j.codigo) || 'ERROR', (j && j.mensaje) || 'Error desconocido.');
      return j.datos;
    }).finally(function () { clearTimeout(timer); });
  }

  /** Errores que no deben borrar ni alterar la observación pendiente. */
  function esTransitorio(e) {
    return ['SIN_CONEXION', 'ERROR_RED', 'TIEMPO_AGOTADO', 'CUOTA_IA_AGOTADA', 'IA_NO_DISPONIBLE', 'OCUPADO', 'IA_NO_AUTORIZADA'].indexOf(e && e.codigo) >= 0;
  }

  window.Api = { llamar: llamar, esTransitorio: esTransitorio };
})();
