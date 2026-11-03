// Finanzas. Todo sale de la lógica de Bitácora (finanzas.js, finanzas-pro.js, presupuesto.js, asistente.js y
// suscripciones.js): los saldos, la serie diaria, el saldo tras cada movimiento, lo que no es ni ingreso ni gasto
// (ahorros, ajustes, inversión) y las casillas del presupuesto. Aquí solo se compone la página.
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
  function fechaCorta(s) { var p = s.split('-'); return p[2] + ' ' + MESES[+p[1] - 1]; }
  function mayuscula(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function sinPunto(t) { return String(t || '').replace(/\.$/, ''); }

  // ---------- Datos, con la lógica de Bitácora ----------
  function nombreCuenta(k) { return (financePro.accounts[k] && financePro.accounts[k].name) || mayuscula(k); }
  function cuentas() {
    return FINANCE_PRO_ACCOUNT_KEYS.map(function (k) { return { id: k, nombre: nombreCuenta(k), saldo: financeProAccountBalance(k) }; });
  }
  var cacheMovs = null;
  function movimientos() {
    var txs = financePro.transactions;
    if (cacheMovs && cacheMovs.txs === txs && cacheMovs.n === txs.length) return cacheMovs.lista;
    var tras = financeProSaldosTrasMovimiento();
    var lista = financeProOrdenados().map(function (t) {
      var importe = Number(t.amount) || 0, categoria, concepto, signo;
      if (t.type === 'transfer') {
        categoria = 'Traspaso';
        concepto = 'De ' + nombreCuenta(t.account) + ' a ' + nombreCuenta(t.transferTo) + (t.note ? ': ' + t.note : '');
        signo = 0;
      } else {
        var neutro = financeProNeutro(t), cat = neutro ? null : financeProCategoryById(t.category);
        categoria = neutro ? mayuscula(sinPunto(financeProEtiquetaNeutro(t))) : (cat ? cat.name : 'Sin categoría');
        concepto = t.note || categoria;
        signo = t.type === 'income' ? 1 : -1;
      }
      var saldo = tras[t.id] && tras[t.id][t.account];
      return { t: t, id: t.id, fecha: t.date || '', concepto: concepto, categoria: categoria, cuenta: nombreCuenta(t.account),
        importe: signo ? signo * importe : importe, traspaso: !signo, pendiente: !!t.pendiente, saldo: saldo };
    });
    cacheMovs = { txs: txs, n: txs.length, lista: lista };
    return lista;
  }
  function mesClave(off) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + (off || 0));
    return { clave: financeMonthKey(d), nombre: MESES_LARGOS[d.getMonth()] + ' ' + d.getFullYear(), mesNombre: MESES_LARGOS[d.getMonth()] };
  }
  function mesesConDatos() {
    var txs = financePro.transactions; if (!txs.length) return 0;
    var primero = txs.reduce(function (m, t) { return t.date && t.date < m ? t.date : m; }, '9999');
    var hoy = new Date(), p = primero.split('-');
    return (hoy.getFullYear() - +p[0]) * 12 + hoy.getMonth() - (+p[1] - 1);
  }
  function delMes(e) { var c = mesClave(e.mes).clave; return movimientos().filter(function (m) { return m.fecha.slice(0, 7) === c; }); }
  function cuentasDelMes(e) {
    var c = mesClave(e.mes).clave, entra = 0, sale = 0;
    financePro.transactions.forEach(function (t) {
      if (!t.date || t.date.slice(0, 7) !== c || t.type === 'transfer' || financeProNeutro(t) || !financeProCuentaEnSaldo(t)) return;
      if (t.type === 'income') entra += Number(t.amount) || 0; else sale += Number(t.amount) || 0;
    });
    return { entra: entra, sale: sale, neto: entra - sale };
  }
  function filtrados(e) {
    var q = (e.buscar || '').trim().toLowerCase();
    if (!q) return e.pestana === 'movimientos' ? delMes(e) : movimientos();
    return movimientos().filter(function (m) { return (m.concepto + ' ' + m.categoria + ' ' + m.cuenta + ' ' + fmt.format(Math.abs(m.importe))).toLowerCase().indexOf(q) >= 0; });
  }
  function presupuestos(e) {
    var mes = mesClave(e.mes).clave;
    var lim = typeof asistLimitesDelMes === 'function' ? asistLimitesDelMes(mes) : {};
    return Object.keys(lim).filter(function (id) { return financeProCategoryById(id); }).map(function (id) {
      var r = financeProPresupuestoConDevoluciones(id, mes, lim[id].limite);
      return { nombre: lim[id].nombre || financeProCategoryById(id).name, gastado: r.gastado, limite: r.limite };
    }).sort(function (a, b) { return b.limite - a.limite; });
  }

  // ---------- Gráfica ----------
  // Curva suave (cúbica monótona) para que la línea no invente picos entre dos puntos.
  function trazado(pts) {
    if (pts.length < 2) return '';
    var n = pts.length, dx = [], m = [], t = [];
    for (var i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
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
    var serie = financeSerieDiaria(meses, false);
    if (serie.length < 2) return '<p class="sub">La gráfica empieza con tu primer movimiento.</p>';
    // Una muestra por semana (o cada dos días en un mes): con el saldo diario, cada nómina dibujaba un escalón
    var paso = meses === 1 ? 2 : 7;
    var muestra = serie.filter(function (p, i) { return (serie.length - 1 - i) % paso === 0; });
    if (muestra.length < 2) muestra = [serie[0], serie[serie.length - 1]];
    var vals = muestra.map(function (p) { return p.v; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), hueco = (max - min) * 0.18 || Math.abs(max) * 0.05 || 100;
    min -= hueco; max += hueco * 0.6;
    var W = 1000, H = 300;
    var pts = muestra.map(function (p, i) { return [i / (muestra.length - 1) * W, H - (p.v - min) / (max - min) * H]; });
    var linea = trazado(pts);
    var guias = [0.25, 0.5, 0.75].map(function (f) { return '<line class="guia" x1="0" x2="' + W + '" y1="' + (H * f) + '" y2="' + (H * f) + '"/>'; }).join('');
    var etiquetas = [], visto = {};
    if (meses === 1) etiquetas = [fechaCorta(muestra[0].f), fechaCorta(muestra[muestra.length - 1].f)];
    else muestra.forEach(function (p) { var k = p.f.slice(0, 7); if (!visto[k]) { visto[k] = 1; etiquetas.push(MESES[+p.f.slice(5, 7) - 1]); } });
    var desde = serie[0].v, hasta = serie[serie.length - 1].v;
    return '<svg class="grafica" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Evolución del saldo: de ' + dinero(desde) + ' a ' + dinero(hasta) + '">' + guias +
      '<path class="area" d="' + linea + 'L' + W + ' ' + H + 'L0 ' + H + 'Z"/><path class="linea" d="' + linea + '"/></svg>' +
      '<div class="ejes">' + etiquetas.map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>';
  }

  // ---------- Piezas ----------
  function cabecera(titulo, sub) {
    return '<header class="cabecera"><div><h1>' + esc(titulo) + '</h1><p class="sub">' + esc(sub) + '</p></div>' +
      '<div class="botones"><button type="button" class="boton lleno" data-fin="nuevo">+ Movimiento</button>' +
      '<button type="button" class="boton" data-fin="importar">Importar</button>' +
      '<button type="button" class="boton" data-fin="presupuesto">Presupuesto</button></div></header>';
  }
  function presupuestoHtml(lista, limite) {
    if (!lista.length) return '<p class="sub">Sin presupuesto para este mes.</p>';
    return '<ul class="filas presu">' + lista.slice(0, limite || 99).map(function (p) {
      var pct = p.limite > 0 ? Math.min(100, p.gastado / p.limite * 100) : (p.gastado > 0 ? 100 : 0), pasado = p.gastado > p.limite;
      return '<li class="' + (pasado ? 'pasado' : '') + '"><div class="linea-presu"><span>' + esc(p.nombre) + '</span><span class="importe">' + fmt.format(p.gastado) + ' / ' + fmt.format(p.limite) + ' €</span></div>' +
        '<div class="barra"><i style="width:' + pct.toFixed(1) + '%"></i></div></li>';
    }).join('') + '</ul>';
  }
  function importeHtml(m) { return m.traspaso ? dinero(m.importe) : dinero(m.importe, true); }
  function tablaMovs(lista, conCuenta, compacta, vacio) {
    if (!lista.length) return '<p class="sub">' + esc(vacio || 'No hay movimientos.') + '</p>';
    return '<table class="tabla' + (compacta ? ' compacta' : '') + '"><thead><tr><th class="fecha-t">Fecha</th><th>Concepto</th><th class="cat">Categoría</th>' +
      (conCuenta ? '<th class="cat">Cuenta</th>' : '') + '<th class="num imp-t">Importe</th>' + (compacta ? '' : '<th class="num saldo-t">Saldo</th>') + '</tr></thead><tbody>' +
      lista.map(function (m) {
        return '<tr><td class="fecha-t">' + fechaCorta(m.fecha) + '</td><td title="' + esc(m.concepto) + '">' + esc(m.concepto) + (m.pendiente ? ' <i>(pendiente)</i>' : '') + '</td><td class="cat">' + esc(m.categoria) + '</td>' +
          (conCuenta ? '<td class="cat">' + esc(m.cuenta) + '</td>' : '') +
          '<td class="num importe imp-t">' + importeHtml(m) + '</td>' + (compacta ? '' : '<td class="num importe saldo-t">' + (m.saldo === undefined ? '' : dinero(m.saldo)) + '</td>') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  // ---------- Pestañas ----------
  function resumen(e) {
    var per = mesClave(e.mes), c = cuentasDelMes(e), lista = cuentas();
    var total = financeProTotalBalance();
    var rangos = [['1m', '1 M.'], ['3m', '3 M.'], ['6m', '6 M.'], ['1a', '1 A.']].map(function (r) {
      return '<button type="button" data-rango="' + r[0] + '" aria-pressed="' + ((e.rango || '6m') === r[0]) + '">' + r[1] + '</button>';
    }).join('');
    return cabecera('Finanzas', 'Resumen de ' + per.nombre) +
      '<section class="franja crece">' +
        '<div class="bloque" style="grid-column: span 4">' +
          '<p class="rot">Posición total</p>' +
          '<p class="cifra">' + dinero(total) + '</p>' +
          '<p class="nota-cifra">' + dinero(c.neto, true) + ' en ' + per.mesNombre + '</p>' +
          '<ul class="filas" style="margin-top:auto">' +
            '<li><span>Entra</span><span class="importe">' + dinero(c.entra, true) + '</span></li>' +
            '<li><span>Sale</span><span class="importe">' + dinero(-c.sale) + '</span></li>' +
          '</ul>' +
        '</div>' +
        '<div class="bloque" style="grid-column: span 8">' +
          '<div class="cab-bloque"><div><p class="rot">Evolución</p><h2 class="titulo-bloque">Saldo consolidado</h2></div><div class="rangos">' + rangos + '</div></div>' +
          grafica(e) +
        '</div>' +
      '</section>' +
      '<section class="franja">' +
        '<div class="bloque" style="grid-column: span 3"><p class="rot">Cuentas</p><ul class="filas">' +
          lista.map(function (k) { return '<li><span>' + esc(k.nombre) + '</span><span class="importe">' + dinero(k.saldo) + '</span></li>'; }).join('') +
          '<li class="total"><span>Total</span><span class="importe">' + dinero(total) + '</span></li></ul></div>' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">Presupuesto: ' + per.mesNombre + '</p>' + presupuestoHtml(presupuestos(e), 5) + '</div>' +
        '<div class="bloque" style="grid-column: span 5"><p class="rot">Movimientos recientes</p>' +
          tablaMovs(movimientos().slice(0, 6), false, true, 'Todavía no hay movimientos. Importa un extracto o apunta el primero.') + '</div>' +
      '</section>';
  }

  function pestanaMovimientos(e) {
    var lista = filtrados(e), paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    e.pagina = Math.min(e.pagina || 0, paginas - 1);
    var trozo = lista.slice(e.pagina * POR_PAGINA, (e.pagina + 1) * POR_PAGINA);
    var per = mesClave(e.mes), q = (e.buscar || '').trim();
    var n = lista.length + (lista.length === 1 ? ' movimiento' : ' movimientos');
    var sub = q ? n + ' con «' + q + '»' : n + ' en ' + per.nombre;
    var vacio = q ? 'Nada coincide con «' + q + '».' : 'No hay movimientos en ' + per.mesNombre + '. Importa un extracto o apunta uno.';
    return cabecera('Movimientos', sub) +
      '<section class="franja crece"><div class="bloque" style="grid-column: span 12">' + tablaMovs(trozo, true, false, vacio) +
      (lista.length > POR_PAGINA ? '<div class="paginacion"><button type="button" class="enlace" data-pag="-1"' + (e.pagina === 0 ? ' disabled' : '') + '>Anterior</button>' +
      '<span>Página ' + (e.pagina + 1) + ' de ' + paginas + '</span>' +
      '<button type="button" class="enlace" data-pag="1"' + (e.pagina >= paginas - 1 ? ' disabled' : '') + '>Siguiente</button></div>' : '') +
      '</div></section>';
  }

  function cargosFijos(mes) {
    var fecha = mes + '-15';
    return entries.filter(function (x) {
      if ((x.type !== 'subscription' && x.type !== 'fixed_expense') || x.active === false || !(Number(x.amount) > 0)) return false;
      return typeof suscripcionVigente !== 'function' || x.type !== 'subscription' || suscripcionVigente(x, fecha);
    }).map(function (x) { return { nombre: x.title || 'Sin nombre', importe: Number(x.amount), dia: Number(x.renewalDay) || 1 }; })
      .sort(function (a, b) { return a.dia - b.dia; });
  }

  function planificacion(e) {
    var per = mesClave(e.mes), modelo = null;
    try { var p = presupuestoPlanDe(per.clave); modelo = financeBudgetUnifiedModel(per.clave, p.plan, p.recorded); } catch (err) {}
    var fijos = cargosFijos(per.clave);
    var cifras = modelo && (modelo.income || modelo.totalAssigned)
      ? '<ul class="filas">' +
          '<li><span>Ingresos previstos</span><span class="importe">' + dinero(modelo.income, true) + '</span></li>' +
          '<li><span>Compromisos</span><span class="importe">' + dinero(-modelo.commitmentsAssigned) + '</span></li>' +
          '<li><span>Presupuestos</span><span class="importe">' + dinero(-modelo.manualAssigned) + '</span></li>' +
          '<li class="total"><span>Sin asignar</span><span class="importe">' + dinero(modelo.remaining) + '</span></li></ul>'
      : '<p class="sub">Sin planificación para ' + per.mesNombre + '. Se prepara en Finanzas de Bitácora, en planificación.</p>';
    var cats = modelo && modelo.categories && modelo.categories.length
      ? presupuestoHtml(modelo.categories.map(function (c) { return { nombre: c.name, gastado: c.spent, limite: c.available }; }))
      : presupuestoHtml(presupuestos(e));
    return cabecera('Planificación', 'Presupuesto de ' + per.nombre) +
      '<section class="franja crece">' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">El mes en cifras</p>' + cifras + '</div>' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">Presupuestos</p>' + cats + '</div>' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">Cargos fijos</p>' + (fijos.length ? '<ul class="filas">' +
          fijos.map(function (f) { return '<li><span>' + esc(f.nombre) + ' <i style="opacity:.7">(día ' + f.dia + ')</i></span><span class="importe">' + dinero(f.importe) + '</span></li>'; }).join('') +
          '<li class="total"><span>Total</span><span class="importe">' + dinero(fijos.reduce(function (s, f) { return s + f.importe; }, 0)) + '</span></li></ul>'
          : '<p class="sub">Sin suscripciones ni gastos fijos activos.</p>') + '</div>' +
      '</section>';
  }

  ED.apartados.finanzas = {
    nombre: 'Finanzas',
    pestanas: [{ id: 'resumen', nombre: 'Resumen' }, { id: 'movimientos', nombre: 'Movimientos' }, { id: 'planificacion', nombre: 'Planificación' }],
    contexto: function (e) {
      var per = mesClave(e.mes), atras = mesesConDatos();
      return '<p class="rot">Periodo</p><p>' + esc(mayuscula(per.nombre)) + '</p>' +
        '<p class="paso"><button type="button" class="enlace" data-mes="-1"' + (-(e.mes || 0) >= atras ? ' disabled' : '') + '>anterior</button> / <button type="button" class="enlace" data-mes="1"' + ((e.mes || 0) >= 0 ? ' disabled' : '') + '>siguiente</button></p>' +
        '<p class="rot" style="margin-top:12px">Cuentas</p><p>' + esc(cuentas().map(function (c) { return c.nombre; }).join(', ')) + '</p>';
    },
    pie: function () { return ''; },
    pintar: function (pagina, e) {
      pagina.innerHTML = e.pestana === 'movimientos' ? pestanaMovimientos(e) : e.pestana === 'planificacion' ? planificacion(e) : resumen(e);
    },
    clicMargen: function (ev, e) {
      var b = ev.target.closest('[data-mes]'); if (!b || b.disabled) return;
      var nuevo = (e.mes || 0) + (+b.dataset.mes);
      if (nuevo > 0 || -nuevo > mesesConDatos()) return;
      e.mes = nuevo; e.pagina = 0; ED.pintarApartado();
    },
    clicPagina: function (ev, e) {
      var r = ev.target.closest('[data-rango]'), p = ev.target.closest('[data-pag]'), f = ev.target.closest('[data-fin]');
      if (r) { e.rango = r.dataset.rango; ED.pintarApartado(); return; }
      if (p && !p.disabled) { e.pagina = (e.pagina || 0) + (+p.dataset.pag); ED.pintarApartado(); return; }
      if (f) {
        if (f.dataset.fin === 'presupuesto') { var t = document.querySelector('[data-pestana="planificacion"]'); if (t) t.click(); return; }
        var sub = document.querySelector('#ed-pagina .sub');
        if (sub) sub.innerHTML = 'Apuntar e importar llegan en el siguiente paso. De momento, en <a href="https://appbitacora.es/#finances">Bitácora</a>.';
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
