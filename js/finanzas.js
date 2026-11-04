// Finanzas. Todo sale de la lógica de Bitácora (finanzas.js, finanzas-pro.js, presupuesto.js, asistente.js y
// suscripciones.js): los saldos, la serie diaria, el saldo tras cada movimiento, lo que no es ni ingreso ni gasto
// (ahorros, ajustes, inversión), el ritmo del mes, el patrimonio y las casillas del presupuesto. Aquí solo se compone
// la página, con lo mismo que enseña Finanzas en la app normal.
window.ED = window.ED || {};
window.ED.apartados = window.ED.apartados || {};
(function (ED) {
  var POR_PAGINA = 18;
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var RITMO = { contenido: 'Vas más contenido que de costumbre.', normal: 'Vas a tu ritmo de siempre.', alto: 'Este mes vas por encima de lo habitual.', muy: 'Este mes estás gastando bastante más de lo normal.' };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var fmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  var fmt0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
  function dinero(n, conSigno) {
    if (Math.abs(n) < 0.005) n = 0;
    var s = fmt.format(Math.abs(n)) + ' €';
    if (n < 0) return '−' + s;
    return (conSigno && n > 0 ? '+ ' : '') + s;
  }
  function fechaCorta(s) { var p = String(s || '').split('-'); return p.length < 3 ? '' : p[2] + ' ' + MESES[+p[1] - 1]; }
  function mayuscula(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function sinPunto(t) { return String(t || '').replace(/\.$/, ''); }
  function intento(fn, porDefecto) { try { return fn(); } catch (e) { return porDefecto; } }
  function fila(izq, der, clase) { return '<li' + (clase ? ' class="' + clase + '"' : '') + '><span>' + izq + '</span><span class="importe">' + der + '</span></li>'; }

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
      var importe = Number(t.amount) || 0, categoria, concepto, signo, tipo;
      if (t.type === 'transfer') {
        categoria = 'Traspaso'; tipo = 'traspaso';
        concepto = 'De ' + nombreCuenta(t.account) + ' a ' + nombreCuenta(t.transferTo) + (t.note ? ': ' + t.note : '');
        signo = 0;
      } else {
        var neutro = financeProNeutro(t), cat = neutro ? null : financeProCategoryById(t.category);
        categoria = neutro ? mayuscula(sinPunto(financeProEtiquetaNeutro(t))) : (cat ? cat.name : 'Sin categoría');
        concepto = t.note || categoria;
        signo = t.type === 'income' ? 1 : -1;
        tipo = neutro ? 'neutro' : t.type === 'income' ? 'ingreso' : 'gasto';
      }
      var saldo = tras[t.id] && tras[t.id][t.account];
      return { t: t, id: t.id, fecha: t.date || '', concepto: concepto, categoria: categoria, cuenta: t.account, cuentaNombre: nombreCuenta(t.account),
        importe: signo ? signo * importe : importe, traspaso: !signo, tipo: tipo, pendiente: !!t.pendiente, revisar: !!t.needsReview, viaje: !!t.viaje, saldo: saldo };
    });
    cacheMovs = { txs: txs, n: txs.length, lista: lista };
    return lista;
  }
  function mesClave(off) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + (off || 0));
    return { clave: financeMonthKey(d), nombre: MESES_LARGOS[d.getMonth()] + ' ' + d.getFullYear(), mesNombre: MESES_LARGOS[d.getMonth()], corto: MESES[d.getMonth()] };
  }
  function mesesConDatos() {
    var txs = financePro.transactions; if (!txs.length) return 0;
    var primero = txs.reduce(function (m, t) { return t.date && t.date < m ? t.date : m; }, '9999');
    var hoy = new Date(), p = primero.split('-');
    return (hoy.getFullYear() - +p[0]) * 12 + hoy.getMonth() - (+p[1] - 1);
  }
  // Entra y sale de un mes, con la misma regla que la app: sin traspasos, ahorros, ajustes ni inversión.
  function cuentasDeMes(clave) {
    var entra = 0, sale = 0;
    financePro.transactions.forEach(function (t) {
      if (!t.date || t.date.slice(0, 7) !== clave || t.type === 'transfer' || financeProNeutro(t) || !financeProCuentaEnSaldo(t)) return;
      if (t.type === 'income') entra += Number(t.amount) || 0; else sale += Number(t.amount) || 0;
    });
    return { entra: entra, sale: sale, neto: entra - sale };
  }
  function gastoPorCategoria(clave) {
    var por = {};
    financePro.transactions.forEach(function (t) {
      if (!t.date || t.date.slice(0, 7) !== clave || t.type !== 'expense' || financeProNeutro(t)) return;
      var k = t.category || '_sin';
      por[k] = (por[k] || 0) + (Number(t.amount) || 0);
    });
    return Object.keys(por).map(function (k) {
      var c = financeProCategoryById(k);
      return { nombre: c ? c.name : 'Sin categoría', importe: por[k] };
    }).sort(function (a, b) { return b.importe - a.importe; });
  }
  function presupuestos(clave) {
    var lim = typeof asistLimitesDelMes === 'function' ? asistLimitesDelMes(clave) : {};
    return Object.keys(lim).filter(function (id) { return financeProCategoryById(id); }).map(function (id) {
      var r = financeProPresupuestoConDevoluciones(id, clave, lim[id].limite);
      return { nombre: lim[id].nombre || financeProCategoryById(id).name, gastado: r.gastado, limite: r.limite };
    }).sort(function (a, b) { return b.limite - a.limite; });
  }
  function proximosCargos(dias) {
    var ahora = new Date(), hoy = ahora.getDate();
    return entries.filter(function (e) {
      if ((e.type !== 'subscription' && e.type !== 'fixed_expense') || e.active === false || !(Number(e.amount) > 0)) return false;
      return typeof suscripcionVigente !== 'function' || e.type !== 'subscription' || suscripcionVigente(e, todayISO());
    }).map(function (e) {
      var dia = Number(e.renewalDay) || 1;
      var f = new Date(ahora.getFullYear(), ahora.getMonth() + (dia < hoy ? 1 : 0), 1);
      f.setDate(Math.min(dia, new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate()));
      return { nombre: e.title || 'Sin nombre', importe: Number(e.amount), fecha: f, faltan: Math.round((f - new Date(ahora.getFullYear(), ahora.getMonth(), hoy)) / 864e5) };
    }).filter(function (x) { return x.faltan <= dias; }).sort(function (a, b) { return a.faltan - b.faltan; });
  }
  function cargosFijos(clave) {
    var fecha = clave + '-15';
    return entries.filter(function (x) {
      if ((x.type !== 'subscription' && x.type !== 'fixed_expense') || x.active === false || !(Number(x.amount) > 0)) return false;
      return typeof suscripcionVigente !== 'function' || x.type !== 'subscription' || suscripcionVigente(x, fecha);
    }).map(function (x) { return { nombre: x.title || 'Sin nombre', importe: Number(x.amount), dia: Number(x.renewalDay) || 1 }; })
      .sort(function (a, b) { return a.dia - b.dia; });
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
    var serie = intento(function () { return financeSerieDiaria(meses, false); }, []);
    if (serie.length < 2) return '<p class="sub">La gráfica empieza con tu primer movimiento.</p>';
    // Una muestra por semana (o cada dos días en un mes): con el saldo diario, cada nómina dibujaba un escalón
    var paso = meses === 1 ? 2 : 7;
    var muestra = serie.filter(function (p, i) { return (serie.length - 1 - i) % paso === 0; });
    if (muestra.length < 2) muestra = [serie[0], serie[serie.length - 1]];
    var vals = muestra.map(function (p) { return p.v; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), hueco = (max - min) * 0.15 || Math.abs(max) * 0.05 || 100;
    min -= hueco; max += hueco * 0.5;
    var W = 1000, H = 300;
    var pts = muestra.map(function (p, i) { return [i / (muestra.length - 1) * W, H - (p.v - min) / (max - min) * H]; });
    var linea = trazado(pts);
    var guias = [0.25, 0.5, 0.75].map(function (f) { return '<line class="guia" x1="0" x2="' + W + '" y1="' + (H * f) + '" y2="' + (H * f) + '"/>'; }).join('');
    var etiquetas = [], visto = {};
    if (meses === 1) etiquetas = [fechaCorta(muestra[0].f), fechaCorta(muestra[muestra.length - 1].f)];
    else muestra.forEach(function (p) { var k = p.f.slice(0, 7); if (!visto[k]) { visto[k] = 1; etiquetas.push(MESES[+p.f.slice(5, 7) - 1]); } });
    var desde = serie[0].v, hasta = serie[serie.length - 1].v;
    return '<div class="grafica-caja"><span class="eje-y arriba">' + fmt0.format(max) + '</span><span class="eje-y abajo">' + fmt0.format(min) + '</span>' +
      '<svg class="grafica" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Evolución del saldo: de ' + dinero(desde) + ' a ' + dinero(hasta) + '">' + guias +
      '<path class="area" d="' + linea + 'L' + W + ' ' + H + 'L0 ' + H + 'Z"/><path class="linea" d="' + linea + '"/></svg></div>' +
      '<div class="ejes">' + etiquetas.map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>' +
      '<p class="nota-cifra pie-grafica">' + dinero(hasta - desde, true) + ' en ' + ({ 1: 'el último mes', 3: 'tres meses', 6: 'seis meses', 12: 'un año' })[meses] + '</p>';
  }
  function barras(lista, limite) {
    if (!lista.length) return '<p class="sub">Sin gastos este mes.</p>';
    var max = lista[0].importe || 1;
    return '<ul class="filas barras">' + lista.slice(0, limite).map(function (c) {
      return '<li><div class="linea-presu"><span>' + esc(c.nombre) + '</span><span class="importe">' + dinero(c.importe) + '</span></div><div class="barra"><i style="width:' + (c.importe / max * 100).toFixed(1) + '%"></i></div></li>';
    }).join('') + '</ul>';
  }
  function presupuestoHtml(lista, limite) {
    if (!lista.length) return '<p class="sub">Sin presupuesto para este mes. Se reparte en Bitácora, en planificación.</p>';
    return '<ul class="filas presu">' + lista.slice(0, limite || 99).map(function (p) {
      var pct = p.limite > 0 ? Math.min(100, p.gastado / p.limite * 100) : (p.gastado > 0 ? 100 : 0), pasado = p.gastado > p.limite;
      return '<li class="' + (pasado ? 'pasado' : '') + '"><div class="linea-presu"><span>' + esc(p.nombre) + '</span><span class="importe">' + fmt.format(p.gastado) + ' / ' + fmt.format(p.limite) + ' €</span></div>' +
        '<div class="barra"><i style="width:' + pct.toFixed(1) + '%"></i></div></li>';
    }).join('') + '</ul>';
  }
  function marcas(m) {
    var l = [];
    if (m.pendiente) l.push('pendiente');
    if (m.revisar) l.push('por revisar');
    if (m.viaje) l.push('viaje');
    return l.length ? ' <i class="marca">(' + l.join(', ') + ')</i>' : '';
  }
  function tablaMovs(lista, opciones) {
    opciones = opciones || {};
    if (!lista.length) return '<p class="sub">' + esc(opciones.vacio || 'No hay movimientos.') + '</p>';
    return '<table class="tabla' + (opciones.compacta ? ' compacta' : '') + '"><thead><tr><th class="fecha-t">Fecha</th><th>Concepto</th><th class="cat">Categoría</th>' +
      '<th class="cta-t">Cuenta</th><th class="num imp-t">Importe</th><th class="num saldo-t">Saldo</th></tr></thead><tbody>' +
      lista.map(function (m) {
        return '<tr><td class="fecha-t">' + fechaCorta(m.fecha) + '</td><td title="' + esc(m.concepto) + '">' + esc(m.concepto) + marcas(m) + '</td><td class="cat">' + esc(m.categoria) + '</td>' +
          '<td class="cta-t">' + esc(m.cuentaNombre) + '</td><td class="num importe imp-t">' + (m.traspaso ? dinero(m.importe) : dinero(m.importe, true)) + '</td>' +
          '<td class="num importe saldo-t">' + (m.saldo === undefined ? '' : dinero(m.saldo)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function cabecera(titulo, sub) {
    return '<header class="cabecera"><div><h1>' + esc(titulo) + '</h1><p class="sub">' + sub + '</p></div>' +
      '<div class="botones"><button type="button" class="boton lleno" data-fin="nuevo">+ Movimiento</button>' +
      '<button type="button" class="boton" data-fin="importar">Importar</button>' +
      '<button type="button" class="boton" data-fin="presupuesto">Presupuesto</button></div></header>';
  }

  // ---------- Resumen ----------
  function bloqueRitmo() {
    var r = intento(function () { return financeRitmoDatos(); }, null);
    if (!r) return '<p class="sub">Sin datos de ritmo.</p>';
    if (!r.suficiente) return '<p class="texto-bloque">Todavía no hay meses suficientes para saber qué es normal en ti.</p><ul class="filas">' + fila('Llevas gastado', dinero(r.llevas)) + '</ul>';
    return '<p class="texto-bloque">' + esc(RITMO[r.nivel] || RITMO.normal) + '</p><ul class="filas">' +
      fila('Llevas gastado', dinero(r.llevas)) +
      fila('Lo normal a día ' + r.dia, dinero(r.hoyFranja.medio)) +
      fila('Previsión del mes', dinero(r.proyeccion)) +
      fila('Un mes normal', dinero(r.totalNormal)) + '</ul>';
  }
  function bloqueAvisos(clave) {
    var l = [];
    var revisar = intento(function () { return financeProPendingReviewCount(); }, 0);
    if (revisar) l.push('<li><span>' + revisar + (revisar === 1 ? ' movimiento' : ' movimientos') + ' por revisar</span><button type="button" class="enlace" data-fin="revisar">ver</button></li>');
    intento(function () { return asistPresupuestosAlerta(); }, []).slice(0, 3).forEach(function (a) {
      l.push('<li><span>' + esc(a.nombre || (a.cat && a.cat.name) || 'Presupuesto') + ' al ' + Math.round(a.pct * 100) + ' %</span><span class="importe">' + fmt0.format(a.gastado) + ' / ' + fmt0.format(a.limite) + ' €</span></li>');
    });
    var detectadas = intento(function () { return asistSuscripcionesDetectadas(); }, []);
    if (detectadas && detectadas.length) l.push('<li><span>' + detectadas.length + (detectadas.length === 1 ? ' posible suscripción sin apuntar' : ' posibles suscripciones sin apuntar') + '</span><span></span></li>');
    var cargos = proximosCargos(14);
    cargos.slice(0, 4).forEach(function (c) {
      l.push('<li><span>' + esc(c.nombre) + ' <i class="marca">(' + (c.faltan === 0 ? 'hoy' : c.faltan === 1 ? 'mañana' : c.fecha.getDate() + ' ' + MESES[c.fecha.getMonth()]) + ')</i></span><span class="importe">' + dinero(c.importe) + '</span></li>');
    });
    return l.length ? '<ul class="filas avisos">' + l.join('') + '</ul>' : '<p class="sub">Nada pendiente.</p>';
  }
  function resumen(e) {
    var per = mesClave(e.mes), c = cuentasDeMes(per.clave), lista = cuentas();
    var total = financeProTotalBalance();
    var invertido = Number(financeProfile.invested || 0), emergencia = Number(financeProfile.emergency || 0);
    var patrimonio = intento(function () { return financeUnifiedPatrimonyChange(); }, { total: total + invertido + emergencia, change: null });
    var rangos = [['1m', '1 M.'], ['3m', '3 M.'], ['6m', '6 M.'], ['1a', '1 A.']].map(function (r) {
      return '<button type="button" data-rango="' + r[0] + '" aria-pressed="' + ((e.rango || '6m') === r[0]) + '">' + r[1] + '</button>';
    }).join('');
    return cabecera('Finanzas', 'Resumen de ' + esc(per.nombre)) +
      '<section class="franja crece">' +
        '<div class="bloque" style="grid-column: span 3">' +
          '<p class="rot">Posición total</p>' +
          '<p class="cifra">' + dinero(total) + '</p>' +
          '<p class="nota-cifra">' + dinero(c.neto, true) + ' en ' + per.mesNombre + '</p>' +
          '<ul class="filas al-pie">' + fila('Entra', dinero(c.entra, true)) + fila('Sale', dinero(-c.sale)) + fila('Queda', dinero(c.neto, true), 'total') + '</ul>' +
        '</div>' +
        '<div class="bloque" style="grid-column: span 6">' +
          '<div class="cab-bloque"><p class="rot">Evolución del saldo</p><div class="rangos">' + rangos + '</div></div>' +
          grafica(e) +
        '</div>' +
        '<div class="bloque" style="grid-column: span 3"><p class="rot">Ritmo de ' + per.mesNombre + '</p>' + bloqueRitmo() + '</div>' +
      '</section>' +
      '<section class="franja">' +
        '<div class="bloque" style="grid-column: span 3"><p class="rot">Cuentas</p><ul class="filas">' +
          lista.map(function (k) { return fila(esc(k.nombre), dinero(k.saldo)); }).join('') +
          fila('Total', dinero(total), 'total') +
          (invertido || emergencia ? fila('Inversión', dinero(invertido)) + fila('Emergencia', dinero(emergencia)) +
            fila('Patrimonio' + (patrimonio.change === null ? '' : ' <i class="marca">(' + (patrimonio.change >= 0 ? '+' : '−') + Math.abs(patrimonio.change).toFixed(1).replace('.', ',') + ' %)</i>'), dinero(patrimonio.total), 'total') : '') +
          '</ul></div>' +
        '<div class="bloque" style="grid-column: span 3"><p class="rot">En qué se va ' + per.mesNombre + '</p>' + barras(gastoPorCategoria(per.clave), 6) + '</div>' +
        '<div class="bloque" style="grid-column: span 3"><p class="rot">Presupuesto</p>' + presupuestoHtml(presupuestos(per.clave), 6) + '</div>' +
        '<div class="bloque" style="grid-column: span 3"><p class="rot">A tener en cuenta</p>' + bloqueAvisos(per.clave) + '</div>' +
      '</section>' +
      '<section class="franja">' +
        '<div class="bloque" style="grid-column: span 12"><div class="cab-bloque"><p class="rot">Últimos movimientos</p><button type="button" class="enlace mini" data-fin="todos">ver todos</button></div>' +
          tablaMovs(movimientos().slice(0, 4), { compacta: true, vacio: 'Todavía no hay movimientos. Importa un extracto o apunta el primero.' }) + '</div>' +
      '</section>';
  }

  // ---------- Movimientos ----------
  var FILTROS_TIPO = [['todo', 'Todo'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['traspaso', 'Traspasos'], ['neutro', 'Ahorros y ajustes'], ['revisar', 'Por revisar']];
  function filtrados(e) {
    var q = (e.buscar || '').trim().toLowerCase();
    var l = q ? movimientos() : movimientos().filter(function (m) { return m.fecha.slice(0, 7) === mesClave(e.mes).clave; });
    if (e.cuenta) l = l.filter(function (m) { return m.cuenta === e.cuenta || (m.t.type === 'transfer' && m.t.transferTo === e.cuenta); });
    if (e.tipo && e.tipo !== 'todo') l = l.filter(function (m) { return e.tipo === 'revisar' ? m.revisar : m.tipo === e.tipo; });
    if (q) l = l.filter(function (m) { return (m.concepto + ' ' + m.categoria + ' ' + m.cuentaNombre + ' ' + fmt.format(Math.abs(m.importe))).toLowerCase().indexOf(q) >= 0; });
    return l;
  }
  function pestanaMovimientos(e) {
    var lista = filtrados(e), paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    e.pagina = Math.min(e.pagina || 0, paginas - 1);
    var trozo = lista.slice(e.pagina * POR_PAGINA, (e.pagina + 1) * POR_PAGINA);
    var per = mesClave(e.mes), q = (e.buscar || '').trim();
    var entra = 0, sale = 0;
    lista.forEach(function (m) { if (m.tipo === 'ingreso') entra += m.importe; else if (m.tipo === 'gasto') sale -= m.importe; });
    var n = lista.length + (lista.length === 1 ? ' movimiento' : ' movimientos');
    var sub = (q ? n + ' con «' + esc(q) + '»' : n + ' en ' + esc(per.nombre)) + (lista.length ? ', entra ' + dinero(entra, true) + ' y sale ' + dinero(-sale) : '');
    var vacio = q ? 'Nada coincide con «' + q + '».' : 'No hay movimientos en ' + per.mesNombre + ' con estos filtros.';
    return cabecera('Movimientos', sub) +
      '<section class="franja crece"><div class="bloque" style="grid-column: span 12">' + tablaMovs(trozo, { vacio: vacio }) +
      (lista.length > POR_PAGINA ? '<div class="paginacion"><button type="button" class="enlace" data-pag="-1"' + (e.pagina === 0 ? ' disabled' : '') + '>Anterior</button>' +
      '<span>Página ' + (e.pagina + 1) + ' de ' + paginas + '</span>' +
      '<button type="button" class="enlace" data-pag="1"' + (e.pagina >= paginas - 1 ? ' disabled' : '') + '>Siguiente</button></div>' : '') +
      '</div></section>';
  }

  // ---------- Planificación ----------
  function planificacion(e) {
    var per = mesClave(e.mes), modelo = null;
    try { var p = presupuestoPlanDe(per.clave); modelo = financeBudgetUnifiedModel(per.clave, p.plan, p.recorded); } catch (err) {}
    var real = cuentasDeMes(per.clave), fijos = cargosFijos(per.clave);
    var cifras = modelo && (modelo.income || modelo.totalAssigned)
      ? '<ul class="filas">' +
          fila('Ingresos previstos', dinero(modelo.income, true)) +
          fila('Compromisos', dinero(-modelo.commitmentsAssigned)) +
          fila('Presupuestos', dinero(-modelo.manualAssigned)) +
          fila('Sin asignar', dinero(modelo.remaining), 'total') + '</ul>'
      : '<p class="sub">Sin planificación para ' + per.mesNombre + '. Se prepara en Bitácora, en Finanzas, planificación.</p>';
    var cats = modelo && modelo.categories && modelo.categories.length
      ? '<table class="tabla compacta"><thead><tr><th>Categoría</th><th class="num">Previsto</th><th class="num">Gastado</th><th class="num">Queda</th></tr></thead><tbody>' +
        modelo.categories.map(function (c) {
          return '<tr' + (c.status === 'superado' ? ' class="pasado"' : '') + '><td>' + esc(c.name) + '</td><td class="num importe">' + dinero(c.available) + '</td><td class="num importe">' + dinero(c.spent) + '</td><td class="num importe">' + dinero(c.remaining) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : presupuestoHtml(presupuestos(per.clave));
    var compromisos = modelo && modelo.commitments && modelo.commitments.length
      ? '<ul class="filas">' + modelo.commitments.map(function (c) { return fila(esc(mayuscula(c.nombre)) + ' <i class="marca">(' + c.n + ')</i>', dinero(c.charged) + ' / ' + dinero(c.planned)); }).join('') + '</ul>'
      : '';
    var meses = [];
    for (var i = 5; i >= 0; i--) { var m = mesClave((e.mes || 0) - i); var r = cuentasDeMes(m.clave); meses.push({ m: m, r: r }); }
    var maxNeto = Math.max.apply(null, meses.map(function (x) { return Math.max(x.r.entra, x.r.sale); })) || 1;
    return cabecera('Planificación', 'Presupuesto de ' + esc(per.nombre)) +
      '<section class="franja crece">' +
        '<div class="bloque" style="grid-column: span 3"><p class="rot">El mes en cifras</p>' + cifras +
          '<p class="rot sep-rot">Lo que va de mes</p><ul class="filas">' + fila('Entra', dinero(real.entra, true)) + fila('Sale', dinero(-real.sale)) + fila('Queda', dinero(real.neto, true), 'total') + '</ul></div>' +
        '<div class="bloque" style="grid-column: span 5"><p class="rot">Por categoría</p>' + cats + '</div>' +
        '<div class="bloque" style="grid-column: span 4"><p class="rot">Compromisos y cargos fijos</p>' + compromisos +
          (fijos.length ? '<ul class="filas">' + fijos.map(function (f) { return fila(esc(f.nombre) + ' <i class="marca">(día ' + f.dia + ')</i>', dinero(f.importe)); }).join('') +
            fila('Total al mes', dinero(fijos.reduce(function (s, f) { return s + f.importe; }, 0)), 'total') + '</ul>' : '<p class="sub">Sin suscripciones ni gastos fijos activos.</p>') + '</div>' +
      '</section>' +
      '<section class="franja">' +
        '<div class="bloque" style="grid-column: span 12"><p class="rot">Últimos seis meses</p>' +
          '<table class="tabla compacta meses"><thead><tr><th>Mes</th><th class="num">Entra</th><th class="num">Sale</th><th class="num">Queda</th><th class="barra-t"></th></tr></thead><tbody>' +
          meses.map(function (x) {
            return '<tr><td>' + esc(mayuscula(x.m.nombre)) + '</td><td class="num importe">' + dinero(x.r.entra, true) + '</td><td class="num importe">' + dinero(-x.r.sale) + '</td><td class="num importe">' + dinero(x.r.neto, true) + '</td>' +
              '<td class="barra-t"><span class="doble"><i class="entra" style="width:' + (x.r.entra / maxNeto * 100).toFixed(1) + '%"></i><i class="sale" style="width:' + (x.r.sale / maxNeto * 100).toFixed(1) + '%"></i></span></td></tr>';
          }).join('') + '</tbody></table></div>' +
      '</section>';
  }

  ED.apartados.finanzas = {
    nombre: 'Finanzas',
    pestanas: [{ id: 'resumen', nombre: 'Resumen' }, { id: 'movimientos', nombre: 'Movimientos' }, { id: 'planificacion', nombre: 'Planificación' }],
    contexto: function (e) {
      var per = mesClave(e.mes), atras = mesesConDatos();
      var html = '<p class="rot">Periodo</p><p>' + esc(mayuscula(per.nombre)) + '</p>' +
        '<p class="paso"><button type="button" class="enlace" data-mes="-1"' + (-(e.mes || 0) >= atras ? ' disabled' : '') + '>anterior</button> / <button type="button" class="enlace" data-mes="1"' + ((e.mes || 0) >= 0 ? ' disabled' : '') + '>siguiente</button></p>';
      if (e.pestana === 'movimientos') {
        html += '<p class="rot" style="margin-top:12px">Cuenta</p><p class="filtros">' +
          [['', 'Todas']].concat(cuentas().map(function (c) { return [c.id, c.nombre]; })).map(function (c) {
            return '<button type="button" class="enlace' + ((e.cuenta || '') === c[0] ? ' actual' : '') + '" data-cuenta="' + c[0] + '">' + esc(c[1]) + '</button>';
          }).join(' / ') + '</p>' +
          '<p class="rot" style="margin-top:12px">Tipo</p><p class="filtros">' +
          FILTROS_TIPO.map(function (t) { return '<button type="button" class="enlace' + ((e.tipo || 'todo') === t[0] ? ' actual' : '') + '" data-tipo="' + t[0] + '">' + t[1] + '</button>'; }).join(' / ') + '</p>';
      } else {
        html += '<p class="rot" style="margin-top:12px">Cuentas</p><p>' + esc(cuentas().map(function (c) { return c.nombre; }).join(', ')) + '</p>';
      }
      return html;
    },
    pie: function () { return ''; },
    pintar: function (pagina, e) {
      pagina.innerHTML = e.pestana === 'movimientos' ? pestanaMovimientos(e) : e.pestana === 'planificacion' ? planificacion(e) : resumen(e);
    },
    clicMargen: function (ev, e) {
      var b = ev.target.closest('[data-mes]'), c = ev.target.closest('[data-cuenta]'), t = ev.target.closest('[data-tipo]');
      if (c) { e.cuenta = c.dataset.cuenta; e.pagina = 0; return ED.pintarApartado(); }
      if (t) { e.tipo = t.dataset.tipo; e.pagina = 0; return ED.pintarApartado(); }
      if (!b || b.disabled) return;
      var nuevo = (e.mes || 0) + (+b.dataset.mes);
      if (nuevo > 0 || -nuevo > mesesConDatos()) return;
      e.mes = nuevo; e.pagina = 0; ED.pintarApartado();
    },
    clicPagina: function (ev, e) {
      var r = ev.target.closest('[data-rango]'), p = ev.target.closest('[data-pag]'), f = ev.target.closest('[data-fin]');
      if (r) { e.rango = r.dataset.rango; ED.pintarApartado(); return; }
      if (p && !p.disabled) { e.pagina = (e.pagina || 0) + (+p.dataset.pag); ED.pintarApartado(); return; }
      if (!f) return;
      var ir = function (pestana, cambios) { Object.assign(e, cambios || {}); var t = document.querySelector('[data-pestana="' + pestana + '"]'); if (t) t.click(); else ED.pintarApartado(); };
      if (f.dataset.fin === 'presupuesto') return ir('planificacion');
      if (f.dataset.fin === 'todos') return ir('movimientos', { tipo: 'todo', cuenta: '' });
      if (f.dataset.fin === 'revisar') return ir('movimientos', { tipo: 'revisar', cuenta: '', buscar: '' });
      if (f.dataset.fin === 'nuevo') return ED.abrirApuntar();
      var sub = document.querySelector('#ed-pagina .sub');
      if (sub) sub.innerHTML = 'Importar extractos llega en el siguiente paso. De momento, en <a href="https://appbitacora.es/#finances">Bitácora</a>.';
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
