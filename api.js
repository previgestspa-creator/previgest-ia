/*
 * Cliente del backend (Google Apps Script).
 * Usa POST con Content-Type text/plain para evitar la verificación previa CORS.
 * El token de sesión viaja en el cuerpo (HTTPS), nunca en la URL.
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
    var esLogin = accion === 'login';
    if (!esLogin && !cfg.token) return Promise.reject(ErrorApi('SESION_EXPIRADA', 'Inicie sesión para continuar.'));
    if (!navigator.onLine) return Promise.reject(ErrorApi('SIN_CONEXION', 'Sin conexión a Internet.'));

    var ctrl = new AbortController();
    var ms = (opciones && opciones.timeout) || 60000;
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(esLogin ? { accion: accion, datos: datos || {} } : { accion: accion, token: cfg.token, datos: datos || {} }),
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
      if (!j || j.ok !== true) {
        var err = ErrorApi((j && j.codigo) || 'ERROR', (j && j.mensaje) || 'Error desconocido.');
        if (!esLogin && (err.codigo === 'SESION_EXPIRADA' || err.codigo === 'NO_AUTORIZADO') && window.App && App.sesionInvalida) {
          App.sesionInvalida(err.message);
        }
        throw err;
      }
      return j.datos;
    }).finally(function () { clearTimeout(timer); });
  }

  /** Errores que no deben borrar ni alterar la observación pendiente. */
  function esTransitorio(e) {
    return ['SIN_CONEXION', 'ERROR_RED', 'TIEMPO_AGOTADO', 'CUOTA_IA_AGOTADA', 'IA_NO_DISPONIBLE', 'OCUPADO', 'IA_NO_AUTORIZADA', 'SESION_EXPIRADA', 'NO_AUTORIZADO'].indexOf(e && e.codigo) >= 0;
  }

  window.Api = { llamar: llamar, esTransitorio: esTransitorio };
})();
