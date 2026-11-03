// Finanzas, primer apartado de la edición. De momento con datos de ejemplo, para fijar el diseño antes de conectarlo
// a los datos reales (que vendrán de la lógica de finanzas-pro.js, la misma de la app normal).
window.ED = window.ED || {};
(function (ED) {
  var POR_PAGINA = 20;
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var fmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  function dinero(n, conSigno) {
    if (Math.abs(n) < 0.005) n = 0;
    var s = fmt.format(Math.abs(n)) + ' €';
    if (n < 0) return '−' + s;
    return (conSigno && n > 0 ? '+ ' : '') + s;
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fechaCorta(s) { var p = s.split('-'); return p[2] + ' ' + MESES[+p[1] - 1]; }

  // ---------- Datos de ejemplo (siempre los mismos) ----------
  var ejemplo = (function () {
    var semilla = 7;
    function azar() { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; }
    var cuentas = [
      { id: 'bancos', nombre: 'Bancos', saldo: 9812.40 },
      { id: 'online', nombre: 'Online', saldo: 2481.50 },
      { id: 'efectivo', nombre: 'Efectivo', saldo: 186.30 }
    ];
    var total = cuentas.reduce(function (s, c) { return s + c.saldo; }, 0);
    var plantillas = [
      ['Mercadona', 'Supermercado', -1, 18, 64, 'bancos'], ['Lidl', 'Supermercado', -1, 12, 41, 'bancos'],
      ['Bar Casa Paco', 'Restaurantes', -1, 9, 38, 'efectivo'], ['La Tagliatella', 'Restaurantes', -1, 24, 52, 'bancos'],
      ['Renfe', 'Transporte', -1, 9, 34, 'online'], ['Gasolina Repsol', 'Transporte', -1, 40, 62, 'bancos'],
      ['Cines Palafox', 'Ocio', -1, 8, 19, 'online'], ['Casa del Libro', 'Ocio', -1, 14, 31, 'online'],
      ['Farmacia', 'Salud', -1, 6, 23, 'efectivo'], ['Amazon', 'Compras', -1, 11, 58, 'online']
    ];
    var fijos = [
      [1, 'Nómina', 'Sueldo', 1, 1840, 'bancos'], [2, 'Alquiler', 'Casa', -1, 540, 'bancos'],
      [5, 'Spotify', 'Suscripciones', -1, 10.99, 'online'], [8, 'Netflix', 'Suscripciones', -1, 13.99, 'online'],
      [10, 'Luz', 'Casa', -1, 46.20, 'bancos'], [12, 'Gimnasio', 'Salud', -1, 34.90, 'bancos'], [15, 'Internet y móvil', 'Casa', -1, 38.00, 'bancos']
    ];
    var hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    var movs = [], id = 0;
    for (var m = 11; m >= 0; m--) {
      var base = new Date(hoy.getFullYear(), hoy.getMonth() - m, 1, 12);
      var dias = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      fijos.forEach(function (f) {
        var d = new Date(base.getFullYear(), base.getMonth(), f[0], 12);
        if (d <= hoy) movs.push({ id: ++id, fecha: iso(d), concepto: f[1], categoria: f[2], importe: f[3] * f[4], cuenta: f[5] });
      });
      for (var k = 0; k < 16; k++) {
        var t = plantillas[Math.floor(azar() * plantillas.length)];
        var dd = new Date(base.getFullYear(), base.getMonth(), 1 + Math.floor(azar() * dias), 12);
        if (dd > hoy) continue;
        movs.push({ id: ++id, fecha: iso(dd), concepto: t[0], categoria: t[1], importe: t[2] * Math.round((t[3] + azar() * (t[4] - t[3])) * 100) / 100, cuenta: t[5] });
      }
    }
    movs.sort(function (a, b) { return b.fecha.localeCompare(a.fecha) || b.id - a.id; });
    var saldo = total;
    movs.forEach(function (mv) { mv.saldo = saldo; saldo -= mv.importe; });
    var inicio = saldo;
    // Serie diaria del saldo, de hace un año a hoy
    var serie = [], acumulado = inicio, porDia = {};
    movs.forEach(function (mv) { porDia[mv.fecha] = (porDia[mv.fecha] || 0) + mv.importe; });
    var d0 = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1, 12);
    for (var d = new Date(d0); d <= hoy; d.setDate(d.getDate() + 1)) {
      acumulado += porDia[iso(d)] || 0;
      serie.push({ fecha: iso(d), saldo: acumulado });
    }
    var presupuesto = [
      ['Supermercado', 400], ['Restaurantes', 150], ['Transporte', 120], ['Ocio', 90], ['Compras', 80], ['Suscripciones', 30]
    ];
    return { cuentas: cuentas, total: total, movs: movs, serie: serie, presupuesto: presupuesto, hoy: hoy };
  })();

  function mesClave(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function periodoDe(e) {
    var d = new Date(ejemplo.hoy.getFullYear(), ejemplo.hoy.getMonth() + (e.mes || 0), 1);
    return { clave: mesClave(d), nombre: MESES_LARGOS[d.getMonth()] + ' ' + d.getFullYear(), mesNombre: MESES_LARGOS[d.getMonth()] };
  }
  function movsDelPeriodo(e) { var c = periodoDe(e).clave; return ejemplo.movs.filter(function (m) { return m.fecha.slice(0, 7) === c; }); }
  function filtrados(e) {
    var q = (e.buscar || '').trim().toLowerCase();
    var lista = e.pestana === 'movimientos' && !q ? movsDelPeriodo(e) : ejemplo.movs;
    if (!q) return lista;
    return lista.filter(function (m) { return (m.concepto + ' ' + m.categoria + ' ' + m.cuenta).toLowerCase().indexOf(q) >= 0; });
  }

  // ---------- Gráfica ----------
  // Curva suave (cúbica monótona) para que la línea no invente picos entre dos puntos.
  function trazado(pts) {
    if (pts.length < 2) return '';
    var n = pts.length, dx = [], dy = [], m = [], t = [];
    for (var i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    var d = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += 'C' + (pts[i][0] + h).toFixed(2) + ' ' + (pts[i][1] + t[i] * h).toFixed(2) + ' ' + (pts[i + 1][0] - h).toFixed(2) + ' ' + (pts[i + 1][1] - t[i + 1] * h).toFixed(2) + ' ' + pts[i + 1][0].toFixed(2) + ' ' + pts[i + 1][1].toFixed(2);
    }
    return d;
  }
  function grafica(e) {
    var meses = { '1m': 1, '3m': 3, '6m': 6, '1a': 12 }[e.rango || '6m'];
    var desde = new Date(ejemplo.hoy.getFullYear(), ejemplo.hoy.getMonth() - meses + 1, meses === 1 ? ejemplo.hoy.getDate() - 30 : 1);
    var serie = ejemplo.serie.filter(function (p) { return p.fecha >= iso(desde); });
    // Una muestra por semana: con el saldo diario, cada nómina dibujaba un escalón
    var paso = meses === 1 ? 2 : 7;
    var muestra = serie.filter(function (p, i) { return (serie.length - 1 - i) % paso === 0; });
    var vals = muestra.map(function (p) { return p.saldo; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), hueco = (max - min) * 0.18 || 100;
    min -= hueco; max += hueco * 0.6;
    var W = 1000, H = 300;
    var pts = muestra.map(function (p, i) { return [i / (muestra.length - 1) * W, H - (p.saldo - min) / (max - min) * H]; });
    var linea = trazado(pts);
    var guias = [0.25, 0.5, 0.75].map(function (f) { return '<line class="guia" x1="0" x2="' + W + '" y1="' + (H * f) + '" y2="' + (H * f) + '"/>'; }).join('');
    var etiquetas = [], visto = {};
    muestra.forEach(function (p) { var k = p.fecha.slice(0, 7); if (!visto[k]) { visto[k] = 1; etiquetas.push(MESES[+p.fecha.slice(5, 7) - 1]); } });
    if (meses === 1) etiquetas = [fechaCorta(muestra[0].fecha), fechaCorta(muestra[muestra.length - 1].fecha)];
    return '<svg class="grafica" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Evolución del saldo consolidado">' + guias +
      '<path class="area" d="' + linea + 'L' + W + ' ' + H + 'L0 ' + H + 'Z"/><path class="linea" d="' + linea + '"/></svg>' +
      '<div class="ejes">' + etiquetas.map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>';
  }

  // ---------- Pestañas ----------
  function cabecera(titulo, sub) {
    return '<header class="cabecera"><div><h1>' + esc(titulo) + '</h1><p class="sub">' + esc(sub) + '</p></div>' +
      '<div class="botones"><button type="button" class="boton lleno" data-fin="nuevo">+ Movimiento</button>' +
      '<button type="button" class="boton" data-fin="importar">Importar</button>' +
      '<button type="button" class="boton" data-fin="presupuesto">Presupuesto</button></div></header>';
  }
  function presupuestoHtml(e, limite) {
    var movs = movsDelPeriodo(e);
    var filas = ejemplo.presupuesto.slice(0, limite || 99).map(function (p) {
      var gastado = 0 - movs.filter(function (m) { return m.categoria === p[0] && m.importe < 0; }).reduce(function (s, m) { return s + m.importe; }, 0);
      var pct = Math.min(100, gastado / p[1] * 100), pasado = gastado > p[1];
      return '<li class="' + (pasado ? 'pasado' : '') + '"><div class="linea-presu"><span>' + esc(p[0]) + '</span><span class="importe">' + fmt.format(Math.abs(gastado)) + ' / ' + fmt.format(p[1]) + ' €</span></div>' +
        '<div class="barra"><i style="width:' + pct.toFixed(1) + '%"></i></div></li>';
    }).join('');
    return '<ul class="filas presu">' + filas + '</ul>';
  }
  function tablaMovs(lista, conCuenta, sinSaldo) {
    if (!lista.length) return '<p class="sub">No hay movimientos que coincidan. Prueba con otra búsqueda o con otro mes.</p>';
    return '<table class="tabla' + (sinSaldo ? ' compacta' : '') + '"><thead><tr><th class="fecha-t">Fecha</th><th>Concepto</th><th class="cat">Categoría</th>' + (conCuenta ? '<th class="cat">Cuenta</th>' : '') + '<th class="num imp-t">Importe</th>' + (sinSaldo ? '' : '<th class="num saldo-t">Saldo</th>') + '</tr></thead><tbody>' +
      lista.map(function (m) {
        return '<tr><td class="fecha-t">' + fechaCorta(m.fecha) + '</td><td>' + esc(m.concepto) + '</td><td class="cat">' + esc(m.categoria) + '</td>' +
          (conCuenta ? '<td class="cat">' + esc(m.cuenta.charAt(0).toUpperCase() + m.cuenta.slice(1)) + '</td>' : '') +
          '<td class="num importe imp-t">' + dinero(m.importe, true) + '</td>' + (sinSaldo ? '' : '<td class="num importe saldo-t">' + dinero(m.saldo) + '</td>') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  function resumen(e) {
    var per = periodoDe(e), movs = movsDelPeriodo(e);
    var cambio = movs.reduce(function (s, m) { return s + m.importe; }, 0);
    var entra = movs.filter(function (m) { return m.importe > 0; }).reduce(function (s, m) { return s + m.importe; }, 0);
    var sale = movs.filter(function (m) { return m.importe < 0; }).reduce(function (s, m) { return s + m.importe; }, 0);
    var rangos = [['1m', '1 M.'], ['3m', '3 M.'], ['6m', '6 M.'], ['1a', '1 A.']].map(function (r) {
      return '<button type="button" data-rango="' + r[0] + '" aria-pressed="' + ((e.rango || '6m') === r[0]) + '">' + r[1] + '</button>';
    }).join('');
    return cabecera('Finanzas', 'Resumen de ' + per.nombre) +
      '<section class="franja crece">' +
        '<div class="bloque" style="grid-column: span 4">' +
          '<p class="rot">Posición total</p>' +
          '<p class="cifra">' + dinero(ejemplo.total) + '</p>' +
          '<p class="nota-cifra">' + dinero(cambio, true) + ' en ' + per.mesNombre + '</p>' +
          '<ul class="filas" style="margin-top:auto">' +
            '<li><span>Entra</span><span class="importe">' + dinero(entra, true) + '</span></li>' +
            '<li><span>Sale</span><span class="importe">' + dinero(sale) + '</span></li>' +
          '</ul>' +
        '</div>' +
        '<div class="bloque" style="grid-column: span 8">' +
          '<div class="cab-bloque"><div><p class="rot">Evolución</p><h2 class="titulo-bloque">Saldo consolidado</h2></div><div class="rangos">' + rangos + '</div></div>' +
          grafica(e) +
        '</div>' +
      '</section>' +
      '<section class="franja">' +
        '<div class="bloque" style="grid-column: span 3"><p class="rot">Cuentas</p><ul class="filas">' +
          ejemplo.cuentas.map(function (c) { return '<li><span>' + esc(c.nombre) + '</span><span class="importe">' + dinero(c.saldo) + '</span></li>'; }).join('') +
          '<li class="total"><span>Total</span><span class="importe">' + dinero(ejemplo.total) + '</span></li></ul></div>' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">Presupuesto: ' + per.mesNombre + '</p>' + presupuestoHtml(e, 5) + '</div>' +
        '<div class="bloque" style="grid-column: span 5"><p class="rot">Movimientos recientes</p>' + tablaMovs(ejemplo.movs.slice(0, 6), false, true) + '</div>' +
      '</section>';
  }

  function movimientos(e) {
    var lista = filtrados(e), paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    e.pagina = Math.min(e.pagina || 0, paginas - 1);
    var trozo = lista.slice(e.pagina * POR_PAGINA, (e.pagina + 1) * POR_PAGINA);
    var per = periodoDe(e);
    var sub = (e.buscar || '').trim() ? lista.length + ' movimientos con «' + e.buscar.trim() + '»' : lista.length + ' movimientos en ' + per.nombre;
    return cabecera('Movimientos', sub) +
      '<section class="franja crece"><div class="bloque" style="grid-column: span 12">' + tablaMovs(trozo, true) +
      '<div class="paginacion"><button type="button" class="enlace" data-pag="-1"' + (e.pagina === 0 ? ' disabled' : '') + '>Anterior</button>' +
      '<span>Página ' + (e.pagina + 1) + ' de ' + paginas + '</span>' +
      '<button type="button" class="enlace" data-pag="1"' + (e.pagina >= paginas - 1 ? ' disabled' : '') + '>Siguiente</button></div></div></section>';
  }

  function planificacion(e) {
    var per = periodoDe(e), movs = movsDelPeriodo(e);
    var ingresos = movs.filter(function (m) { return m.importe > 0; }).reduce(function (s, m) { return s + m.importe; }, 0) || 1840;
    var previsto = ejemplo.presupuesto.reduce(function (s, p) { return s + p[1]; }, 0);
    var fijos = [['Alquiler', 540, 2], ['Internet y móvil', 38, 15], ['Luz', 46.2, 10], ['Gimnasio', 34.9, 12], ['Netflix', 13.99, 8], ['Spotify', 10.99, 5]];
    var compromisos = fijos.reduce(function (s, f) { return s + f[1]; }, 0);
    var sinAsignar = ingresos - previsto - compromisos;
    return cabecera('Planificación', 'Presupuesto de ' + per.nombre) +
      '<section class="franja crece">' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">El mes en cifras</p><ul class="filas">' +
          '<li><span>Ingresos</span><span class="importe">' + dinero(ingresos, true) + '</span></li>' +
          '<li><span>Compromisos fijos</span><span class="importe">' + dinero(-compromisos) + '</span></li>' +
          '<li><span>Presupuestos</span><span class="importe">' + dinero(-previsto) + '</span></li>' +
          '<li class="total"><span>Sin asignar</span><span class="importe">' + dinero(sinAsignar) + '</span></li></ul></div>' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">Presupuestos</p>' + presupuestoHtml(e) + '</div>' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">Cargos fijos</p><ul class="filas">' +
          fijos.map(function (f) { return '<li><span>' + esc(f[0]) + ' <i style="opacity:.7">(día ' + f[2] + ')</i></span><span class="importe">' + dinero(f[1]) + '</span></li>'; }).join('') +
          '</ul></div>' +
      '</section>';
  }

  ED.apartados.finanzas = {
    nombre: 'Finanzas',
    pestanas: [{ id: 'resumen', nombre: 'Resumen' }, { id: 'movimientos', nombre: 'Movimientos' }, { id: 'planificacion', nombre: 'Planificación' }],
    contexto: function (e) {
      var per = periodoDe(e);
      return '<p class="rot">Periodo</p><p>' + esc(per.nombre.charAt(0).toUpperCase() + per.nombre.slice(1)) + '</p>' +
        '<p class="paso"><button type="button" class="enlace" data-mes="-1">anterior</button> / <button type="button" class="enlace" data-mes="1"' + ((e.mes || 0) >= 0 ? ' disabled style="opacity:.4;cursor:default"' : '') + '>siguiente</button></p>' +
        '<p class="rot" style="margin-top:12px">Cuentas</p><p>Todas</p>';
    },
    pie: function () { return 'Datos de ejemplo'; },
    pintar: function (pagina, e) {
      pagina.innerHTML = e.pestana === 'movimientos' ? movimientos(e) : e.pestana === 'planificacion' ? planificacion(e) : resumen(e);
      var aviso = pagina.querySelector('[data-aviso]'); if (aviso) aviso.remove();
    },
    clicMargen: function (ev, e) {
      var b = ev.target.closest('[data-mes]'); if (!b || b.disabled) return;
      var nuevo = (e.mes || 0) + (+b.dataset.mes); if (nuevo > 0 || nuevo < -11) return;
      e.mes = nuevo; e.pagina = 0; ED.pintarApartado();
    },
    clicPagina: function (ev, e) {
      var r = ev.target.closest('[data-rango]'), p = ev.target.closest('[data-pag]'), f = ev.target.closest('[data-fin]');
      if (r) { e.rango = r.dataset.rango; ED.pintarApartado(); return; }
      if (p && !p.disabled) { e.pagina = (e.pagina || 0) + (+p.dataset.pag); ED.pintarApartado(); return; }
      if (f) {
        if (f.dataset.fin === 'presupuesto') { var t = document.querySelector('[data-pestana="planificacion"]'); if (t) t.click(); return; }
        var sub = document.querySelector('#ed-pagina .sub');
        if (sub) sub.textContent = 'Apuntar e importar llegarán cuando Finanzas use tus datos reales.';
      }
    },
    tecla: function (ev, e) {
      if (e.pestana !== 'movimientos' || (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft')) return false;
      var paginas = Math.max(1, Math.ceil(filtrados(e).length / POR_PAGINA));
      var nueva = (e.pagina || 0) + (ev.key === 'ArrowRight' ? 1 : -1);
      if (nueva < 0 || nueva >= paginas) return true;
      e.pagina = nueva; ED.pintarApartado(); return true;
    }
  };
})(window.ED);
