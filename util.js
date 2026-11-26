/* Utilidades generales (sin dependencias externas). */
(function () {
  'use strict';
  var U = {};

  U.$ = function (id) { return document.getElementById(id); };

  /** Crea elementos de forma segura: el texto siempre va como textContent. */
  U.el = function (tag, attrs, hijos) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (hijos || []).forEach(function (h) {
      if (h === null || h === undefined || h === false) return;
      e.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return e;
  };

  U.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  U.fechaHora = function (iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  U.blobABase64 = function (blob) {
    return new Promise(function (ok, mal) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1]); };
      r.onerror = function () { mal(r.error); };
      r.readAsDataURL(blob);
    });
  };

  U.base64ABlob = function (b64, tipo) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: tipo });
  };

  U.descargar = function (blob, nombre) {
    var url = URL.createObjectURL(blob);
    var a = U.el('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  };

  U.leerJSON = function (k, def) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  };
  U.guardarJSON = function (k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento no disponible */ }
  };

  U.clasePrioridad = function (p) {
    return ['Baja', 'Media', 'Alta', 'Crítica'].indexOf(p) >= 0 ? 'prio prio-' + p : 'prio prio-NE';
  };
  U.textoPrioridad = function (p) {
    return p === 'No evaluable con la información disponible' ? 'No evaluable' : (p || 'No evaluable');
  };

  window.U = U;
})();
