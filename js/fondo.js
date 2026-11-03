// Fondos de la portada. Todos son máscaras: lo claro de la imagen se pinta con el papel del tono y lo oscuro deja ver
// el campo. Así cualquier foto queda a dos tintas, del mismo modo que el grabado de serie.
window.ED = window.ED || {};
(function (ED) {
  ED.FONDOS_SERIE = [
    { id: 'jinete', nombre: 'Jinete', url: 'img/paisaje.webp', pos: 'center bottom' }
  ];
  var ANCHO = 1600;
  var urlPropia = null;

  // Una foto en color pasa a tramado de una tinta: grises, contraste estirado por percentiles y difusión de error
  // (Floyd-Steinberg), que es lo que da el grano de imprenta en vez de un gris liso.
  ED.fotoAMascara = function (archivo) {
    return new Promise(function (ok, mal) {
      var img = new Image();
      img.onload = function () {
        var esc = Math.min(1, ANCHO / img.naturalWidth);
        var w = Math.round(img.naturalWidth * esc), h = Math.round(img.naturalHeight * esc);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, w, h);
        var d = x.getImageData(0, 0, w, h), p = d.data, n = w * h;
        var g = new Float32Array(n), hist = new Uint32Array(256);
        for (var i = 0; i < n; i++) {
          var v = 0.2126 * p[i * 4] + 0.7152 * p[i * 4 + 1] + 0.0722 * p[i * 4 + 2];
          g[i] = v; hist[v | 0]++;
        }
        var bajo = 0, alto = 255, acum = 0;
        for (var b = 0; b < 256; b++) { acum += hist[b]; if (acum > n * 0.02) { bajo = b; break; } }
        acum = 0;
        for (var a = 255; a >= 0; a--) { acum += hist[a]; if (acum > n * 0.02) { alto = a; break; } }
        var rango = Math.max(1, alto - bajo);
        for (i = 0; i < n; i++) g[i] = Math.pow(Math.min(1, Math.max(0, (g[i] - bajo) / rango)), 1.1) * 255;
        // Como en el grabado de serie, la parte de arriba queda del color del campo para que el texto se lea encima:
        // la imagen se funde hacia arriba con un tramado cada vez más disperso.
        for (var fy = 0; fy < h; fy++) {
          var f = (fy / h - 0.36) / 0.26, s = f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f);
          if (s < 1) for (var fx = 0; fx < w; fx++) g[fy * w + fx] *= s;
        }
        for (var yy = 0; yy < h; yy++) {
          for (var xx = 0; xx < w; xx++) {
            var k = yy * w + xx, viejo = g[k], nuevo = viejo < 128 ? 0 : 255, err = viejo - nuevo;
            g[k] = nuevo;
            if (xx + 1 < w) g[k + 1] += err * 7 / 16;
            if (yy + 1 < h) {
              if (xx > 0) g[k + w - 1] += err * 3 / 16;
              g[k + w] += err * 5 / 16;
              if (xx + 1 < w) g[k + w + 1] += err * 1 / 16;
            }
          }
        }
        for (i = 0; i < n; i++) { p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = 255; p[i * 4 + 3] = g[i]; }
        x.putImageData(d, 0, 0);
        URL.revokeObjectURL(img.src);
        c.toBlob(function (blob) { blob ? ok(blob) : mal(new Error('No se ha podido preparar la imagen.')); }, 'image/png');
      };
      img.onerror = function () { mal(new Error('Ese archivo no es una imagen que se pueda abrir.')); };
      img.src = URL.createObjectURL(archivo);
    });
  };

  function pintar(url, pos) {
    var el = document.getElementById('ed-paisaje');
    el.style.setProperty('--fondo', 'url("' + url + '")');
    el.style.setProperty('--fondo-pos', pos);
  }

  // Antes de entrar siempre se ve el jinete; después, el fondo que la persona tenga elegido en su cuenta.
  ED.ponerFondoInicial = function () {
    var j = ED.FONDOS_SERIE[0];
    pintar(new URL(j.url, location.href).href, j.pos);
  };

  ED.aplicarFondo = async function () {
    var f = (ED.prefs && ED.prefs.fondo) || { tipo: 'serie', id: 'jinete' };
    var ruta = ED.prefs && ED.prefs.fondoPropio;
    if (f.tipo === 'propio' && ruta) {
      try {
        if (!urlPropia || urlPropia.ruta !== ruta) {
          var r = await sb.storage.from('documents').download(ruta);
          if (r.error) throw r.error;
          if (urlPropia) URL.revokeObjectURL(urlPropia.url);
          urlPropia = { ruta: ruta, url: URL.createObjectURL(r.data) };
        }
        pintar(urlPropia.url, 'center bottom');
        return;
      } catch (e) { /* sin red o archivo borrado: se queda el de serie */ }
    }
    var s = ED.FONDOS_SERIE.find(function (x) { return x.id === f.id; }) || ED.FONDOS_SERIE[0];
    pintar(new URL(s.url, location.href).href, s.pos);
  };

  // El fondo propio va en el almacén de documentos de la cuenta, en una subcarpeta que la lista de Documentos ignora.
  ED.subirFondo = async function (archivo) {
    var blob = await ED.fotoAMascara(archivo);
    var uid = (await sb.auth.getUser()).data.user.id;
    var ruta = uid + '/editorial/fondo-' + Date.now() + '.png';
    var r = await sb.storage.from('documents').upload(ruta, blob, { contentType: 'image/png', upsert: false });
    if (r.error) throw r.error;
    var anterior = ED.prefs && ED.prefs.fondoPropio;
    await ED.guardarPrefs({ fondo: { tipo: 'propio' }, fondoPropio: ruta });
    if (anterior) sb.storage.from('documents').remove([anterior]).catch(function () {});
    await ED.aplicarFondo();
  };

  ED.elegirFondo = async function (fondo) {
    await ED.guardarPrefs({ fondo: fondo });
    await ED.aplicarFondo();
  };

  ED.quitarFondoPropio = async function () {
    var anterior = ED.prefs && ED.prefs.fondoPropio;
    await ED.guardarPrefs({ fondo: { tipo: 'serie', id: 'jinete' }, fondoPropio: null });
    if (anterior) sb.storage.from('documents').remove([anterior]).catch(function () {});
    await ED.aplicarFondo();
  };
})(window.ED);
