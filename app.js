/*
 * Previgest IA — controlador principal de la aplicación.
 */
(function () {
  'use strict';
  var $ = U.$, el = U.el;
  var K_CONFIG = 'pg_config', K_SESION = 'pg_sesion', K_LUGARES = 'pg_lugares';

  var actual = null;      // observación en curso
  var fotoUrl = null;     // URL temporal de la foto en pantalla
  var editando = false;
  var ocupado = false;

  /* ================= Configuración ================= */

  function config() {
    var c = U.leerJSON(K_CONFIG, {});
    return {
      apiUrl: c.apiUrl || (window.PREVIGEST_CONFIG && PREVIGEST_CONFIG.API_URL) || '',
      clave: c.clave || '',
      observador: c.observador || '',
      destinatario: c.destinatario || '',
      autoEnvio: !!c.autoEnvio
    };
  }
  function sesion() { return U.leerJSON(K_SESION, null); }

  /* ================= Avisos ================= */

  var toastTimer = null;
  function toast(msg, esError) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (esError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, esError ? 7000 : 4000);
  }
  function cargando(on, texto) {
    $('cargando').hidden = !on;
    $('cargandoTexto').textContent = texto || 'Procesando…';
  }
  function conBloqueo(texto, fn) {
    if (ocupado) return Promise.resolve();
    ocupado = true;
    cargando(true, texto);
    return Promise.resolve().then(fn).catch(function (e) {
      toast(e && e.message ? e.message : 'Ocurrió un error.', true);
    }).finally(function () {
      ocupado = false;
      cargando(false);
    });
  }

  /* ================= Navegación ================= */

  function irA(vista) {
    ['inicio', 'historial', 'config'].forEach(function (v) {
      $('vista-' + v).hidden = v !== vista;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('activa', b.getAttribute('data-vista') === vista);
    });
    if (vista === 'historial') { renderPendientes(); llenarFiltroEmpresas(); }
    if (vista === 'config') cargarFormConfig();
    window.scrollTo(0, 0);
  }

  /* ================= Estado de red y pendientes ================= */

  function actualizarRed() {
    var r = $('estadoRed');
    var en = navigator.onLine;
    r.textContent = en ? 'En línea' : 'Sin conexión';
    r.className = 'red' + (en ? '' : ' sin');
    actualizarAviso();
    renderAyudaAnalizar();
  }

  function actualizarAviso() {
    DB.todas().then(function (lista) {
      var pend = lista.filter(function (o) { return o.estado !== 'guardado' && o.estado !== 'borrador'; });
      var sinAnalisis = pend.filter(function (o) { return o.estado === 'pendiente'; });
      var badge = $('badgePendientes');
      badge.hidden = pend.length === 0;
      badge.textContent = String(pend.length);
      var aviso = $('aviso'), acc = $('avisoAccion');
      if (!navigator.onLine) {
        aviso.hidden = false;
        $('avisoTexto').textContent = 'Sin conexión: puede capturar y guardar observaciones. Se analizarán cuando vuelva la conexión.';
        acc.hidden = true;
      } else if (sinAnalisis.length) {
        aviso.hidden = false;
        $('avisoTexto').textContent = sinAnalisis.length + ' observación(es) sin sincronizar ni analizar.';
        acc.hidden = false;
        acc.textContent = 'Analizar ahora';
        acc.onclick = procesarPendientes;
      } else {
        aviso.hidden = true;
      }
      $('btnProcesarPendientes').hidden = !(navigator.onLine && sinAnalisis.length);
    }).catch(function () {});
  }

  /* ================= Observación en curso ================= */

  function nuevaObservacion() {
    return {
      id: U.uuid(),
      creado: new Date().toISOString(),
      estado: 'borrador',
      obs: { empresa: '', centro: '', actividad: '', actividadDetalle: '', contexto: '', fecha: new Date().toISOString(), observador: config().observador },
      foto: null,
      anonimizada: false,
      confirmaPrivacidad: false
    };
  }

  function obsPayload(rec) {
    var o = rec.obs;
    return {
      id: rec.id, empresa: o.empresa, centro: o.centro, fecha: o.fecha, observador: o.observador,
      actividad: o.actividad, actividadDetalle: o.actividad === 'Otra actividad' ? o.actividadDetalle : '', contexto: o.contexto
    };
  }
  function informePayload(rec) {
    return { observacion: obsPayload(rec), analisis: rec.analisis, modelo: rec.modelo || '' };
  }

  function ponerFoto(blob) {
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    fotoUrl = blob ? URL.createObjectURL(blob) : null;
    $('fotoVacia').hidden = !!blob;
    $('fotoVista').hidden = !blob;
    if (blob) {
      $('imgVista').src = fotoUrl;
      $('fotoInfo').textContent = Math.round(blob.size / 1024) + ' KB · sin metadatos' + (actual.anonimizada ? ' · datos ocultados' : '');
    } else {
      $('imgVista').removeAttribute('src');
    }
  }

  function cargarFormulario(rec) {
    actual = rec;
    editando = false;
    $('empresa').value = rec.obs.empresa || '';
    $('centro').value = rec.obs.centro || '';
    $('actividad').value = rec.obs.actividad || '';
    $('actividadDetalle').value = rec.obs.actividadDetalle || '';
    $('campoOtra').hidden = rec.obs.actividad !== 'Otra actividad';
    $('contexto').value = rec.obs.contexto || '';
    $('chkPrivacidad').checked = !!rec.confirmaPrivacidad;
    ponerFoto(rec.foto);
    renderMeta();
    llenarCentros();
    $('paso-captura').hidden = false;
    $('paso-informe').hidden = true;
  }

  function renderMeta() {
    $('metaFecha').textContent = U.fechaHora(actual.obs.fecha);
    var obs = actual.obs.observador || config().observador;
    $('metaObservador').textContent = obs ? 'Observador: ' + obs : 'Configure su nombre en Configuración';
  }

  function renderAyudaAnalizar() {
    var btn = $('btnAnalizar');
    if (!btn) return;
    btn.textContent = navigator.onLine ? 'Analizar con IA' : 'Guardar sin conexión';
    $('ayudaAnalizar').textContent = navigator.onLine
      ? 'La observación se guarda en el dispositivo antes de enviarse.'
      : 'Se guardará en el dispositivo y podrá analizarla al recuperar la conexión.';
  }

  var guardadoTimer = null;
  function leerFormulario() {
    var o = actual.obs;
    o.empresa = $('empresa').value.replace(/\s+/g, ' ').trim();
    o.centro = $('centro').value.replace(/\s+/g, ' ').trim();
    o.actividad = $('actividad').value;
    o.actividadDetalle = $('actividadDetalle').value.trim();
    o.contexto = $('contexto').value.trim();
    if (!o.observador) o.observador = config().observador;
    actual.confirmaPrivacidad = $('chkPrivacidad').checked;
  }
  /** Autoguardado del borrador en el dispositivo (protege ante cierres inesperados). */
  function autoguardar() {
    clearTimeout(guardadoTimer);
    guardadoTimer = setTimeout(function () {
      if (!actual || !actual.foto || actual.estado === 'guardado') return;
      leerFormulario();
      DB.guardar(actual).catch(function () {});
    }, 700);
  }

  /* ================= Lugares usados (empresas y centros) ================= */

  function recordarLugar(empresa, centro) {
    var l = U.leerJSON(K_LUGARES, {});
    l[empresa] = l[empresa] || [];
    if (l[empresa].indexOf(centro) < 0) l[empresa].unshift(centro);
    l[empresa] = l[empresa].slice(0, 50);
    U.guardarJSON(K_LUGARES, l);
  }
  function empresasConocidas() {
    var s = sesion();
    var locales = Object.keys(U.leerJSON(K_LUGARES, {}));
    if (s && !s.accesoTotal) return s.empresas.slice();
    var todas = (s ? s.empresas : []).concat(locales);
    return todas.filter(function (e, i) { return todas.indexOf(e) === i; }).sort();
  }
  function llenarEmpresas() {
    var dl = $('listaEmpresas');
    dl.textContent = '';
    empresasConocidas().forEach(function (e) { dl.appendChild(el('option', { value: e })); });
  }
  function llenarCentros() {
    var emp = $('empresa').value.trim().toLowerCase();
    var s = sesion();
    var lista = [];
    var l = U.leerJSON(K_LUGARES, {});
    Object.keys(l).forEach(function (k) { if (k.toLowerCase() === emp) lista = lista.concat(l[k]); });
    if (s && s.centros) Object.keys(s.centros).forEach(function (k) { if (k.toLowerCase() === emp) lista = lista.concat(s.centros[k]); });
    var dl = $('listaCentros');
    dl.textContent = '';
    lista.filter(function (c, i) { return lista.indexOf(c) === i; }).forEach(function (c) { dl.appendChild(el('option', { value: c })); });
  }

  /* ================= Fotografía ================= */

  function alElegirFoto(ev) {
    var archivo = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!archivo) return;
    conBloqueo('Optimizando fotografía…', function () {
      return Imagen.procesar(archivo).then(function (r) {
        if (!actual || actual.estado !== 'borrador') cargarFormulario(nuevaObservacion());
        actual.foto = r.blob;
        actual.anonimizada = false;
        actual.obs.fecha = new Date().toISOString();
        $('chkPrivacidad').checked = false;
        actual.confirmaPrivacidad = false;
        ponerFoto(r.blob);
        renderMeta();
        autoguardar();
      });
    });
  }

  function quitarFoto() {
    if (!actual || !actual.foto) return;
    if (!confirm('¿Eliminar la fotografía?')) return;
    actual.foto = null;
    actual.anonimizada = false;
    ponerFoto(null);
    DB.eliminar(actual.id).catch(function () {});
  }

  /* ---------- Editor de anonimización ---------- */
  var ed = { bmp: null, rects: [], inicio: null, temp: null };

  function abrirEditor() {
    if (!actual || !actual.foto) return;
    conBloqueo('Preparando editor…', function () {
      return Imagen.cargar(actual.foto).then(function (bmp) {
        ed.bmp = bmp; ed.rects = []; ed.inicio = null; ed.temp = null;
        var c = $('lienzo');
        c.width = bmp.width; c.height = bmp.height;
        redibujar();
        $('editor').hidden = false;
      });
    });
  }
  function redibujar() {
    var c = $('lienzo'), ctx = c.getContext('2d');
    ctx.drawImage(ed.bmp, 0, 0, c.width, c.height);
    ed.rects.forEach(function (r) { Imagen.pixelar(ctx, r.x, r.y, r.w, r.h); });
    if (ed.temp) {
      ctx.save();
      ctx.lineWidth = Math.max(3, c.width / 300);
      ctx.strokeStyle = '#19b5c1';
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(ed.temp.x, ed.temp.y, ed.temp.w, ed.temp.h);
      ctx.restore();
    }
  }
  function puntoLienzo(ev) {
    var c = $('lienzo'), r = c.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height };
  }
  function rectDe(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }
  function bindEditor() {
    var c = $('lienzo');
    c.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      c.setPointerCapture(ev.pointerId);
      ed.inicio = puntoLienzo(ev);
    });
    c.addEventListener('pointermove', function (ev) {
      if (!ed.inicio) return;
      ed.temp = rectDe(ed.inicio, puntoLienzo(ev));
      redibujar();
    });
    function fin(ev) {
      if (!ed.inicio) return;
      var r = rectDe(ed.inicio, puntoLienzo(ev));
      ed.inicio = null; ed.temp = null;
      var minimo = Math.max(8, c.width / 100);
      if (r.w >= minimo && r.h >= minimo) ed.rects.push(r);
      redibujar();
    }
    c.addEventListener('pointerup', fin);
    c.addEventListener('pointercancel', function () { ed.inicio = null; ed.temp = null; redibujar(); });
    $('edDeshacer').addEventListener('click', function () { ed.rects.pop(); redibujar(); });
    $('edCancelar').addEventListener('click', function () { $('editor').hidden = true; });
    $('edAplicar').addEventListener('click', function () {
      if (!ed.rects.length) { $('editor').hidden = true; return; }
      ed.temp = null;
      redibujar();
      Imagen.aBlob($('lienzo'), 0.85).then(function (b) {
        actual.foto = b;
        actual.anonimizada = true;
        ponerFoto(b);
        autoguardar();
        $('editor').hidden = true;
        toast('Zonas ocultadas de forma permanente en la fotografía.');
      });
    });
  }

  /* ================= Dictado por voz (Web Speech API, gratuito si el navegador lo ofrece) ================= */

  function bindDictado() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    var btn = $('btnDictar');
    btn.hidden = false;
    var rec = null;
    btn.addEventListener('click', function () {
      if (rec) { rec.stop(); return; }
      if (!navigator.onLine) { toast('El dictado requiere conexión. Puede usar el micrófono del teclado.', true); return; }
      rec = new SR();
      rec.lang = 'es-CL';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = function (e) {
        var t = Array.prototype.map.call(e.results, function (r) { return r[0].transcript; }).join(' ');
        var area = $('contexto');
        area.value = (area.value ? area.value.trim() + ' ' : '') + t.trim();
        autoguardar();
      };
      rec.onerror = function () { toast('No se pudo usar el dictado. Escriba el contexto o use el micrófono del teclado.', true); };
      rec.onend = function () { rec = null; btn.classList.remove('grabando'); };
      btn.classList.add('grabando');
      rec.start();
    });
  }

  /* ================= Análisis ================= */

  function validarCaptura() {
    leerFormulario();
    var o = actual.obs;
    if (!actual.foto) return 'Agregue una fotografía.';
    if (!o.empresa) return 'Indique la empresa.';
    if (!o.centro) return 'Indique el centro de trabajo, instalación o embarcación.';
    if (!o.actividad) return 'Seleccione el tipo de actividad.';
    if (!o.observador) return 'Configure su nombre de observador en Configuración.';
    var s = sesion();
    if (s && !s.accesoTotal && s.empresas.map(function (e) { return e.toLowerCase(); }).indexOf(o.empresa.toLowerCase()) < 0) {
      return 'No tiene permiso para registrar observaciones de esta empresa.';
    }
    if (!actual.confirmaPrivacidad) return 'Confirme que la fotografía no contiene datos personales o confidenciales sin ocultar.';
    return '';
  }

  function alAnalizar() {
    if (ocupado) return;
    var err = validarCaptura();
    if (err) { toast(err, true); return; }
    actual.estado = 'pendiente';
    recordarLugar(actual.obs.empresa, actual.obs.centro);
    DB.guardar(actual).then(function () {
      actualizarAviso();
      if (!navigator.onLine) {
        toast('Observación guardada en el dispositivo. Quedó pendiente de análisis.');
        cargarFormulario(nuevaObservacion());
        return;
      }
      var rec = actual;
      conBloqueo('Analizando con IA… puede tardar hasta un minuto.', function () {
        return analizarRegistro(rec).then(function () { mostrarInforme(rec); }).catch(function (e) {
          if (Api.esTransitorio(e)) {
            cargarFormulario(nuevaObservacion());
            throw new Error(e.message + ' La observación quedó guardada en Historial › Pendientes.');
          }
          throw e;
        });
      });
    }).catch(function (e) { toast('No se pudo guardar en el dispositivo: ' + e.message, true); });
  }

  function analizarRegistro(rec) {
    return U.blobABase64(rec.foto).then(function (b64) {
      return Api.llamar('analizar', { observacion: obsPayload(rec), foto: b64, confirmaPrivacidad: rec.confirmaPrivacidad === true }, { timeout: 150000 });
    }).then(function (r) {
      rec.numero = r.numero;
      rec.analisis = r.analisis;
      rec.modelo = r.modelo;
      rec.estado = 'analizado';
      rec.ultimoError = '';
      return DB.guardar(rec);
    }, function (e) {
      rec.ultimoError = e.message;
      return DB.guardar(rec).then(function () { throw e; }, function () { throw e; });
    }).finally(actualizarAviso);
  }

  function procesarPendientes() {
    if (!navigator.onLine) { toast('Sin conexión.', true); return; }
    conBloqueo('Analizando observaciones pendientes…', function () {
      return DB.todas().then(function (lista) {
        var cola = lista.filter(function (o) { return o.estado === 'pendiente'; }).reverse();
        var ok = 0;
        function siguiente() {
          if (!cola.length) return ok;
          var rec = cola.shift();
          $('cargandoTexto').textContent = 'Analizando ' + (ok + 1) + ' de ' + (ok + cola.length + 1) + '…';
          return analizarRegistro(rec).then(function () { ok++; return siguiente(); });
        }
        return siguiente().then(function (n) {
          toast(n + ' observación(es) analizada(s). Revíselas y apruébelas en Historial › Pendientes.');
        }, function (e) {
          throw new Error((ok ? ok + ' analizada(s). ' : '') + 'Se detuvo: ' + e.message + ' Las demás siguen pendientes.');
        });
      });
    }).then(function () { renderPendientes(); });
  }

  /* ================= Informe ================= */

  function mostrarInforme(rec) {
    actual = rec;
    editando = false;
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    fotoUrl = rec.foto ? URL.createObjectURL(rec.foto) : null;
    Informe.render(rec, $('informe'), fotoUrl);
    $('btnEditar').textContent = 'Editar informe';
    $('paso-captura').hidden = true;
    $('paso-informe').hidden = false;
    irA('inicio');
  }

  /** Aplica la edición en curso (si la hay) antes de cualquier otra acción. */
  function confirmarEdicion() {
    if (!editando) return Promise.resolve();
    var r = Informe.recoger($('informe'));
    if (!r.centro) return Promise.reject(new Error('El centro de trabajo no puede quedar vacío.'));
    actual.obs.centro = r.centro;
    actual.analisis = r.analisis;
    editando = false;
    $('btnEditar').textContent = 'Editar informe';
    Informe.render(actual, $('informe'), fotoUrl);
    // Si ya estaba aprobado, vuelve a borrador hasta que se guarde nuevamente.
    if (actual.estado === 'guardado') actual.estado = 'analizado';
    Informe.render(actual, $('informe'), fotoUrl);
    return DB.guardar(actual).then(actualizarAviso);
  }

  function alEditar() {
    if (editando) {
      confirmarEdicion().then(function () { toast('Cambios aplicados. Recuerde guardar el informe.'); }, function (e) { toast(e.message, true); });
      return;
    }
    editando = true;
    Informe.editar(actual, $('informe'));
    $('btnEditar').textContent = 'Listo (aplicar cambios)';
  }

  function alPdf() {
    conBloqueo('Generando PDF…', function () {
      return confirmarEdicion().then(function () { return U.blobABase64(actual.foto); }).then(function (b64) {
        return Api.llamar('pdf', { informe: informePayload(actual), foto: b64 }, { timeout: 90000 });
      }).then(function (r) {
        U.descargar(U.base64ABlob(r.pdf, 'application/pdf'), r.nombre);
        toast('PDF descargado.');
      });
    });
  }

  function guardarEnServidor(enviar, destinatario) {
    return confirmarEdicion().then(function () { return U.blobABase64(actual.foto); }).then(function (b64) {
      return Api.llamar(enviar ? 'enviar' : 'guardar', {
        informe: informePayload(actual), foto: b64, destinatario: destinatario || ''
      }, { timeout: 120000 });
    }).then(function (r) {
      var rec = actual;
      rec.numero = r.numero;
      rec.estado = 'guardado';
      rec.estadoServidor = r.estado;
      // Solo ahora, con la confirmación del servidor, se elimina la copia local.
      return DB.eliminar(rec.id).then(function () {
        Informe.render(rec, $('informe'), fotoUrl);
        actualizarAviso();
        if (r.aviso) toast(r.aviso, true);
        else toast(r.enviado ? 'Informe guardado y enviado por correo.' : 'Informe aprobado y guardado en Drive.');
      });
    });
  }

  function alGuardar() {
    var c = config();
    var s = sesion();
    var destino = c.destinatario || (s && s.correoPredeterminado) || '';
    var enviar = c.autoEnvio && !!destino;
    conBloqueo(enviar ? 'Guardando y enviando…' : 'Guardando informe…', function () {
      return guardarEnServidor(enviar, destino);
    });
  }

  function alCorreo() {
    var c = config(), s = sesion();
    $('dlgDestino').value = c.destinatario || (s && s.correoPredeterminado) || '';
    $('dlgCorreo').hidden = false;
    $('dlgDestino').focus();
  }
  function alEnviarDialogo() {
    var d = $('dlgDestino').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d)) { toast('Ingrese un correo válido.', true); return; }
    $('dlgCorreo').hidden = true;
    conBloqueo('Guardando y enviando…', function () { return guardarEnServidor(true, d); });
  }

  function alNueva() {
    if (actual && actual.estado === 'analizado') toast('El informe sin aprobar quedó en Historial › Pendientes.');
    cargarFormulario(nuevaObservacion());
    actualizarAviso();
  }

  /* ================= Historial ================= */

  function etiquetaEstadoLocal(o) {
    if (o.estado === 'pendiente') return 'No sincronizada · pendiente de análisis';
    if (o.estado === 'analizado') return 'Analizada · informe no guardado';
    return 'Borrador incompleto';
  }

  function renderPendientes() {
    var cont = $('listaPendientes');
    DB.todas().then(function (lista) {
      cont.textContent = '';
      var pend = lista.filter(function (o) { return o.estado !== 'guardado'; });
      if (!pend.length) { cont.appendChild(el('p', { class: 'tenue', text: 'No hay observaciones pendientes.' })); return; }
      pend.forEach(function (o) {
        var botones = [
          el('button', { class: 'btn btn-secundario', type: 'button', text: 'Abrir', onclick: function () { abrirLocal(o.id); } })
        ];
        botones.push(el('button', {
          class: 'btn btn-borde btn-peligro', type: 'button', text: 'Eliminar',
          onclick: function () {
            if (!confirm('¿Eliminar esta observación del dispositivo? No se podrá recuperar.')) return;
            DB.eliminar(o.id).then(function () { renderPendientes(); actualizarAviso(); });
          }
        }));
        cont.appendChild(el('div', { class: 'item' }, [
          el('div', { class: 'tit' }, [el('span', { text: (o.obs.empresa || 'Sin empresa') + ' · ' + (o.obs.centro || 'Sin centro') })]),
          el('div', { class: 'sub', text: U.fechaHora(o.obs.fecha) + (o.obs.actividad ? ' · ' + o.obs.actividad : '') }),
          el('p', null, [el('span', { class: 'sin-sync', text: etiquetaEstadoLocal(o) })]),
          o.ultimoError ? el('p', { class: 'tenue', text: 'Último intento: ' + o.ultimoError }) : null,
          el('div', { class: 'fila-botones' }, botones)
        ]));
      });
    });
    actualizarAviso();
  }

  function abrirLocal(id) {
    DB.obtener(id).then(function (o) {
      if (!o) return;
      if (o.estado === 'analizado' && o.analisis) { mostrarInforme(o); return; }
      cargarFormulario(o);
      if (o.estado === 'pendiente') o.estado = 'borrador';
      irA('inicio');
    });
  }

  function llenarFiltroEmpresas() {
    var s = $('fEmpresa');
    var valor = s.value;
    s.textContent = '';
    s.appendChild(el('option', { value: '', text: 'Todas las empresas' }));
    empresasConocidas().forEach(function (e) { s.appendChild(el('option', { value: e, text: e })); });
    s.value = valor;
  }

  function buscar() {
    conBloqueo('Buscando…', consultarHistorial);
  }

  function consultarHistorial() {
    var filtros = {
      empresa: $('fEmpresa').value, centro: $('fCentro').value.trim(),
      desde: $('fDesde').value, hasta: $('fHasta').value, prioridad: $('fPrioridad').value
    };
    return Api.llamar('historial', { filtros: filtros }).then(renderHistorial);
  }

  function renderHistorial(r) {
    var cont = $('listaHistorial');
    cont.textContent = '';
    $('resumenHistorial').textContent = r.total + ' informe(s)' + (r.total > r.registros.length ? ' · se muestran los ' + r.registros.length + ' más recientes' : '');
    r.registros.forEach(function (o) {
      var botones = [];
      if (o.tienePdf) {
        botones.push(el('button', {
          class: 'btn btn-secundario', type: 'button', text: 'Ver PDF',
          onclick: function () {
            conBloqueo('Descargando PDF…', function () {
              return Api.llamar('descargar', { empresa: o.empresa, id: o.id }).then(function (d) {
                U.descargar(U.base64ABlob(d.pdf, 'application/pdf'), d.nombre);
              });
            });
          }
        }));
      }
      if (o.puedeEliminar) {
        botones.push(el('button', {
          class: 'btn btn-borde btn-peligro', type: 'button', text: 'Eliminar',
          onclick: function () {
            if (!confirm('¿Eliminar la observación N.º ' + o.numero + '? Se enviará el PDF a la papelera de Drive y se quitará del registro.')) return;
            conBloqueo('Eliminando…', function () {
              return Api.llamar('eliminar', { empresa: o.empresa, id: o.id }).then(function () { toast('Observación eliminada.'); return consultarHistorial(); });
            });
          }
        }));
      }
      cont.appendChild(el('div', { class: 'item' }, [
        el('div', { class: 'tit' }, [el('span', { text: 'N.º ' + o.numero }), el('span', { class: U.clasePrioridad(o.prioridad), text: U.textoPrioridad(o.prioridad) })]),
        el('div', { class: 'sub', text: o.fecha + ' · ' + o.empresa + ' · ' + o.centro }),
        el('div', { class: 'sub', text: o.actividad + ' · ' + o.estado }),
        o.resumen ? el('p', { text: o.resumen }) : null,
        botones.length ? el('div', { class: 'fila-botones' }, botones) : null
      ]));
    });
    if (!r.registros.length) cont.appendChild(el('p', { class: 'tenue', text: 'No hay informes con esos filtros.' }));
  }

  /* ================= Configuración ================= */

  function cargarFormConfig() {
    var c = config();
    $('cfgObservador').value = c.observador;
    $('cfgClave').value = c.clave;
    $('cfgUrl').value = c.apiUrl;
    $('cfgCorreo').value = c.destinatario;
    $('cfgAutoEnvio').checked = c.autoEnvio;
    var s = sesion();
    if (s) mostrarEstadoServidor(s);
  }

  function mostrarEstadoServidor(s) {
    var box = $('estadoServidor');
    box.hidden = false;
    box.textContent = '';
    var lineas = [
      'Conectado como ' + s.usuario.nombre + ' (' + (s.usuario.rol === 'ADMIN' ? 'administrador' : 'observador') + ').',
      'Empresas autorizadas: ' + (s.accesoTotal ? 'todas' : s.empresas.join(', ') || 'ninguna'),
      'IA: ' + (s.ia.autorizada ? 'autorizada' : 'NO autorizada por el administrador') + ' · ' + s.ia.proveedor + ' (' + s.ia.modelos.join(', ') + ')',
      'Análisis hoy: ' + s.ia.usoHoy + ' de ' + s.ia.limiteDiario + ' · Correos disponibles hoy: ' + (s.correosRestantes >= 0 ? s.correosRestantes : 's/i')
    ];
    lineas.forEach(function (t) { box.appendChild(el('p', { text: t })); });
  }

  function cargarSesion(silencioso) {
    return Api.llamar('sesion', {}, { timeout: 30000 }).then(function (s) {
      U.guardarJSON(K_SESION, s);
      var c = U.leerJSON(K_CONFIG, {});
      if (!c.observador && s.usuario && s.usuario.nombre) { c.observador = s.usuario.nombre; U.guardarJSON(K_CONFIG, c); }
      if (actual && !actual.obs.observador) { actual.obs.observador = config().observador; renderMeta(); }
      llenarEmpresas();
      llenarCentros();
      return s;
    }, function (e) {
      if (!silencioso) throw e;
    });
  }

  function alGuardarConfig() {
    var c = {
      observador: $('cfgObservador').value.trim(),
      clave: $('cfgClave').value.trim(),
      apiUrl: $('cfgUrl').value.trim(),
      destinatario: $('cfgCorreo').value.trim(),
      autoEnvio: $('cfgAutoEnvio').checked
    };
    if (c.destinatario && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.destinatario)) { toast('El correo destinatario no es válido.', true); return; }
    U.guardarJSON(K_CONFIG, c);
    if (actual && actual.estado === 'borrador') { actual.obs.observador = c.observador; renderMeta(); }
    if (!navigator.onLine) { toast('Configuración guardada. Se verificará al tener conexión.'); return; }
    conBloqueo('Verificando conexión…', function () {
      return cargarSesion(false).then(function (s) {
        mostrarEstadoServidor(s);
        toast('Configuración guardada. Conexión verificada.');
      });
    });
  }

  function alBorrarLocal() {
    if (!confirm('Se eliminarán las observaciones pendientes, la configuración y la clave guardadas en este dispositivo. ¿Continuar?')) return;
    DB.vaciar().then(function () {
      try { localStorage.clear(); } catch (e) {}
      location.reload();
    });
  }

  /* ================= Inicio ================= */

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.addEventListener('click', function () { irA(b.getAttribute('data-vista')); });
    });
    $('btnCamara').addEventListener('click', function () { $('inputCamara').click(); });
    $('btnGaleria').addEventListener('click', function () { $('inputGaleria').click(); });
    $('inputCamara').addEventListener('change', alElegirFoto);
    $('inputGaleria').addEventListener('change', alElegirFoto);
    $('btnReemplazar').addEventListener('click', function () { $('fotoVacia').hidden = !$('fotoVacia').hidden; });
    $('btnQuitarFoto').addEventListener('click', quitarFoto);
    $('btnAnonimizar').addEventListener('click', abrirEditor);
    $('empresa').addEventListener('input', function () { llenarCentros(); autoguardar(); });
    ['centro', 'contexto', 'actividadDetalle'].forEach(function (id) { $(id).addEventListener('input', autoguardar); });
    $('actividad').addEventListener('change', function () {
      $('campoOtra').hidden = $('actividad').value !== 'Otra actividad';
      autoguardar();
    });
    $('chkPrivacidad').addEventListener('change', autoguardar);
    $('btnAnalizar').addEventListener('click', alAnalizar);
    $('btnEditar').addEventListener('click', alEditar);
    $('btnPdf').addEventListener('click', alPdf);
    $('btnCorreo').addEventListener('click', alCorreo);
    $('btnGuardar').addEventListener('click', alGuardar);
    $('btnNueva').addEventListener('click', alNueva);
    $('dlgCancelar').addEventListener('click', function () { $('dlgCorreo').hidden = true; });
    $('dlgEnviar').addEventListener('click', alEnviarDialogo);
    $('btnBuscar').addEventListener('click', buscar);
    $('btnProcesarPendientes').addEventListener('click', procesarPendientes);
    $('btnGuardarConfig').addEventListener('click', alGuardarConfig);
    $('btnBorrarLocal').addEventListener('click', alBorrarLocal);
    window.addEventListener('online', function () { actualizarRed(); cargarSesion(true); });
    window.addEventListener('offline', actualizarRed);
    bindEditor();
    bindDictado();
  }

  function iniciar() {
    $('versionApp').textContent = 'Previgest IA v' + ((window.PREVIGEST_CONFIG && PREVIGEST_CONFIG.VERSION) || '1.0.0') + ' · Uso interno';
    bind();
    cargarFormulario(nuevaObservacion());
    llenarEmpresas();
    actualizarRed();
    var c = config();
    if (!c.clave || !c.apiUrl) {
      irA('config');
      toast('Configure la dirección del servidor y su clave de acceso para comenzar.');
    } else if (navigator.onLine) {
      cargarSesion(true);
    }
    var seguro = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if ('serviceWorker' in navigator && seguro) navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  window.App = { config: config };
  document.addEventListener('DOMContentLoaded', iniciar);
})();
