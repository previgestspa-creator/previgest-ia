/*
 * Almacenamiento local de observaciones pendientes (IndexedDB).
 * Una observación solo se elimina de aquí cuando el servidor confirma que la guardó.
 */
(function () {
  'use strict';
  var NOMBRE = 'previgest-ia', VERSION = 1, STORE = 'observaciones';
  var dbp = null;

  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, mal) {
      var req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { mal(req.error); };
    });
    return dbp;
  }

  function tx(modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (ok, mal) {
        var t = db.transaction(STORE, modo);
        var s = t.objectStore(STORE);
        var r = fn(s);
        t.oncomplete = function () { ok(r && 'result' in r ? r.result : undefined); };
        t.onerror = function () { mal(t.error); };
        t.onabort = function () { mal(t.error); };
      });
    });
  }

  window.DB = {
    guardar: function (obs) { obs.actualizado = new Date().toISOString(); return tx('readwrite', function (s) { return s.put(obs); }); },
    obtener: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
    todas: function () {
      return tx('readonly', function (s) { return s.getAll(); }).then(function (l) {
        return (l || []).sort(function (a, b) { return a.creado < b.creado ? 1 : -1; });
      });
    },
    eliminar: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); },
    vaciar: function () { return tx('readwrite', function (s) { return s.clear(); }); }
  };
})();
