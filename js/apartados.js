// El resto de apartados de la edición: los mismos datos de la app normal (entries, dayPlanner, habits, notes,
// studies, listaCompra, pedidos...) y sus mismas funciones para marcar (togglePlannerItemDone, toggleHabitToday,
// toggleRecurringTaskDoneToday), compuestos como láminas de periódico. Para añadir algo se usa apuntar.
window.ED = window.ED || {};
window.ED.apartados = window.ED.apartados || {};
(function (ED) {
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  // ---------- Piezas comunes ----------
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function may(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function intento(fn, porDefecto) { try { return fn(); } catch (e) { return porDefecto; } }
  function iso(d) { return isoLocal(d); }
  function hoy() { return todayISO(); }
  function sumar(f, n) { var d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
  function dias(desde, hasta) { return Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 864e5); }
  function fCorta(f) { var p = String(f || '').split('-'); return p.length < 3 ? '' : +p[2] + ' ' + MESES[+p[1] - 1]; }
  function fLarga(f) { var d = new Date(f + 'T12:00:00'); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES_LARGOS[d.getMonth()]; }
  function relativa(f) {
    var n = dias(hoy(), f);
    if (n === 0) return 'hoy'; if (n === 1) return 'mañana'; if (n === -1) return 'ayer';
    if (n > 1 && n < 7) return DIAS[new Date(f + 'T12:00:00').getDay()];
    return fCorta(f);
  }
  function hora(e) { return e.time || e.startTime || ''; }
  function titulo(e) {
    if (e._recurringPayment) return 'Pago: ' + e.title;
    if (e.type === 'work') return 'Trabajo' + (e.company ? ' en ' + e.company : '');
    if (e.type === 'birthday') return 'Cumpleaños de ' + e.title;
    return e.title || 'Sin título';
  }
  // Los libros, series, pelis y juegos llevan fecha de inicio, pero su sitio es Ocio, no la agenda
  var NO_AGENDA = ['book', 'series', 'movie', 'game', 'place', 'document'];
  function delDia(f) { return intento(function () { return getDayAllEntries(f); }, []).filter(function (x) { return NO_AGENDA.indexOf(x.type) < 0; }).sort(function (a, b) { return hora(a).localeCompare(hora(b)); }); }
  function cab(t, sub, botones) {
    return '<header class="cabecera"><div><h1>' + esc(t) + '</h1><p class="sub">' + sub + '</p></div><div class="botones">' + (botones || '') +
      '<button type="button" class="boton lleno" data-ap="apuntar">+ Apuntar</button></div></header>';
  }
  function bloque(span, rot, html, extra) { return '<div class="bloque' + (extra ? ' ' + extra : '') + '" style="grid-column: span ' + span + '">' + (rot ? '<p class="rot">' + rot + '</p>' : '') + html + '</div>'; }
  function franja(html, crece) { return '<section class="franja' + (crece ? ' crece' : '') + '">' + html + '</section>'; }
  function vacio(t) { return '<p class="sub">' + t + '</p>'; }
  function filas(lista) { return lista.length ? '<ul class="filas">' + lista.join('') + '</ul>' : ''; }
  function fila(izq, der, clase) { return '<li' + (clase ? ' class="' + clase + '"' : '') + '><span>' + izq + '</span><span class="importe">' + (der || '') + '</span></li>'; }
  function marca(t) { return t ? ' <i class="marca">(' + esc(t) + ')</i>' : ''; }
  // Casilla de marcar: un círculo que se rellena, como en la app
  function marcar(hecho, attrs) { return '<button type="button" class="marcar' + (hecho ? ' hecho' : '') + '" ' + attrs + ' aria-pressed="' + !!hecho + '"><span class="oculto">' + (hecho ? 'Desmarcar' : 'Marcar') + '</span></button>'; }
  function porPaginas(lista, e, por) {
    var paginas = Math.max(1, Math.ceil(lista.length / por));
    e.pagina = Math.min(e.pagina || 0, paginas - 1);
    return {
      trozo: lista.slice(e.pagina * por, (e.pagina + 1) * por), paginas: paginas,
      pie: lista.length > por ? '<div class="paginacion"><button type="button" class="enlace" data-pag="-1"' + (e.pagina === 0 ? ' disabled' : '') + '>Anterior</button><span>Página ' + (e.pagina + 1) + ' de ' + paginas + '</span><button type="button" class="enlace" data-pag="1"' + (e.pagina >= paginas - 1 ? ' disabled' : '') + '>Siguiente</button></div>' : ''
    };
  }
  function buscar(lista, e, texto) {
    var q = (e.buscar || '').trim().toLowerCase();
    return q ? lista.filter(function (x) { return texto(x).toLowerCase().indexOf(q) >= 0; }) : lista;
  }
  // Lo común a todos: apuntar, pasar de página y las teclas de las flechas
  function definir(id, def) {
    def.pie = def.pie || function () { return ''; };
    var clicPropio = def.clicPagina;
    def.clicPagina = function (ev, e) {
      var p = ev.target.closest('[data-pag]'), a = ev.target.closest('[data-ap]');
      if (a && a.dataset.ap === 'apuntar') return ED.abrirApuntar();
      if (p && !p.disabled) { e.pagina = (e.pagina || 0) + (+p.dataset.pag); return ED.pintarApartado(); }
      if (clicPropio) return clicPropio(ev, e);
    };
    var clicMargen = def.clicMargen;
    def.clicMargen = function (ev, e) {
      var f = ev.target.closest('[data-f]');
      if (f) { e[f.dataset.f] = f.dataset.v; e.pagina = 0; return ED.pintarApartado(); }
      if (clicMargen) return clicMargen(ev, e);
    };
    var teclaPropia = def.tecla;
    def.tecla = function (ev, e) {
      if (teclaPropia && teclaPropia(ev, e)) return true;
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return false;
      var antes = e.pagina || 0;
      e.pagina = antes + (ev.key === 'ArrowRight' ? 1 : -1);
      if (e.pagina < 0) { e.pagina = 0; return true; }
      ED.pintarApartado();
      if ((e.pagina || 0) === antes) return true;
      return true;
    };
    ED.apartados[id] = def;
  }
  function opciones(campo, actual, lista) {
    return '<p class="filtros">' + lista.map(function (o) { return '<button type="button" class="enlace' + ((actual || lista[0][0]) === o[0] ? ' actual' : '') + '" data-f="' + campo + '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join(' / ') + '</p>';
  }
  function reintentar(fn) { return async function () { try { await fn.apply(null, arguments); } catch (e) { ED.aviso('No se ha podido guardar', true); } ED.pintarApartado(); }; }

  // ---------- Tareas y rutinas de un día ----------
  function tareasDe(offset) { return intento(function () { return plannerItemsForOffset(offset); }, []).slice().sort(function (a, b) { return (a.time || '99').localeCompare(b.time || '99'); }); }
  function recurrentesHoy() { return intento(function () { return recurringTasksDueToday(); }, []); }
  function rutinas() { return (typeof habits !== 'undefined' && Array.isArray(habits) ? habits : []).filter(function (h) { return h.activo !== false && h.active !== false; }); }
  function rutinasDe(f) { return rutinas().filter(function (h) { return intento(function () { return rutinaToca(h, f); }, true); }); }
  function filaTarea(t, offset) {
    return '<li class="tarea' + (t.done ? ' hecha' : '') + '">' + marcar(t.done, 'data-tarea="' + esc(t.id) + '" data-off="' + offset + '"') +
      '<span class="hora-t">' + esc(t.time || '') + '</span><span class="texto-t">' + esc(t.title || t.text || '') + '</span></li>';
  }
  function filaRecurrente(t) {
    var hecha = !!(t.completadas && t.completadas[hoy()]);
    return '<li class="tarea' + (hecha ? ' hecha' : '') + '">' + marcar(hecha, 'data-recurrente="' + esc(t.id) + '"') +
      '<span class="hora-t">' + esc(t.hora || '') + '</span><span class="texto-t">' + esc(t.texto || t.title || '') + marca('se repite') + '</span></li>';
  }
  function filaRutina(h) {
    var hecha = !!(h.completadas && h.completadas[hoy()]);
    var racha = intento(function () { return habitStreak(h); }, 0);
    return '<li class="tarea' + (hecha ? ' hecha' : '') + '">' + marcar(hecha, 'data-rutina="' + esc(h.id) + '"') +
      '<span class="texto-t">' + esc(h.texto || h.name || '') + (racha > 1 ? marca(racha + ' días seguidos') : '') + '</span></li>';
  }
  async function clicMarcar(ev) {
    var t = ev.target.closest('[data-tarea]'), r = ev.target.closest('[data-recurrente]'), h = ev.target.closest('[data-rutina]');
    if (t) { await reintentar(togglePlannerItemDone)(t.dataset.tarea, +t.dataset.off); return true; }
    if (r) { await reintentar(toggleRecurringTaskDoneToday)(r.dataset.recurrente); return true; }
    if (h) { await reintentar(toggleHabitToday)(h.dataset.rutina); return true; }
    return false;
  }
  function listaEventos(lista) {
    return lista.length ? '<ul class="filas agenda">' + lista.map(function (e) {
      return '<li><span class="hora-t">' + esc(hora(e)) + '</span><span class="texto-t">' + esc(titulo(e)) + (e.place ? marca(e.place) : '') + '</span></li>';
    }).join('') + '</ul>' : '';
  }

  // ---------- Hoy ----------
  definir('hoy', {
    nombre: 'Hoy', pestanas: [{ id: 'hoy', nombre: 'Hoy' }, { id: 'semana', nombre: 'Los próximos días' }],
    contexto: function () { return '<p class="rot">Fecha</p><p>' + esc(may(fLarga(hoy()))) + '</p>'; },
    pintar: function (pagina, e) {
      if (e.pestana === 'semana') {
        var cols = '';
        for (var i = 1; i <= 6; i++) { var f = sumar(hoy(), i); cols += bloque(2, may(relativa(f)) + ', ' + fCorta(f), listaEventos(delDia(f)) || vacio('Nada.')); }
        pagina.innerHTML = cab('Los próximos días', 'Lo que viene esta semana') + franja(cols, true);
        return;
      }
      var ev = delDia(hoy()).filter(function (x) { return x.type !== 'work'; }), ta = tareasDe(0), re = recurrentesHoy(), ru = rutinasDe(hoy());
      var hechas = ta.filter(function (t) { return t.done; }).length + re.filter(function (t) { return t.completadas && t.completadas[hoy()]; }).length;
      var total = ta.length + re.length;
      var manana = delDia(sumar(hoy(), 1));
      pagina.innerHTML = cab('Hoy', esc(may(fLarga(hoy()))) + (total ? ', ' + hechas + ' de ' + total + ' tareas hechas' : '')) +
        franja(
          bloque(4, 'La agenda', listaEventos(ev) || vacio('Sin citas hoy.')) +
          bloque(5, 'Tareas', (ta.length || re.length ? '<ul class="filas tareas">' + ta.map(function (t) { return filaTarea(t, 0); }).join('') + re.map(filaRecurrente).join('') + '</ul>' : vacio('Nada pendiente para hoy.'))) +
          bloque(3, 'Rutinas', ru.length ? '<ul class="filas tareas">' + ru.map(filaRutina).join('') + '</ul>' : vacio('Sin rutinas para hoy.')), true) +
        franja(bloque(12, 'Mañana, ' + fCorta(sumar(hoy(), 1)), listaEventos(manana) || vacio('Nada apuntado.')));
    },
    clicPagina: clicMarcar
  });

  // ---------- Calendario ----------
  function mesDe(off) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + (off || 0)); return d; }
  definir('calendario', {
    nombre: 'Calendario', pestanas: [{ id: 'mes', nombre: 'Mes' }, { id: 'agenda', nombre: 'Agenda' }],
    contexto: function (e) {
      var d = mesDe(e.mes);
      return '<p class="rot">Mes</p><p>' + may(MESES_LARGOS[d.getMonth()]) + ' ' + d.getFullYear() + '</p><p class="paso"><button type="button" class="enlace" data-mes="-1">anterior</button> / <button type="button" class="enlace" data-mes="0">hoy</button> / <button type="button" class="enlace" data-mes="1">siguiente</button></p>';
    },
    clicMargen: function (ev, e) {
      var b = ev.target.closest('[data-mes]'); if (!b) return;
      e.mes = b.dataset.mes === '0' ? 0 : (e.mes || 0) + (+b.dataset.mes); e.pagina = 0; ED.pintarApartado();
    },
    pintar: function (pagina, e) {
      var d = mesDe(e.mes), y = d.getFullYear(), m = d.getMonth();
      if (e.pestana === 'agenda') {
        var lista = [];
        for (var i = 0; i < 45; i++) { var f = sumar(iso(new Date(y, m, 1)) < hoy() && (e.mes || 0) === 0 ? hoy() : iso(new Date(y, m, 1)), i); delDia(f).forEach(function (x) { lista.push({ f: f, e: x }); }); }
        lista = buscar(lista, e, function (x) { return titulo(x.e) + ' ' + (x.e.place || ''); });
        var p = porPaginas(lista, e, 20);
        pagina.innerHTML = cab('Agenda', lista.length + ' cosas en las próximas seis semanas') + franja(bloque(12, '',
          lista.length ? '<table class="tabla"><thead><tr><th class="fecha-t">Día</th><th class="fecha-t">Hora</th><th>Qué</th><th class="cat">Dónde</th></tr></thead><tbody>' +
            p.trozo.map(function (x) { return '<tr><td class="fecha-t">' + esc(relativa(x.f)) + '</td><td class="fecha-t">' + esc(hora(x.e)) + '</td><td>' + esc(titulo(x.e)) + '</td><td class="cat">' + esc(x.e.place || '') + '</td></tr>'; }).join('') + '</tbody></table>' + p.pie
            : vacio('Nada en las próximas semanas.')), true);
        return;
      }
      var primero = (new Date(y, m, 1).getDay() + 6) % 7, diasMes = new Date(y, m + 1, 0).getDate();
      var celdas = '';
      for (var c = 0; c < primero; c++) celdas += '<div class="dia fuera"></div>';
      for (var dd = 1; dd <= diasMes; dd++) {
        var fi = iso(new Date(y, m, dd)), cosas = delDia(fi).filter(function (x) { return x.type !== 'work'; });
        celdas += '<div class="dia' + (fi === hoy() ? ' hoy' : '') + '"><span class="num-dia">' + dd + '</span>' +
          cosas.slice(0, 3).map(function (x) { return '<span class="cosa">' + (hora(x) ? '<b>' + esc(hora(x)) + '</b> ' : '') + esc(titulo(x)) + '</span>'; }).join('') +
          (cosas.length > 3 ? '<span class="cosa mas">y ' + (cosas.length - 3) + ' más</span>' : '') + '</div>';
      }
      pagina.innerHTML = cab(may(MESES_LARGOS[m]) + ' ' + y, 'El mes de un vistazo') +
        '<section class="franja crece"><div class="bloque" style="grid-column: span 12"><div class="mes-cab">' + DIAS_CORTOS.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div><div class="mes">' + celdas + '</div></div></section>';
    }
  });

  // ---------- Planificador ----------
  definir('planificador', {
    nombre: 'Planificador', pestanas: [{ id: '0', nombre: 'Hoy' }, { id: '1', nombre: 'Mañana' }, { id: '2', nombre: 'Pasado mañana' }, { id: 'pendientes', nombre: 'Sin día' }],
    contexto: function () {
      var t = tareasDe(0), h = t.filter(function (x) { return x.done; }).length;
      return '<p class="rot">Hoy</p><p>' + h + ' de ' + t.length + ' hechas</p><p class="paso">El día empieza a las 4:00. Lo que no marques pasa al siguiente.</p>';
    },
    pintar: function (pagina, e) {
      if (e.pestana === 'pendientes') {
        var bl = buscar((typeof dayPlanner !== 'undefined' && dayPlanner.backlog) || [], e, function (t) { return t.title || t.text || ''; });
        pagina.innerHTML = cab('Sin día', bl.length + (bl.length === 1 ? ' tarea' : ' tareas') + ' sin fecha') +
          franja(bloque(12, '', bl.length ? '<ul class="filas tareas columnas">' + bl.map(function (t) { return '<li class="tarea"><span class="texto-t">' + esc(t.title || t.text || '') + '</span></li>'; }).join('') + '</ul>' : vacio('No hay tareas sin día.')), true);
        return;
      }
      var off = +e.pestana || 0, f = sumar(hoy(), off), ta = buscar(tareasDe(off), e, function (t) { return t.title || ''; });
      var re = off === 0 ? recurrentesHoy() : [];
      var ev = delDia(f).filter(function (x) { return x.type !== 'work'; });
      pagina.innerHTML = cab(['Hoy', 'Mañana', 'Pasado mañana'][off], esc(may(fLarga(f)))) +
        franja(
          bloque(7, 'Tareas', ta.length || re.length ? '<ul class="filas tareas">' + ta.map(function (t) { return filaTarea(t, off); }).join('') + re.map(filaRecurrente).join('') + '</ul>' : vacio('Nada para este día. Usa apuntar para añadir.')) +
          bloque(5, 'Agenda del día', listaEventos(ev) || vacio('Sin citas.')), true);
    },
    clicPagina: clicMarcar
  });

  // ---------- Rutinas ----------
  definir('rutinas', {
    nombre: 'Rutinas', pestanas: [{ id: 'hoy', nombre: 'Hoy' }, { id: 'todas', nombre: 'Todas' }],
    contexto: function () { var r = rutinasDe(hoy()), h = r.filter(function (x) { return x.completadas && x.completadas[hoy()]; }).length; return '<p class="rot">Hoy</p><p>' + h + ' de ' + r.length + ' hechas</p>'; },
    pintar: function (pagina, e) {
      if (e.pestana === 'todas') {
        var semana = []; for (var i = 6; i >= 0; i--) semana.push(sumar(hoy(), -i));
        var lista = buscar(rutinas(), e, function (h) { return h.texto || ''; });
        pagina.innerHTML = cab('Rutinas', lista.length + ' rutinas, la última semana') + franja(bloque(12, '', lista.length ?
          '<table class="tabla"><thead><tr><th>Rutina</th>' + semana.map(function (f) { return '<th class="dia-t">' + DIAS_CORTOS[(new Date(f + 'T12:00:00').getDay() + 6) % 7] + '</th>'; }).join('') + '<th class="num cat">Racha</th></tr></thead><tbody>' +
          lista.map(function (h) {
            return '<tr><td>' + esc(h.texto || '') + '</td>' + semana.map(function (f) {
              var toca = intento(function () { return rutinaToca(h, f); }, true), hecha = h.completadas && h.completadas[f];
              return '<td class="dia-t"><span class="punto' + (hecha ? ' lleno' : '') + (toca ? '' : ' no') + '"></span></td>';
            }).join('') + '<td class="num cat">' + intento(function () { return habitStreak(h); }, 0) + '</td></tr>';
          }).join('') + '</tbody></table>' : vacio('Sin rutinas.')), true);
        return;
      }
      var por = {}; rutinasDe(hoy()).forEach(function (h) { var k = h.momento || 'cuando sea'; (por[k] = por[k] || []).push(h); });
      var claves = Object.keys(por);
      pagina.innerHTML = cab('Rutinas de hoy', esc(may(fLarga(hoy())))) +
        franja(claves.length ? claves.map(function (k) { return bloque(Math.max(3, Math.floor(12 / claves.length)), esc(may(k)), '<ul class="filas tareas">' + por[k].map(filaRutina).join('') + '</ul>'); }).join('') : bloque(12, '', vacio('Hoy no toca ninguna rutina.')), true);
    },
    clicPagina: clicMarcar
  });

  // ---------- Eventos ----------
  function eventos() { return (typeof entries !== 'undefined' ? entries : []).filter(function (x) { return x.type === 'event' && x.date; }); }
  definir('eventos', {
    nombre: 'Eventos', pestanas: [{ id: 'proximos', nombre: 'Próximos' }, { id: 'pasados', nombre: 'Pasados' }],
    pintar: function (pagina, e) {
      var pasados = e.pestana === 'pasados', h = hoy();
      var lista = eventos().filter(function (x) { return pasados ? x.date < h : x.date >= h; })
        .sort(function (a, b) { return pasados ? (b.date + hora(b)).localeCompare(a.date + hora(a)) : (a.date + hora(a)).localeCompare(b.date + hora(b)); });
      lista = buscar(lista, e, function (x) { return (x.title || '') + ' ' + (x.place || '') + ' ' + (x.eventType || ''); });
      var p = porPaginas(lista, e, 18);
      pagina.innerHTML = cab(pasados ? 'Eventos pasados' : 'Próximos eventos', lista.length + (lista.length === 1 ? ' evento' : ' eventos')) +
        franja(bloque(12, '', lista.length ? '<table class="tabla"><thead><tr><th class="fecha-t">Fecha</th><th class="fecha-t">Hora</th><th>Evento</th><th class="cat">Lugar</th><th class="cat">Tipo</th><th class="num fecha-t">Falta</th></tr></thead><tbody>' +
          p.trozo.map(function (x) { var n = dias(h, x.date); return '<tr><td class="fecha-t">' + fCorta(x.date) + '</td><td class="fecha-t">' + esc(hora(x)) + '</td><td>' + esc(x.title || '') + '</td><td class="cat">' + esc(x.place || '') + '</td><td class="cat">' + esc(may(x.eventType && x.eventType !== 'otro' ? x.eventType : '')) + '</td><td class="num fecha-t">' + (n === 0 ? 'hoy' : n > 0 ? n + ' d' : '') + '</td></tr>'; }).join('') +
          '</tbody></table>' + p.pie : vacio(pasados ? 'Sin eventos pasados.' : 'Sin eventos por venir.')), true);
    }
  });

  // ---------- Notas ----------
  function notas() { return (typeof notes !== 'undefined' && Array.isArray(notes) ? notes : []).slice().sort(function (a, b) { return String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')); }); }
  function textoNota(n) { return String(n.content || '').replace(/<[^>]+>/g, ' ').replace(/[#*_>`]/g, '').trim(); }
  definir('notas', {
    nombre: 'Notas', pestanas: [{ id: 'recientes', nombre: 'Recientes' }, { id: 'todas', nombre: 'Todas' }],
    pintar: function (pagina, e) {
      var lista = buscar(notas(), e, function (n) { return (n.title || '') + ' ' + textoNota(n); });
      if (e.pestana === 'todas') {
        var p = porPaginas(lista, e, 18);
        pagina.innerHTML = cab('Todas las notas', lista.length + ' notas') + franja(bloque(12, '', lista.length ? '<table class="tabla"><thead><tr><th class="fecha-t">Fecha</th><th class="cat">Título</th><th>Empieza</th></tr></thead><tbody>' +
          p.trozo.map(function (n) { var t = textoNota(n); return '<tr><td class="fecha-t">' + fCorta(n.date) + '</td><td class="cat">' + esc(n.title || t.split('\n')[0].slice(0, 40)) + '</td><td>' + esc(t.slice(0, 140)) + '</td></tr>'; }).join('') + '</tbody></table>' + p.pie : vacio('Sin notas.')), true);
        return;
      }
      var tres = lista.slice(0, 3);
      pagina.innerHTML = cab('Notas', 'Las últimas, como columnas de periódico') + franja(tres.length ? tres.map(function (n) {
        var t = textoNota(n);
        return bloque(4, fCorta(n.date) || '', '<h2 class="titular">' + esc(n.title || may(relativa(n.date || hoy()))) + '</h2><div class="texto-columna">' + esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>') + '</p></div>');
      }).join('') : bloque(12, '', vacio('Sin notas. Escribe «nota: …» en apuntar.')), true);
    }
  });

  // ---------- Objetivos ----------
  function objetivos() { return (typeof entries !== 'undefined' ? entries : []).filter(function (x) { return x.type === 'goal'; }); }
  function progresoObjetivo(g) {
    if (g.goalType === 'numeric' && Number(g.targetValue)) return Math.max(0, Math.min(100, Number(g.currentValue || 0) / Number(g.targetValue) * 100));
    var hs = g.milestones || [];
    if (hs.length) return hs.filter(function (m) { return m.done; }).length / hs.length * 100;
    return g.status === 'Completado' ? 100 : g.status === 'En progreso' ? 50 : 0;
  }
  definir('objetivos', {
    nombre: 'Objetivos', pestanas: [{ id: 'activos', nombre: 'En marcha' }, { id: 'hechos', nombre: 'Conseguidos' }],
    pintar: function (pagina, e) {
      var hechos = e.pestana === 'hechos';
      var lista = buscar(objetivos().filter(function (g) { return (g.status === 'Completado') === hechos; }), e, function (g) { return g.title || ''; });
      var plazos = [['short', 'Corto plazo'], ['medium', 'Medio plazo'], ['long', 'Largo plazo']];
      pagina.innerHTML = cab(hechos ? 'Objetivos conseguidos' : 'Objetivos', lista.length + (lista.length === 1 ? ' objetivo' : ' objetivos')) +
        franja(plazos.map(function (pl) {
          var de = lista.filter(function (g) { return (g.term || 'short') === pl[0]; });
          return bloque(4, pl[1], de.length ? de.map(function (g) {
            var pct = progresoObjetivo(g), hs = g.milestones || [];
            return '<article class="pieza"><h2 class="titular">' + esc(g.title || '') + '</h2>' +
              '<p class="nota-cifra">' + esc(g.status || 'Pendiente') + (g.goalType === 'numeric' && g.targetValue ? ', ' + (g.currentValue || 0) + ' de ' + g.targetValue + (g.unit ? ' ' + esc(g.unit) : '') : '') + ', ' + Math.round(pct) + ' %</p>' +
              '<div class="barra-sola"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
              (hs.length ? '<ul class="filas hitos">' + hs.slice(0, 5).map(function (m) { return '<li class="' + (m.done ? 'hecha' : '') + '"><span>' + esc(m.text) + '</span><span>' + (m.done ? 'hecho' : '') + '</span></li>'; }).join('') + '</ul>' : '') + '</article>';
          }).join('') : vacio('Nada.'));
        }).join(''), true);
    }
  });

  // ---------- Proyectos ----------
  function proyectos() { return (typeof entries !== 'undefined' ? entries : []).filter(function (x) { return x.type === 'project'; }); }
  definir('proyectos', {
    nombre: 'Proyectos', pestanas: [{ id: 'activos', nombre: 'En marcha' }, { id: 'cerrados', nombre: 'Cerrados' }],
    pintar: function (pagina, e) {
      var cerrados = e.pestana === 'cerrados';
      var lista = buscar(proyectos().filter(function (p) { var hecho = /complet|termin|hecho|cerrad/i.test(p.status || ''); return hecho === cerrados; }), e, function (p) { return p.title || ''; });
      pagina.innerHTML = cab(cerrados ? 'Proyectos cerrados' : 'Proyectos', lista.length + (lista.length === 1 ? ' proyecto' : ' proyectos')) +
        franja(bloque(12, '', lista.length ? '<table class="tabla"><thead><tr><th>Proyecto</th><th class="cat">Estado</th><th class="num cat">Avance</th><th>Siguiente paso</th><th class="fecha-t">Fecha</th></tr></thead><tbody>' +
          lista.map(function (p) {
            var pr = intento(function () { return proyectoProgreso(p); }, { total: 0, hechas: 0, pct: 0 }), sig = intento(function () { return proyectoSiguiente(p); }, null);
            return '<tr><td>' + esc(p.title || '') + '</td><td class="cat">' + esc(p.status || '') + '</td><td class="num cat">' + pr.hechas + ' de ' + pr.total + ' <span class="barra-mini"><i style="width:' + pr.pct + '%"></i></span></td><td>' + esc(sig ? (sig.titulo || sig.title || '') : '') + '</td><td class="fecha-t">' + fCorta(p.endDate) + '</td></tr>';
          }).join('') + '</tbody></table>' : vacio('Sin proyectos.')), true);
    }
  });

  // ---------- Estudios ----------
  function asignaturas() { var s = typeof studies !== 'undefined' && studies ? studies : {}; return intento(function () { return asignaturasEnCurso(); }, null) || s.subjects || []; }
  function entregas() {
    var out = [];
    asignaturas().forEach(function (s) {
      (s.exams || []).forEach(function (x) { out.push({ s: s, x: x, tipo: 'Examen' }); });
      (s.assignments || []).forEach(function (x) { out.push({ s: s, x: x, tipo: 'Entrega' }); });
    });
    return out.filter(function (o) { return o.x.date; }).sort(function (a, b) { return (a.x.date + (a.x.time || '')).localeCompare(b.x.date + (b.x.time || '')); });
  }
  definir('estudios', {
    nombre: 'Estudios', pestanas: [{ id: 'proximas', nombre: 'Lo que viene' }, { id: 'asignaturas', nombre: 'Asignaturas' }, { id: 'pasadas', nombre: 'Pasado' }],
    pintar: function (pagina, e) {
      var h = hoy();
      if (e.pestana === 'asignaturas') {
        var lista = buscar(asignaturas(), e, function (s) { return s.name || ''; });
        pagina.innerHTML = cab('Asignaturas', lista.length + ' asignaturas') + franja(lista.length ? lista.slice(0, 8).map(function (s) {
          var prox = entregas().filter(function (o) { return o.s === s && o.x.date >= h; }).slice(0, 4);
          var notas = (s.exams || []).concat(s.assignments || []).filter(function (x) { return x.grade != null && x.grade !== ''; });
          return bloque(3, esc(s.name || ''), (prox.length ? '<ul class="filas">' + prox.map(function (o) { return fila(esc(o.tipo + ': ' + (o.x.title || '')), fCorta(o.x.date)); }).join('') + '</ul>' : vacio('Nada por venir.')) +
            (notas.length ? '<p class="nota-cifra" style="margin-top:8px">Notas: ' + notas.map(function (x) { return esc(String(x.grade)); }).join(', ') + '</p>' : ''));
        }).join('') : bloque(12, '', vacio('Sin asignaturas.')), true);
        return;
      }
      var pasadas = e.pestana === 'pasadas';
      var l = buscar(entregas().filter(function (o) { return pasadas ? o.x.date < h : o.x.date >= h; }), e, function (o) { return (o.s.name || '') + ' ' + (o.x.title || ''); });
      if (pasadas) l.reverse();
      var p = porPaginas(l, e, 18);
      pagina.innerHTML = cab(pasadas ? 'Lo que ya pasó' : 'Exámenes y entregas', l.length + (l.length === 1 ? ' cosa' : ' cosas')) +
        franja(bloque(12, '', l.length ? '<table class="tabla"><thead><tr><th class="fecha-t">Fecha</th><th class="fecha-t">Hora</th><th class="cat">Qué</th><th class="cat">Asignatura</th><th>Título</th><th class="num fecha-t">' + (pasadas ? 'Nota' : 'Falta') + '</th></tr></thead><tbody>' +
          p.trozo.map(function (o) { var n = dias(h, o.x.date); return '<tr><td class="fecha-t">' + fCorta(o.x.date) + '</td><td class="fecha-t">' + esc(o.x.time || '') + '</td><td class="cat">' + o.tipo + '</td><td class="cat">' + esc(o.s.name || '') + '</td><td>' + esc(o.x.title || '') + (o.x.done || o.x.entregado ? marca('hecho') : '') + '</td><td class="num fecha-t">' + (pasadas ? esc(o.x.grade == null ? '' : String(o.x.grade)) : n === 0 ? 'hoy' : n + ' d') + '</td></tr>'; }).join('') +
          '</tbody></table>' + p.pie : vacio(pasadas ? 'Nada todavía.' : 'Nada por venir.')), true);
    }
  });

  // ---------- Viajes ----------
  function viajes() { return (typeof entries !== 'undefined' ? entries : []).filter(function (x) { return x.type === 'travel'; }); }
  definir('viajes', {
    nombre: 'Viajes', pestanas: [{ id: 'proximos', nombre: 'Próximos' }, { id: 'hechos', nombre: 'Hechos' }],
    pintar: function (pagina, e) {
      var h = hoy(), hechos = e.pestana === 'hechos';
      var lista = buscar(viajes().filter(function (v) { var fin = v.endDate || v.startDate || v.date || ''; return hechos ? fin < h : fin >= h; }), e, function (v) { return (v.title || '') + ' ' + (v.destination || ''); })
        .sort(function (a, b) { var x = (a.startDate || a.date || ''), y = (b.startDate || b.date || ''); return hechos ? y.localeCompare(x) : x.localeCompare(y); });
      var destacado = !hechos && lista[0];
      var resto = destacado ? lista.slice(1) : lista;
      function datos(v) {
        var ini = v.startDate || v.date, fin = v.endDate || ini, n = ini ? dias(h, ini) : null, dur = ini ? dias(ini, fin) + 1 : null;
        return { ini: ini, fin: fin, n: n, dur: dur };
      }
      var html = '';
      if (destacado) {
        var d = datos(destacado);
        html += franja(bloque(12, d.n <= 0 ? 'Ahora mismo' : 'El próximo', '<h2 class="titular grande">' + esc(destacado.destination || destacado.title || '') + '</h2>' +
          '<p class="nota-cifra">' + fCorta(d.ini) + (d.fin && d.fin !== d.ini ? ' a ' + fCorta(d.fin) : '') + (d.dur ? ', ' + d.dur + (d.dur === 1 ? ' día' : ' días') : '') + (d.n > 0 ? ', faltan ' + d.n + (d.n === 1 ? ' día' : ' días') : '') + '</p>'));
      }
      html += franja(bloque(12, destacado ? 'Después' : '', resto.length ? '<table class="tabla"><thead><tr><th>Destino</th><th class="fecha-t">Sale</th><th class="fecha-t">Vuelve</th><th class="num fecha-t">Días</th><th class="num fecha-t">' + (hechos ? '' : 'Falta') + '</th></tr></thead><tbody>' +
        resto.map(function (v) { var d = datos(v); return '<tr><td>' + esc(v.destination || v.title || '') + '</td><td class="fecha-t">' + fCorta(d.ini) + '</td><td class="fecha-t">' + fCorta(d.fin) + '</td><td class="num fecha-t">' + (d.dur || '') + '</td><td class="num fecha-t">' + (!hechos && d.n > 0 ? d.n + ' d' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : (destacado ? vacio('Nada más por ahora.') : vacio(hechos ? 'Sin viajes hechos.' : 'Sin viajes por venir.'))), true);
      pagina.innerHTML = cab(hechos ? 'Viajes hechos' : 'Viajes', lista.length + (lista.length === 1 ? ' viaje' : ' viajes')) + html;
    }
  });

  // ---------- Despensa ----------
  function compra() { return intento(function () { return datosCompra(); }, (typeof listaCompra !== 'undefined' && listaCompra) || { listas: [] }); }
  definir('despensa', {
    nombre: 'Despensa', pestanas: [{ id: 'lista', nombre: 'La lista' }, { id: 'compradas', nombre: 'Ya en casa' }],
    contexto: function (e) {
      var ls = compra().listas || [];
      return ls.length > 1 ? '<p class="rot">Lista</p>' + opciones('lista', e.lista || (ls[0] && ls[0].id), ls.map(function (l) { return [l.id, l.nombre || 'Lista']; })) : '';
    },
    pintar: function (pagina, e) {
      var ls = compra().listas || [], l = ls.find(function (x) { return x.id === e.lista; }) || ls[0];
      var items = buscar(((l && l.items) || []).filter(function (i) { return e.pestana === 'compradas' ? i.hecho : !i.hecho; }), e, function (i) { return i.texto || ''; });
      var por = {}; items.forEach(function (i) { var k = i.seccion || 'otros'; (por[k] = por[k] || []).push(i); });
      var secciones = Object.keys(por).sort();
      pagina.innerHTML = cab(e.pestana === 'compradas' ? 'Ya en casa' : 'La lista de la compra', items.length + (items.length === 1 ? ' cosa' : ' cosas') + (l && l.nombre ? ' en ' + esc(l.nombre) : '')) +
        franja(bloque(12, '', secciones.length ? '<div class="secciones">' + secciones.map(function (s) {
          return '<div class="seccion"><p class="rot">' + esc(may(s)) + '</p><ul class="filas">' + por[s].map(function (i) { return fila(esc(i.texto || ''), esc(i.cantidad || '')); }).join('') + '</ul></div>';
        }).join('') + '</div>' : vacio(e.pestana === 'compradas' ? 'Nada marcado.' : 'La lista está vacía. Escribe «comprar …» en apuntar.')), true);
    }
  });

  // ---------- Envíos ----------
  var PASOS = { pedido: 'Pedido', preparando: 'Preparando', enviado: 'Enviado', transito: 'En camino', reparto: 'En reparto', entregado: 'Entregado' };
  definir('envios', {
    nombre: 'Envíos', pestanas: [{ id: 'camino', nombre: 'En camino' }, { id: 'entregados', nombre: 'Entregados' }],
    pintar: function (pagina, e) {
      var todos = typeof pedidos !== 'undefined' && Array.isArray(pedidos) ? pedidos : [];
      var entregados = e.pestana === 'entregados';
      var lista = buscar(todos.filter(function (p) { return (p.estado === 'entregado') === entregados; }), e, function (p) { return (p.titulo || p.nombre || '') + ' ' + (p.tienda || ''); });
      pagina.innerHTML = cab(entregados ? 'Envíos entregados' : 'Envíos', lista.length + (lista.length === 1 ? ' pedido' : ' pedidos')) +
        franja(bloque(12, '', lista.length ? '<table class="tabla"><thead><tr><th>Pedido</th><th class="cat">Tienda</th><th class="cat">Estado</th><th class="fecha-t">' + (entregados ? 'Llegó' : 'Llega') + '</th></tr></thead><tbody>' +
          lista.map(function (p) { return '<tr><td>' + esc(p.titulo || p.nombre || 'Pedido') + '</td><td class="cat">' + esc(p.tienda || '') + '</td><td class="cat">' + esc(PASOS[p.estado] || may(p.estado || '')) + '</td><td class="fecha-t">' + fCorta(entregados ? p.fechaEntrega : p.fechaEstimada) + '</td></tr>'; }).join('') + '</tbody></table>' : vacio(entregados ? 'Nada entregado todavía.' : 'Nada en camino.')), true);
    }
  });

  // ---------- Ocio: portadas pequeñas en negro, con el título arriba y la imagen debajo ----------
  var OCIO = {
    libros: { tipo: 'book', nombre: 'Libros', grupos: [['Leyendo', 'Leyendo'], ['Completado', 'Leídos'], ['Abandonado', 'Abandonados']] },
    series: { tipo: 'series', nombre: 'Series', grupos: [['Viendo', 'Viendo'], ['Completada', 'Vistas'], ['Abandonada', 'Abandonadas']] },
    pelis: { tipo: 'movie', nombre: 'Películas', grupos: [['_todas', 'Vistas']] },
    juegos: { tipo: 'game', nombre: 'Videojuegos', grupos: [['Jugando', 'Jugando'], ['Completado', 'Terminados'], ['Abandonado', 'Abandonados']] }
  };
  function estadoOcio(x) { if (x.type === 'series' && x.endDate && x.status === 'Viendo') return 'Completada'; return x.status || ''; }
  function portada(x) {
    var fecha = x.endDate || x.date || x.startDate || '';
    var estrellas = Number(x.rating) ? ', ' + Number(x.rating) + '/5' : '';
    return '<figure class="portada">' +
      '<figcaption><span class="t">' + esc(x.title || '') + '</span><span class="m">' + esc(fecha ? fCorta(fecha) : '') + esc(estrellas) + '</span></figcaption>' +
      (x.portada ? '<img src="' + esc(x.portada) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<div class="sin-imagen"><span>' + esc((x.title || '?').slice(0, 1)) + '</span></div>') +
      '</figure>';
  }
  definir('ocio', {
    nombre: 'Ocio', pestanas: Object.keys(OCIO).map(function (k) { return { id: k, nombre: OCIO[k].nombre }; }),
    pintar: function (pagina, e) {
      var cfg = OCIO[e.pestana] || OCIO.libros;
      var todos = buscar((typeof entries !== 'undefined' ? entries : []).filter(function (x) { return x.type === cfg.tipo; }), e, function (x) { return (x.title || '') + ' ' + (x.author || '') + ' ' + (x.platform || ''); })
        .sort(function (a, b) { return String(b.endDate || b.startDate || b.date || '').localeCompare(String(a.endDate || a.startDate || a.date || '')); });
      var html = cfg.grupos.map(function (g) {
        var de = g[0] === '_todas' ? todos : todos.filter(function (x) { return estadoOcio(x) === g[0]; });
        if (!de.length && g[0] !== cfg.grupos[0][0]) return '';
        var p = porPaginas(de, e, 12);
        return franja(bloque(12, g[1] + ' <i class="marca">(' + de.length + ')</i>', de.length ? '<div class="portadas">' + (g === cfg.grupos[0] ? p.trozo : de.slice(0, 12)).map(portada).join('') + '</div>' + (g === cfg.grupos[0] ? p.pie : '') : vacio('Nada todavía. Escribe «' + ({ book: 'libro', series: 'serie', movie: 'peli', game: 'juego' })[cfg.tipo] + ' …» en apuntar.')), g === cfg.grupos[0]);
      }).join('');
      pagina.innerHTML = cab(cfg.nombre, todos.length + ' en total') + html;
    }
  });
})(window.ED);
