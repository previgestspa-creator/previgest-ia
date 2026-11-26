/*
 * Procesamiento de imágenes en el dispositivo:
 *  - Valida el archivo.
 *  - Corrige orientación, reduce tamaño y comprime a JPEG.
 *  - Al redibujar en un canvas se eliminan TODOS los metadatos (EXIF/GPS).
 *  - Pixelado irreversible de zonas (rostros, credenciales, patentes).
 */
(function () {
  'use strict';
  var LADO_MAX = 1600;
  var MAX_BYTES = 1200 * 1024;
  var MAX_ENTRADA = 40 * 1024 * 1024;

  function cargarBitmap(blob) {
    if (window.createImageBitmap) {
      return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () { return cargarImg(blob); });
    }
    return cargarImg(blob);
  }

  function cargarImg(blob) {
    return new Promise(function (ok, mal) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { ok(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la imagen. Use una fotografía JPG o PNG.')); };
      img.src = url;
    });
  }

  function aBlob(canvas, calidad) {
    return new Promise(function (ok, mal) {
      canvas.toBlob(function (b) { b ? ok(b) : mal(new Error('No se pudo comprimir la imagen.')); }, 'image/jpeg', calidad);
    });
  }

  function dibujar(fuente, ladoMax) {
    var w = fuente.width, h = fuente.height;
    var f = Math.min(1, ladoMax / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * f); c.height = Math.round(h * f);
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, 0, 0, c.width, c.height);
    return c;
  }

  /** Devuelve { blob, ancho, alto } con JPEG comprimido y sin metadatos. */
  function procesar(archivo) {
    if (!archivo) return Promise.reject(new Error('No se seleccionó ninguna imagen.'));
    if (!/^image\//.test(archivo.type || '') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(archivo.name || '')) {
      return Promise.reject(new Error('El archivo seleccionado no es una imagen.'));
    }
    if (archivo.size > MAX_ENTRADA) return Promise.reject(new Error('La imagen es demasiado grande (máx. 40 MB).'));
    return cargarBitmap(archivo).then(function (bmp) {
      if (!bmp.width || !bmp.height) throw new Error('Imagen vacía o dañada.');
      var intentos = [[LADO_MAX, 0.82], [LADO_MAX, 0.7], [1280, 0.7], [1024, 0.65]];
      var i = 0;
      function probar() {
        var c = dibujar(bmp, intentos[i][0]);
        return aBlob(c, intentos[i][1]).then(function (b) {
          if (b.size > MAX_BYTES && ++i < intentos.length) return probar();
          return { blob: b, ancho: c.width, alto: c.height };
        });
      }
      return probar();
    });
  }

  /** Pixela una región (coordenadas en píxeles de la imagen) de forma irreversible. */
  function pixelar(ctx, x, y, w, h) {
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
    w = Math.round(Math.min(w, ctx.canvas.width - x)); h = Math.round(Math.min(h, ctx.canvas.height - y));
    if (w < 2 || h < 2) return;
    var bloque = Math.max(10, Math.ceil(Math.min(w, h) / 6));
    var pw = Math.max(1, Math.ceil(w / bloque)), ph = Math.max(1, Math.ceil(h / bloque));
    var t = document.createElement('canvas');
    t.width = pw; t.height = ph;
    var tc = t.getContext('2d');
    tc.imageSmoothingEnabled = true;
    tc.drawImage(ctx.canvas, x, y, w, h, 0, 0, pw, ph);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t, 0, 0, pw, ph, x, y, w, h);
    ctx.restore();
  }

  window.Imagen = { procesar: procesar, cargar: cargarBitmap, pixelar: pixelar, aBlob: aBlob };
})();
