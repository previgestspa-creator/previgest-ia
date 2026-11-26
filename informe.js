/*
 * Presentación y edición del informe en pantalla.
 * Todo el contenido proveniente de la IA o del usuario se inserta como texto (sin HTML).
 */
(function () {
  'use strict';
  var el = U.el;
  var PRIORIDADES = ['Baja', 'Media', 'Alta', 'Crítica', 'No evaluable con la información disponible'];
  var CONTROLES = ['Eliminación', 'Sustitución', 'Control de ingeniería', 'Control administrativo', 'Elemento de protección personal'];
  var BASES = ['Observable', 'Inferido'];
  var ADVERTENCIA = 'El presente informe corresponde a una observación preventiva asistida por inteligencia artificial. ' +
    'Sus resultados deben ser revisados y validados por un profesional competente y no sustituyen una inspección ' +
    'presencial ni una evaluación formal de riesgos laborales.';

  function prio(p) { return el('span', { class: U.clasePrioridad(p), text: U.textoPrioridad(p) }); }

  function lista(titulo, items, vacio) {
    var frag = [el('h3', { text: titulo })];
    if (items && items.length) frag.push(el('ul', null, items.map(function (t) { return el('li', { text: t }); })));
    else frag.push(el('p', { class: 'tenue', text: vacio || 'Sin registros.' }));
    return frag;
  }

  function render(rec, cont, fotoUrl) {
    var a = rec.analisis, o = rec.obs;
    cont.textContent = '';
    cont.classList.remove('editable');
    var guardado = rec.estado === 'guardado';
    cont.appendChild(el('div', { class: 'cab-inf' }, [
      el('h2', { text: 'Observación N.º ' + (rec.numero || 'S/N') }),
      el('span', { class: 'estado-pill' + (guardado ? ' ok' : ''), text: guardado ? (rec.estadoServidor || 'Aprobado') : 'Borrador · sin aprobar' })
    ]));
    var dl = el('dl', { class: 'meta-grid' });
    [['Empresa', o.empresa], ['Centro', o.centro], ['Fecha', U.fechaHora(o.fecha)], ['Observador', o.observador],
      ['Actividad', o.actividad + (o.actividadDetalle ? ' — ' + o.actividadDetalle : '')]].forEach(function (p) {
      dl.appendChild(el('dt', { text: p[0] })); dl.appendChild(el('dd', { text: p[1] }));
    });
    dl.appendChild(el('dt', { text: 'Prioridad' })); dl.appendChild(el('dd', null, [prio(a.prioridadGeneral)]));
    cont.appendChild(dl);

    if (a.critica) {
      cont.appendChild(el('div', { class: 'alerta-critica' }, [
        el('strong', { text: 'Condición potencialmente crítica. ' }),
        a.accionInmediata || 'Se recomienda verificación inmediata y, cuando corresponda, la suspensión preventiva de la actividad por parte del responsable.'
      ]));
    }
    if (fotoUrl) cont.appendChild(el('img', { src: fotoUrl, alt: 'Evidencia fotográfica' }));
    cont.appendChild(el('h3', { text: 'Descripción de la situación' }));
    cont.appendChild(el('p', { text: a.descripcion || 'Requiere verificación en terreno.' }));
    if (a.observables.length || a.inferidas.length) {
      lista('Condiciones observables', a.observables, 'Ninguna registrada.').forEach(function (n) { cont.appendChild(n); });
      lista('Condiciones inferidas (requieren confirmación)', a.inferidas, 'Ninguna registrada.').forEach(function (n) { cont.appendChild(n); });
    }

    cont.appendChild(el('h3', { text: 'Peligros, riesgos y medidas preventivas' }));
    if (!a.hallazgos.length) {
      cont.appendChild(el('p', { class: 'tenue', text: 'No se identificaron hallazgos con la información disponible. Requiere verificación en terreno.' }));
    } else {
      var tabla = el('table', { class: 'tabla-h' }, [
        el('thead', null, [el('tr', null, ['Peligro', 'Riesgo asociado', 'Consecuencia', 'Medida preventiva', 'Prioridad'].map(function (t) { return el('th', { text: t }); }))])
      ]);
      var tb = el('tbody');
      var tarjetas = el('div', { class: 'lista-hallazgos' });
      a.hallazgos.forEach(function (h) {
        tb.appendChild(el('tr', null, [
          el('td', null, [h.peligro, el('div', { class: 'base', text: h.base })]),
          el('td', { text: h.riesgo }), el('td', { text: h.consecuencia }),
          el('td', null, [h.medida, el('div', { class: 'base', text: h.control })]),
          el('td', null, [prio(h.prioridad)])
        ]));
        tarjetas.appendChild(el('div', { class: 'hallazgo' }, [
          el('div', null, [prio(h.prioridad), ' ', el('span', { class: 'base', text: h.base })]),
          el('div', { class: 'k', text: 'Peligro' }), el('div', { text: h.peligro }),
          el('div', { class: 'k', text: 'Riesgo asociado' }), el('div', { text: h.riesgo }),
          el('div', { class: 'k', text: 'Consecuencia' }), el('div', { text: h.consecuencia }),
          el('div', { class: 'k', text: 'Medida preventiva · ' + h.control }), el('div', { text: h.medida })
        ]));
      });
      tabla.appendChild(tb);
      cont.appendChild(tabla);
      cont.appendChild(tarjetas);
    }
    lista('Recomendaciones complementarias', a.recomendaciones).forEach(function (n) { cont.appendChild(n); });
    lista('Buenas prácticas observadas', a.buenasPracticas, 'No se identificaron con la información disponible.').forEach(function (n) { cont.appendChild(n); });
    lista('Aspectos que requieren verificación presencial', a.verificacion).forEach(function (n) { cont.appendChild(n); });
    if (a.marcoReferencia.length) {
      lista('Marco de referencia (verificar vigencia y aplicabilidad)', a.marcoReferencia).forEach(function (n) { cont.appendChild(n); });
    }
    cont.appendChild(el('p', { class: 'advertencia', text: ADVERTENCIA + ' La prioridad es orientativa y no sustituye una evaluación formal mediante matriz IPER.' }));
  }

  /* ---------- Edición ---------- */

  function campo(etiqueta, nodo) { return [el('label', { text: etiqueta }), nodo]; }
  function area(nombre, valor, filas) { return el('textarea', { 'data-campo': nombre, rows: filas || 3, text: valor || '' }); }
  function selector(nombre, opciones, valor) {
    var s = el('select', { 'data-campo': nombre }, opciones.map(function (o) { return el('option', { value: o, text: o }); }));
    s.value = valor;
    return s;
  }

  function bloqueHallazgo(h) {
    var b = el('div', { class: 'hallazgo-ed' });
    [['peligro', 'Peligro'], ['riesgo', 'Riesgo asociado'], ['consecuencia', 'Consecuencia'], ['medida', 'Medida preventiva']].forEach(function (p) {
      campo(p[1], area(p[0], h[p[0]], 2)).forEach(function (n) { b.appendChild(n); });
    });
    campo('Tipo de control', selector('control', CONTROLES, h.control)).forEach(function (n) { b.appendChild(n); });
    campo('Prioridad', selector('prioridad', PRIORIDADES, h.prioridad)).forEach(function (n) { b.appendChild(n); });
    campo('Base', selector('base', BASES, h.base)).forEach(function (n) { b.appendChild(n); });
    b.appendChild(el('button', { class: 'btn btn-borde btn-peligro btn-small', type: 'button', text: 'Quitar hallazgo', onclick: function () { b.remove(); } }));
    return b;
  }

  function editar(rec, cont) {
    var a = rec.analisis;
    cont.textContent = '';
    cont.classList.add('editable');
    cont.appendChild(el('h2', { text: 'Editar informe N.º ' + (rec.numero || 'S/N') }));
    campo('Centro de trabajo', el('input', { 'data-campo': 'centro', value: rec.obs.centro, maxlength: 120 })).forEach(function (n) { cont.appendChild(n); });
    campo('Prioridad sugerida', selector('prioridadGeneral', PRIORIDADES, a.prioridadGeneral)).forEach(function (n) { cont.appendChild(n); });
    var chk = el('input', { type: 'checkbox', 'data-campo': 'critica' });
    chk.checked = !!a.critica;
    cont.appendChild(el('label', { class: 'check' }, [chk, el('span', { text: 'Condición potencialmente crítica' })]));
    campo('Acción inmediata recomendada', area('accionInmediata', a.accionInmediata, 2)).forEach(function (n) { cont.appendChild(n); });
    campo('Resumen (para correo y registro)', area('resumen', a.resumen, 2)).forEach(function (n) { cont.appendChild(n); });
    campo('Descripción de la situación', area('descripcion', a.descripcion, 4)).forEach(function (n) { cont.appendChild(n); });
    cont.appendChild(el('p', { class: 'tenue', text: 'En las listas, escriba un elemento por línea.' }));
    [['observables', 'Condiciones observables'], ['inferidas', 'Condiciones inferidas'],
      ['recomendaciones', 'Recomendaciones complementarias'], ['buenasPracticas', 'Buenas prácticas observadas'],
      ['verificacion', 'Aspectos que requieren verificación presencial'], ['marcoReferencia', 'Marco de referencia']].forEach(function (p) {
      campo(p[1], area(p[0], (a[p[0]] || []).join('\n'), 3)).forEach(function (n) { cont.appendChild(n); });
    });
    cont.appendChild(el('h3', { text: 'Hallazgos' }));
    var hs = el('div', { 'data-hallazgos': '1' });
    a.hallazgos.forEach(function (h) { hs.appendChild(bloqueHallazgo(h)); });
    cont.appendChild(hs);
    cont.appendChild(el('button', {
      class: 'btn btn-borde btn-bloque', type: 'button', text: 'Agregar hallazgo',
      onclick: function () { hs.appendChild(bloqueHallazgo({ control: CONTROLES[3], prioridad: PRIORIDADES[4], base: 'Observable' })); }
    }));
  }

  function valor(cont, nombre) {
    var n = cont.querySelector(':scope > [data-campo="' + nombre + '"], :scope > label > [data-campo="' + nombre + '"]');
    if (!n) return '';
    return n.type === 'checkbox' ? n.checked : n.value.trim();
  }
  function lineas(cont, nombre) {
    return String(valor(cont, nombre) || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /** Lee el formulario de edición y devuelve { centro, analisis }. */
  function recoger(cont) {
    var hallazgos = Array.prototype.map.call(cont.querySelectorAll('.hallazgo-ed'), function (b) {
      var h = {};
      ['peligro', 'riesgo', 'consecuencia', 'medida', 'control', 'prioridad', 'base'].forEach(function (k) {
        h[k] = b.querySelector('[data-campo="' + k + '"]').value.trim();
      });
      return h;
    }).filter(function (h) { return h.peligro || h.riesgo || h.medida; });
    return {
      centro: valor(cont, 'centro'),
      analisis: {
        imagenUtil: true,
        resumen: valor(cont, 'resumen'),
        descripcion: valor(cont, 'descripcion'),
        observables: lineas(cont, 'observables'),
        inferidas: lineas(cont, 'inferidas'),
        hallazgos: hallazgos,
        recomendaciones: lineas(cont, 'recomendaciones'),
        buenasPracticas: lineas(cont, 'buenasPracticas'),
        verificacion: lineas(cont, 'verificacion'),
        prioridadGeneral: valor(cont, 'prioridadGeneral'),
        critica: valor(cont, 'critica') === true,
        accionInmediata: valor(cont, 'accionInmediata'),
        marcoReferencia: lineas(cont, 'marcoReferencia')
      }
    };
  }

  window.Informe = { render: render, editar: editar, recoger: recoger };
})();
