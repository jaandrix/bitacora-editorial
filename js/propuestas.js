// Propuestas: lo que espera validación (dinero y borrados que llegan del conector) y el historial de todo lo que
// se ha aplicado, venga de apuntar o del conector, con deshacer. Usa la bandeja de la app normal (conector.js):
// aplicarBandejaConector, validarBandeja, descartarBandeja y deshacerConector.
window.ED = window.ED || {};
window.ED.apartados = window.ED.apartados || {};
(function (ED) {
  var POR_PAGINA = 20;
  var ORIGEN = { apuntar: 'De apuntar', auto: 'De conector', validado: 'De conector, validado', descartado: 'Descartado' };
  var leido = 0;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cuando(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).replace('.', '') + ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  function pendientes() { return typeof bandejaPendiente !== 'undefined' && Array.isArray(bandejaPendiente) ? bandejaPendiente : []; }
  // El historial junta el del conector con «lo que has apuntado»: lo apuntado que pasó por el conector ya está en el
  // primero, así que de la segunda lista solo entra lo que la app guardó directamente (gastos, tareas, eventos, notas).
  function historial(e) {
    var q = (e.buscar || '').trim().toLowerCase();
    var con = typeof registroConector !== 'undefined' && Array.isArray(registroConector) ? registroConector : [];
    var apu = typeof apuntesRecientes !== 'undefined' && Array.isArray(apuntesRecientes) ? apuntesRecientes : [];
    var l = con.map(function (x) { return { id: x.id, cuando: x.cuando, origen: x.origen, resumen: x.resumen, deshecho: x.deshecho, puede: !!x.deshacer, de: 'conector' }; })
      .concat(apu.filter(function (a) { return !(a.deshacer && a.deshacer.tipo === 'conector'); }).map(function (a) {
        return { id: a.id, cuando: a.cuando, origen: 'apuntar', resumen: (a.resumen || a.texto) + (a.texto && a.resumen ? ' («' + a.texto + '»)' : ''), deshecho: a.deshecho, puede: !!a.deshacer, de: 'apunte' };
      }))
      .sort(function (x, y) { return String(y.cuando).localeCompare(String(x.cuando)); });
    return q ? l.filter(function (x) { return (x.resumen + ' ' + (ORIGEN[x.origen] || '')).toLowerCase().indexOf(q) >= 0; }) : l;
  }

  // Lee lo pendiente del servidor como hace la app al abrir la bandeja (y aplica lo automático, igual que ella).
  ED.leerPropuestas = async function () {
    if (Date.now() - leido < 20000) return;
    leido = Date.now();
    try { await aplicarBandejaConector(); } catch (e) {}
    ED.repintar();
  };
  ED.numPropuestas = function () { return pendientes().length; };

  function cabecera(titulo, sub, botones) {
    return '<header class="cabecera"><div><h1>' + esc(titulo) + '</h1><p class="sub">' + esc(sub) + '</p></div>' + (botones ? '<div class="botones">' + botones + '</div>' : '') + '</header>';
  }

  function porValidar(e) {
    var l = pendientes();
    var q = (e.buscar || '').trim().toLowerCase();
    var filas = l.map(function (f) { return { f: f, d: describirOpConector(f.op || {}), g: apartadoDeOp(f.op || {}) }; })
      .filter(function (x) { return !q || (x.d.tipo + ' ' + x.d.texto + ' ' + x.d.meta + ' ' + x.g).toLowerCase().indexOf(q) >= 0; });
    var botones = l.length > 1 ? '<button type="button" class="boton lleno" data-prop="validar-todo">Validar todo</button><button type="button" class="boton" data-prop="descartar-todo">Descartar todo</button>' : '';
    var cuerpo = filas.length
      ? '<table class="tabla"><thead><tr><th class="cat">Apartado</th><th class="cat">Qué</th><th>Detalle</th><th class="fecha-t">Pedido</th><th class="acc-t"></th></tr></thead><tbody>' +
        filas.map(function (x) {
          return '<tr><td class="cat">' + esc(x.g.charAt(0).toUpperCase() + x.g.slice(1)) + '</td><td class="cat">' + esc(x.d.tipo) + '</td>' +
            '<td title="' + esc(x.d.texto + (x.d.meta ? ', ' + x.d.meta : '')) + '">' + esc(x.d.texto) + (x.d.meta ? ' <i>(' + esc(x.d.meta) + ')</i>' : '') + '</td>' +
            '<td class="fecha-t">' + esc(cuando(x.f.creado)) + '</td>' +
            '<td class="acc-t"><button type="button" class="enlace" data-validar="' + esc(x.f.id) + '">validar</button> / <button type="button" class="enlace" data-descartar="' + esc(x.f.id) + '">descartar</button></td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="sub">' + (q ? 'Nada coincide con «' + esc(q) + '».' : 'No hay nada esperando. Lo que el conector proponga sobre dinero o borrados aparecerá aquí hasta que lo valides.') + '</p>';
    return cabecera('Propuestas', l.length ? l.length + (l.length === 1 ? ' cambio espera' : ' cambios esperan') + ' tu visto bueno' : 'Nada pendiente', botones) +
      '<section class="franja crece"><div class="bloque" style="grid-column: span 12">' + cuerpo + '</div></section>';
  }

  function pestanaHistorial(e) {
    var l = historial(e), paginas = Math.max(1, Math.ceil(l.length / POR_PAGINA));
    e.pagina = Math.min(e.pagina || 0, paginas - 1);
    var trozo = l.slice(e.pagina * POR_PAGINA, (e.pagina + 1) * POR_PAGINA);
    var cuerpo = trozo.length
      ? '<table class="tabla"><thead><tr><th class="fecha-t">Cuándo</th><th class="cat">Origen</th><th>Qué se hizo</th><th class="acc-t"></th></tr></thead><tbody>' +
        trozo.map(function (x) {
          var estado = x.deshecho ? '<i>deshecho</i>' : x.puede ? '<button type="button" class="enlace" data-deshacer="' + esc(x.id) + '" data-de="' + x.de + '">deshacer</button>' : '';
          return '<tr' + (x.deshecho ? ' class="deshecho"' : '') + '><td class="fecha-t">' + esc(cuando(x.cuando)) + '</td><td class="cat">' + esc(ORIGEN[x.origen] || 'Aplicado') + '</td>' +
            '<td title="' + esc(x.resumen) + '">' + esc(String(x.resumen || '').replace(/\.$/, '')) + '</td><td class="acc-t">' + estado + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="sub">Todavía no hay historial.</p>';
    return cabecera('Historial', l.length + (l.length === 1 ? ' cambio' : ' cambios') + ', de apuntar y del conector') +
      '<section class="franja crece"><div class="bloque" style="grid-column: span 12">' + cuerpo +
      (l.length > POR_PAGINA ? '<div class="paginacion"><button type="button" class="enlace" data-pag="-1"' + (e.pagina === 0 ? ' disabled' : '') + '>Anterior</button><span>Página ' + (e.pagina + 1) + ' de ' + paginas + '</span><button type="button" class="enlace" data-pag="1"' + (e.pagina >= paginas - 1 ? ' disabled' : '') + '>Siguiente</button></div>' : '') +
      '</div></section>';
  }

  // Borrar o deshacer se confirma en la propia línea: el primer toque cambia el texto a «¿seguro? sí»
  function confirmarEnLinea(b, accion) {
    if (b.dataset.seguro) return accion();
    b.dataset.seguro = '1';
    var antes = b.textContent;
    b.textContent = '¿seguro? sí';
    setTimeout(function () { if (b.isConnected) { delete b.dataset.seguro; b.textContent = antes; } }, 4000);
  }

  ED.apartados.propuestas = {
    nombre: 'Propuestas',
    pestanas: [{ id: 'validar', nombre: 'Por validar' }, { id: 'historial', nombre: 'Historial' }],
    alAbrir: function () { ED.leerPropuestas(); },
    contexto: function () {
      var n = pendientes().length;
      return '<p class="rot">Pendientes</p><p>' + (n ? n + (n === 1 ? ' por validar' : ' por validar') : 'Ninguno') + '</p>' +
        '<p class="rot" style="margin-top:12px">Cómo llega</p><p class="paso">El dinero y los borrados que pide el conector esperan aquí. Lo demás se aplica solo y queda en el historial.</p>';
    },
    pie: function () { return ''; },
    pintar: function (pagina, e) { pagina.innerHTML = e.pestana === 'historial' ? pestanaHistorial(e) : porValidar(e); },
    clicPagina: async function (ev, e) {
      var v = ev.target.closest('[data-validar]'), d = ev.target.closest('[data-descartar]'), h = ev.target.closest('[data-deshacer]');
      var p = ev.target.closest('[data-pag]'), t = ev.target.closest('[data-prop]');
      if (p && !p.disabled) { e.pagina = (e.pagina || 0) + (+p.dataset.pag); return ED.pintarApartado(); }
      if (v) { await validarBandeja([v.dataset.validar]); return ED.pintarApartado(); }
      if (d) return confirmarEnLinea(d, async function () { await descartarBandeja([d.dataset.descartar]); ED.pintarApartado(); });
      if (h) return confirmarEnLinea(h, async function () { if (h.dataset.de === 'apunte') { await deshacerApunte(h.dataset.deshacer); ED.pintarApartado(); return; } await deshacerConector(h.dataset.deshacer, true); invalidarCachesDerivadas(); ED.pintarApartado(); try { await saveData(); } catch (err) {} });
      if (t && t.dataset.prop === 'validar-todo') return confirmarEnLinea(t, async function () { await validarBandeja(pendientes().map(function (f) { return f.id; })); ED.pintarApartado(); });
      if (t && t.dataset.prop === 'descartar-todo') return confirmarEnLinea(t, async function () { var c = window.confirm; window.confirm = function () { return true; }; try { await descartarBandeja(pendientes().map(function (f) { return f.id; })); } finally { window.confirm = c; } ED.pintarApartado(); });
    },
    tecla: function (ev, e) {
      if (e.pestana !== 'historial' || (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft')) return false;
      var paginas = Math.max(1, Math.ceil(historial(e).length / POR_PAGINA));
      var nueva = (e.pagina || 0) + (ev.key === 'ArrowRight' ? 1 : -1);
      if (nueva < 0 || nueva >= paginas) return true;
      e.pagina = nueva; ED.pintarApartado(); return true;
    }
  };
})(window.ED);
