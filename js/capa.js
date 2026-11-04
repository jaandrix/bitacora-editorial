// Apuntar (Espacio) y «¿dónde quieres ir?» (Intro). Las dos se abren sobre lo que haya: la página se funde con su
// fondo y queda solo una casilla. Apuntar usa el mismo intérprete de la app normal (apuntarTrocear,
// interpretarApunte, apuntarTipo, apuntarCrear) y deja cada cosa en «lo que has apuntado» y en el historial del
// conector, con deshacer. Además sabe borrar movimientos: «borra el gasto de 12 en gasolina».
window.ED = window.ED || {};
(function (ED) {
  var $ = function (id) { return document.getElementById(id); };
  var capa = $('ed-capa'), caja = $('ed-capa-texto'), pista = $('ed-capa-pista'), lista = $('ed-capa-lista');
  var modo = null, elegidos = {}, items = [], seleccion = 0, destinos = [];
  var reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BORRAR = /^\s*(?:borra|borrar|bórralo|quita|quitar|elimina|eliminar)\b\s*(?:el|la|ese|esa|lo)?\s*(?:gasto|ingreso|movimiento|cargo|pago)?\s*(?:de|del)?\s*/i;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // En Finanzas un número suelto es el importe: «12 en gasolina» se lee como «12 € en gasolina» antes de pasarlo al
  // intérprete de la app, que sin «€» o «gasté» no lo toma por dinero.
  function conImporte(t, siempre) {
    if (!siempre && ED.vista !== 'finanzas') return t;
    if (/€|\beur(?:os?)?\b|\bpavos\b/i.test(t)) return t;
    return t.replace(/(^|\s)(\d+(?:[.,]\d{1,2})?)(?=\s|$)(?!\s*(?:h\b|horas?|:|de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)))/i, '$1$2 €');
  }

  // ---------- Borrar movimientos ----------
  function buscarMovimiento(texto) {
    var resto = texto.replace(BORRAR, '');
    var r = interpretarApunte(conImporte(resto, true));
    var palabras = norm(r.titulo || resto).split(/[^a-z0-9ñ]+/).filter(function (p) { return p.length > 2 && !/^(euros?|pavos|gasto|ayer|hoy)$/.test(p); });
    var mejor = null;
    financePro.transactions.forEach(function (t) {
      if (t.type === 'transfer') return;
      var puntos = 0;
      if (r.importe != null) { if (Math.abs((Number(t.amount) || 0) - r.importe) < 0.005) puntos += 3; else return; }
      var cat = financeProCategoryById(t.category);
      var donde = norm((t.note || '') + ' ' + (cat ? cat.name : ''));
      palabras.forEach(function (p) { if (donde.indexOf(p) >= 0) puntos += 1; });
      if (r.fechaDicha) { if (t.date === r.fecha) puntos += 2; else puntos -= 1; }
      if (puntos < (r.importe != null ? 3 : 1)) return;
      if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && (t.date || '') > (mejor.t.date || ''))) mejor = { t: t, puntos: puntos };
    });
    return mejor && mejor.t;
  }
  function describirMovimiento(t) {
    var cat = financeProCategoryById(t.category);
    var cuenta = (financePro.accounts[t.account] && financePro.accounts[t.account].name) || t.account;
    return (t.type === 'income' ? 'ingreso' : 'gasto') + ' de ' + financeMoney(t.amount) + (t.note ? ', ' + t.note : cat ? ', ' + cat.name.toLowerCase() : '') + ', ' + apuntarFechaTexto(t.date) + ' (' + cuenta + ')';
  }

  // ---------- Análisis de lo escrito ----------
  function tipoEnApartado(r, k) {
    if (elegidos[k]) return elegidos[k];
    // Dentro de Finanzas, lo escrito es un movimiento salvo que sea claramente otra cosa con fecha u hora
    if (ED.vista === 'finanzas' && (r.importe != null || !(r.fechaDicha || r.hora))) return 'gasto';
    return apuntarTipo(r);
  }
  function analizar() {
    var texto = caja.value;
    items = apuntarTrocear(texto).map(function (t, k) {
      if (BORRAR.test(t)) {
        var mov = buscarMovimiento(t);
        return { texto: t, borrar: true, mov: mov, resumen: mov ? 'borrar ' + describirMovimiento(mov) : 'no encuentro ese movimiento', falta: mov ? '' : 'prueba con el importe o el concepto' };
      }
      var t2 = conImporte(t), r = interpretarApunte(t2), tipo = tipoEnApartado(r, k), d = apuntarDescribir(r, tipo);
      return { texto: t2, r: r, tipo: tipo, resumen: d.texto, falta: d.falta, html: true };
    });
  }
  function pintarApuntar() {
    analizar();
    if (!items.length) { lista.innerHTML = ''; return; }
    var tipos = (typeof APUNTAR_TIPOS !== 'undefined' ? APUNTAR_TIPOS : []).filter(function (x) { return (x[0] !== 'compra' || apartadoVisible('compra')) && (['examen', 'trabajo', 'clase'].indexOf(x[0]) < 0 || apartadoVisible('studies')) && (!APUNTAR_OCIO[x[0]] || apartadoVisible('culture')); });
    lista.innerHTML = items.map(function (it, k) {
      var etiqueta = it.borrar ? '<span class="rot">borrar</span>' :
        '<label class="tipo-apunte"><span class="oculto">Tipo</span><select data-k="' + k + '">' + tipos.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === it.tipo ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>';
      return '<li class="' + (it.falta ? 'incompleto' : '') + '">' + etiqueta + '<span class="resumen">' + (it.html ? it.resumen : esc(it.resumen)) + '</span>' +
        (it.falta ? '<small class="falta">' + esc(it.falta) + '</small>' : '') + '</li>';
    }).join('');
  }

  async function guardar() {
    analizar();
    if (!items.length) return;
    var hechos = [], fallos = [];
    items.forEach(function (it) {
      if (it.borrar) {
        if (!it.mov) { fallos.push('«' + it.texto + '»: ' + it.resumen); return; }
        var ref = 'ap_borrar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        var l = aplicarOpConector({ tipo: 'borrar', coleccion: 'movimiento', id: it.mov.id, resumen: describirMovimiento(it.mov) }, ref);
        if (!l) { fallos.push('«' + it.texto + '»: ya no estaba'); return; }
        registrarLineaConector(l, 'apuntar');
        apuntarRegistrar(it.texto, 'borrado', l.resumen, { tipo: 'conector', ref: ref });
        hechos.push('Borrado: ' + describirMovimiento(it.mov));
        return;
      }
      var res = apuntarCrear(it.texto, it.r, it.tipo);
      if (res.error) { fallos.push('«' + it.texto + '»: ' + res.error); return; }
      apuntarRegistrar(it.texto, it.tipo, res.aviso, res.hecho);
      hechos.push(res.aviso);
    });
    if (!hechos.length) { pista.textContent = fallos[0] || 'No he podido apuntarlo.'; pista.classList.add('error-linea'); return; }
    invalidarCachesDerivadas();
    cerrar();
    ED.aviso(hechos.length === 1 ? hechos[0] + (fallos.length ? '. Sin apuntar: ' + fallos.join('; ') : '') : hechos.length + ' cosas apuntadas' + (fallos.length ? '. Sin apuntar: ' + fallos.join('; ') : ''), !!fallos.length);
    ED.repintar();
    try { await saveData(); } catch (e) { ED.aviso('No se ha podido guardar en la nube. Queda en este dispositivo.', true); }
  }

  // ---------- ¿Dónde quieres ir? ----------
  var EDITORIAL = { finances: 'finanzas', bandeja: 'propuestas' };
  function todosLosDestinos() {
    var out = [];
    try {
      navSeccionesVisibles().forEach(function (s) { (s.items || []).forEach(function (i) { if (i.view && i.label) out.push({ view: i.view, nombre: String(i.label).replace(/\.$/, '') }); }); });
    } catch (e) {}
    if (!out.some(function (d) { return d.view === 'bandeja'; })) out.push({ view: 'bandeja', nombre: 'Propuestas' });
    out.unshift({ view: '_indice', nombre: 'Índice' }, { view: '_ajustes', nombre: 'Ajustes de la edición' });
    return out.map(function (d) { d.nombre = d.nombre.charAt(0).toUpperCase() + d.nombre.slice(1); return d; });
  }
  function pintarIr() {
    var q = norm(caja.value.trim());
    destinos = todosLosDestinos().filter(function (d) { return !q || norm(d.nombre).indexOf(q) >= 0; });
    seleccion = Math.min(seleccion, Math.max(0, destinos.length - 1));
    lista.innerHTML = destinos.map(function (d, i) {
      var donde = d.view.charAt(0) === '_' || EDITORIAL[d.view] ? 'en la edición' : 'en Bitácora';
      return '<li class="destino' + (i === seleccion ? ' elegido' : '') + '" data-i="' + i + '"><span class="resumen">' + esc(d.nombre) + '</span><small>' + donde + '</small></li>';
    }).join('') || '<li><span class="resumen">Nada con ese nombre.</span></li>';
  }
  function ir(d) {
    if (!d) return;
    cerrar(true);
    if (d.view === '_indice') return ED.apartados[ED.vista] ? ED.volverAlIndice() : null;
    if (d.view === '_ajustes') return ED.verAjustes && ED.verAjustes();
    if (EDITORIAL[d.view]) return ED.abrirApartado(EDITORIAL[d.view]);
    location.href = 'https://appbitacora.es/#' + d.view;
  }

  // ---------- Abrir y cerrar ----------
  function abrir(m) {
    if (modo) return;
    if (ED.vista === 'acceso' || ED.vista === 'ajustes' && m === 'apuntar') return;
    modo = m; elegidos = {}; seleccion = 0;
    document.body.classList.add('con-capa');
    document.body.classList.toggle('capa-en-lamina', !!ED.apartados[ED.vista]);
    caja.value = '';
    caja.placeholder = m === 'apuntar' ? (ED.vista === 'finanzas' ? 'apuntar en finanzas' : 'apuntar') : '¿dónde quieres ir?';
    pista.classList.remove('error-linea');
    pista.textContent = m === 'apuntar'
      ? (ED.vista === 'finanzas' ? 'Un gasto o un ingreso: «12 en gasolina», «nómina 1.840». Para borrar: «borra el de 12 en gasolina». Intro guarda, Escape sale.' : 'Escribe como hablas: «cena con Marta el viernes a las 9», «gasté 12 en gasolina». Abajo ves dónde irá cada cosa. Intro guarda, Escape sale.')
      : 'Escribe el nombre de un apartado. Flechas para elegir, Intro para ir.';
    lista.innerHTML = '';
    capa.hidden = false;
    if (m === 'ir') pintarIr();
    requestAnimationFrame(function () { capa.classList.add('visible'); });
    caja.focus();
  }
  function cerrar(rapido) {
    if (!modo) return;
    modo = null;
    capa.classList.remove('visible');
    document.body.classList.remove('con-capa');
    caja.blur();
    setTimeout(function () { if (!modo) capa.hidden = true; }, rapido || reducido ? 0 : 180);
  }
  ED.abrirApuntar = function () { abrir('apuntar'); };
  ED.abrirIr = function () { abrir('ir'); };
  ED.cerrarCapa = cerrar;
  ED.capaAbierta = function () { return !!modo; };

  var temporizador = null;
  caja.addEventListener('input', function () {
    pista.classList.remove('error-linea');
    if (modo === 'ir') { seleccion = 0; return pintarIr(); }
    cancelAnimationFrame(temporizador); temporizador = requestAnimationFrame(pintarApuntar);
  });
  caja.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); return cerrar(); }
    if (modo === 'ir' && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      ev.preventDefault();
      seleccion = Math.max(0, Math.min(destinos.length - 1, seleccion + (ev.key === 'ArrowDown' ? 1 : -1)));
      return pintarIr();
    }
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); return modo === 'ir' ? ir(destinos[seleccion]) : guardar(); }
  });
  lista.addEventListener('change', function (ev) {
    var s = ev.target.closest('select[data-k]'); if (!s) return;
    elegidos[+s.dataset.k] = s.value; pintarApuntar(); caja.focus();
  });
  lista.addEventListener('click', function (ev) {
    var li = ev.target.closest('.destino'); if (li) ir(destinos[+li.dataset.i]);
  });
  capa.addEventListener('mousedown', function (ev) { if (ev.target === capa) { ev.preventDefault(); cerrar(); } });
})(window.ED);
