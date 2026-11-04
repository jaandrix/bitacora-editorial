// Portada, ajustes y paso entre la portada y los apartados.
window.ED = window.ED || {};
window.ED.apartados = window.ED.apartados || {};
(function (ED) {
  var $ = function (id) { return document.getElementById(id); };
  var raiz = document.documentElement;
  var reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var espera = function (ms) { return new Promise(function (ok) { setTimeout(ok, reducido ? Math.min(ms, 100) : ms); }); };

  var TONOS = [['cobalto', 'cobalto'], ['profundo', 'profundo'], ['coral', 'coral'], ['registro', 'registro'], ['bosque', 'bosque'], ['negativo', 'negativo']];
  ED.apartados = ED.apartados || {};
  ED.vista = 'acceso';
  var usuario = null;

  function guardarLocal(clave, valor) { try { localStorage.setItem('editorial.' + clave, JSON.stringify(valor)); } catch (e) {} }
  function leerLocal(clave) { try { return JSON.parse(localStorage.getItem('editorial.' + clave) || 'null'); } catch (e) { return null; } }

  // ---------- Tono ----------
  function ponerTono(t) {
    raiz.setAttribute('data-tono', t);
    document.querySelectorAll('.ed-tono').forEach(function (s) { s.value = t; });
    var tinta = getComputedStyle(raiz).getPropertyValue(ED.vista in ED.apartados ? '--papel-fuera' : '--tinta').trim();
    document.querySelector('meta[name="theme-color"]').content = tinta;
  }
  document.querySelectorAll('.ed-tono').forEach(function (s) {
    s.innerHTML = TONOS.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('');
    s.addEventListener('change', function () {
      ponerTono(s.value);
      if (usuario) ED.guardarPrefs({ tono: s.value }).catch(function () {});
    });
  });

  // ---------- Acceso ----------
  var acceso = $('ed-acceso'), error = $('ed-error'), aviso = $('ed-aviso'), otros = $('ed-otros');
  var cUsuario = $('ed-usuario'), cClave = $('ed-clave'), cClave2 = $('ed-clave2');
  var modo = 'entrar';
  var ENLACES = {
    entrar: [['crear', 'crear cuenta'], ['recuperar', 'recuperar contraseña']],
    crear: [['entrar', 'ya tengo cuenta']],
    recuperar: [['entrar', 'volver a entrar']]
  };
  function pintarModo(m) {
    modo = m;
    cClave.hidden = m === 'recuperar';
    cClave2.hidden = m !== 'crear';
    cClave.autocomplete = m === 'crear' ? 'new-password' : 'current-password';
    cClave.value = ''; cClave2.value = ''; error.textContent = ''; aviso.textContent = '';
    otros.innerHTML = '';
    ENLACES[m].forEach(function (e, i) {
      if (i) { var s = document.createElement('span'); s.className = 'sep'; s.textContent = '/'; otros.appendChild(s); }
      var b = document.createElement('button'); b.type = 'button'; b.textContent = e[1];
      b.addEventListener('click', function () { cambiarModo(e[0]); });
      otros.appendChild(b);
    });
  }
  async function cambiarModo(m) {
    acceso.classList.add('cambiando');
    await espera(160);
    pintarModo(m);
    acceso.classList.remove('cambiando');
    (cUsuario.value && m !== 'recuperar' ? cClave : cUsuario).focus();
  }
  function mensajeError(e) {
    var m = (e && e.message || '').toLowerCase();
    if (m.indexOf('invalid login') >= 0 || m.indexOf('invalid credentials') >= 0) return 'Usuario o contraseña incorrectos.';
    if (m.indexOf('email not confirmed') >= 0) return 'Falta confirmar el correo de esta cuenta.';
    if (m.indexOf('fetch') >= 0 || m.indexOf('network') >= 0) return 'Sin conexión con Bitácora. Prueba de nuevo.';
    return 'No se ha podido entrar. Prueba de nuevo.';
  }
  acceso.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (acceso.classList.contains('cargando')) return;
    var correo = cUsuario.value.trim(), clave = cClave.value;
    if (!correo) return cUsuario.focus();
    if (modo !== 'recuperar' && !clave) return cClave.focus();
    if (modo === 'crear' && !cClave2.value) return cClave2.focus();
    error.textContent = ''; aviso.textContent = '';
    acceso.classList.add('cargando');
    try {
      await ED.logica;
      if (modo === 'entrar') {
        var r = await sb.auth.signInWithPassword({ email: correo, password: clave });
        if (r.error) { error.textContent = mensajeError(r.error); cClave.select(); return; }
        await entrar(r.data.user, true);
      } else if (modo === 'crear') {
        // La misma comprobación que el alta de la app normal (revisarContrasena, en nucleo.js)
        var fallo = await revisarContrasena(clave);
        if (!fallo && clave !== cClave2.value) fallo = 'Las contraseñas no coinciden.';
        if (fallo) { error.textContent = fallo; cClave.focus(); return; }
        var a = await sb.auth.signUp({ email: correo, password: clave });
        if (a.error) { error.textContent = 'No se ha podido crear la cuenta: ' + a.error.message; return; }
        if (a.data.session) { await entrar(a.data.user, true); return; }
        cClave.value = ''; cClave2.value = '';
        aviso.textContent = 'Cuenta creada. Confírmala desde el correo que te hemos enviado y vuelve a entrar.';
      } else {
        // El enlace del correo abre appbitacora.es, que ya sabe poner la contraseña nueva
        var p = await sb.auth.resetPasswordForEmail(correo, { redirectTo: 'https://appbitacora.es/' });
        if (p.error) { error.textContent = 'No se ha podido enviar el enlace: ' + p.error.message; return; }
        aviso.textContent = 'Si la cuenta existe, te hemos enviado un enlace para elegir otra contraseña.';
      }
    } catch (e) {
      error.textContent = mensajeError(e);
    } finally {
      acceso.classList.remove('cargando');
    }
  });

  function verAcceso() {
    usuario = null;
    document.body.classList.remove('en-lamina');
    ED.vista = 'acceso';
    ponerTono('cobalto');
    ED.ponerFondoInicial();
    [$('ed-menu'), $('ed-ajustes-pliego'), $('ed-firma'), $('ed-esquina'), $('ed-lamina')].forEach(function (el) { el.hidden = true; });
    $('ed-menu').classList.remove('visible');
    $('ed-legal').hidden = false;
    acceso.hidden = false; acceso.classList.remove('saliendo', 'cargando');
    pintarModo('entrar');
    cUsuario.focus();
  }

  // ---------- Datos de la portada (con la lógica de Bitácora) ----------
  function fechaLarga() {
    var p = {};
    new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.weekday + ' ' + p.day + ' de ' + p.month + ' de ' + p.year;
  }
  function horaDe(e) { return e.time || e.startTime || ''; }
  function tituloDe(e) {
    if (e.type === 'work') return 'Trabajo' + (e.company ? ' en ' + e.company : '');
    if (e.type === 'birthday') return 'Cumpleaños de ' + e.title;
    return e.title || 'Sin título';
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function pintarDatos() {
    $('ed-fecha').textContent = fechaLarga();
    var hoy = todayISO();
    var delDia = [], tareas = [], enCamino = [];
    try { delDia = getDayAllEntries(hoy).filter(function (e) { return e.type !== 'work'; }); } catch (e) {}
    try { tareas = plannerItemsForOffset(0).filter(function (t) { return !t.done; }); } catch (e) {}
    try { enCamino = (typeof pedidos !== 'undefined' && Array.isArray(pedidos) ? pedidos : []).filter(function (p) { return p.estado !== 'entregado'; }); } catch (e) {}

    var partes = [];
    if (delDia.length) partes.push(plural(delDia.length, 'cita', 'citas'));
    if (tareas.length) partes.push(plural(tareas.length, 'tarea', 'tareas'));
    $('ed-hoy').textContent = partes.length ? partes.join(' / ') : 'Nada apuntado';

    var ahora = new Date(), hm = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
    var proximo = null, diaProximo = null;
    for (var i = 0; i < 21 && !proximo; i++) {
      var d = new Date(); d.setDate(d.getDate() + i);
      var iso = isoLocal(d), lista = [];
      try { lista = getDayAllEntries(iso); } catch (e) {}
      lista = lista.filter(function (e) { return e.type !== 'work' && horaDe(e) && (i > 0 || horaDe(e) >= hm); })
        .sort(function (a, b) { return horaDe(a).localeCompare(horaDe(b)); });
      if (lista.length) { proximo = lista[0]; diaProximo = i; }
    }
    if (proximo) {
      var cuando = diaProximo === 0 ? '' : diaProximo === 1 ? 'mañana ' : new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric' }).format(new Date(Date.now() + diaProximo * 864e5)) + ', ';
      $('ed-proximo').textContent = cuando + horaDe(proximo) + ' ' + tituloDe(proximo);
    } else {
      $('ed-proximo').textContent = 'Nada en las próximas semanas';
    }

    try { $('ed-saldo').textContent = financeMoney(financeProTotalBalance()); } catch (e) { $('ed-saldo').textContent = ''; }

    var n = { hoy: delDia.length, planificador: tareas.length, envios: enCamino.length, propuestas: ED.numPropuestas ? ED.numPropuestas() : 0 };
    document.querySelectorAll('[data-n]').forEach(function (el) { var v = n[el.dataset.n]; el.textContent = v ? '(' + v + ')' : ''; });
    pintarTiempo();
  }

  async function pintarTiempo() {
    var c = (typeof ciudadTiempo !== 'undefined' && ciudadTiempo) || CIUDAD_TIEMPO_DEFECTO;
    $('ed-ciudad').textContent = c.nombre;
    $('ed-ciudad-actual').textContent = c.nombre;
    var guardado = leerLocal('tiempo');
    var clave = c.lat.toFixed(3) + ',' + c.lon.toFixed(3);
    var poner = function (t) { $('ed-tiempo').textContent = Math.round(t.temp) + '°, ' + TIEMPO_TEXTO[tiempoTipo(t.code, t.esDia)]; };
    if (guardado && guardado.clave === clave) poner(guardado);
    if (guardado && guardado.clave === clave && Date.now() - guardado.hora < 30 * 60000) return;
    try {
      var r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon + '&current=temperature_2m,weather_code,is_day&timezone=auto');
      var j = await r.json();
      var t = { clave: clave, hora: Date.now(), temp: j.current.temperature_2m, code: j.current.weather_code, esDia: !!j.current.is_day };
      guardarLocal('tiempo', t); poner(t);
    } catch (e) { if (!guardado) $('ed-tiempo').textContent = 'sin conexión'; }
  }

  // ---------- Menú ----------
  function mostrarPortada() {
    $('ed-firma').hidden = false; $('ed-esquina').hidden = false; $('ed-legal').hidden = false;
    $('ed-paisaje').style.opacity = '';
  }
  async function verMenu(conTransicion) {
    ED.vista = 'menu';
    guardarLocal('ultimo', null);
    ponerTono(raiz.getAttribute('data-tono'));
    pintarDatos();
    if (ED.leerPropuestas) ED.leerPropuestas();
    var menu = $('ed-menu');
    $('ed-ajustes-pliego').hidden = true; $('ed-ajustes').setAttribute('aria-pressed', 'false');
    if (conTransicion && !acceso.hidden) { acceso.classList.add('saliendo'); await espera(240); }
    acceso.hidden = true;
    mostrarPortada();
    menu.hidden = false;
    menu.classList.remove('saliendo');
    requestAnimationFrame(function () { requestAnimationFrame(function () { menu.classList.add('visible'); }); });
  }
  ED.verMenu = verMenu;
  ED.verAjustes = function () { if (ED.vista === 'menu') verAjustes(); };

  async function entrar(u, conTransicion) {
    usuario = u;
    if (acceso.contains(document.activeElement)) document.activeElement.blur();
    var cache = leerLocal('prefs');
    if (cache && cache.tono) ponerTono(cache.tono);
    await ED.cargarDatos(u);
    if (ED.prefs.tono) ponerTono(ED.prefs.tono);
    guardarLocal('prefs', ED.prefs);
    ED.aplicarFondo();
    var ultimo = leerLocal('ultimo');
    if (ultimo && ED.apartados[ultimo.apartado]) {
      acceso.hidden = true;
      return abrirApartado(ultimo.apartado, ultimo.pestana, false);
    }
    await verMenu(conTransicion);
  }

  // Avisos impresos en la propia página, abajo, que se van solos (sustituyen al showToast de la app normal)
  var avisoTemporizador = null;
  ED.aviso = function (texto, esError) {
    var el = $('ed-nota');
    el.textContent = String(texto || '').replace(/\.$/, '') + '.';
    el.classList.toggle('error-linea', !!esError);
    el.classList.add('visible');
    clearTimeout(avisoTemporizador);
    avisoTemporizador = setTimeout(function () { el.classList.remove('visible'); }, esError ? 7000 : 4000);
  };

  ED.repintar = function () {
    if (ED.vista === 'menu') pintarDatos();
    else if (ED.apartados[ED.vista]) pintarApartado();
  };

  $('ed-salir').addEventListener('click', async function () {
    try { await sb.auth.signOut(); } catch (e) {}
    guardarLocal('ultimo', null);
    verAcceso();
  });

  // ---------- Ajustes ----------
  function pintarFondos() {
    var f = (ED.prefs && ED.prefs.fondo) || { tipo: 'serie', id: 'jinete' };
    var html = ED.FONDOS_SERIE.map(function (s) {
      var actual = f.tipo !== 'propio' && (f.id || 'jinete') === s.id;
      return '<li><button type="button" class="enlace' + (actual ? ' actual' : '') + '" data-fondo="' + s.id + '">' + esc(s.nombre) + '</button></li>';
    }).join('');
    if (ED.prefs && ED.prefs.fondoPropio) {
      html += '<li><button type="button" class="enlace' + (f.tipo === 'propio' ? ' actual' : '') + '" data-fondo="propio">Tu imagen</button></li>';
      html += '<li><button type="button" class="enlace" data-fondo="quitar">Quitar tu imagen</button></li>';
    }
    html += '<li><button type="button" class="enlace" data-fondo="subir">Subir una imagen</button></li>';
    $('ed-fondos').innerHTML = html;
  }
  $('ed-fondos').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-fondo]'); if (!b) return;
    var nota = $('ed-fondo-nota'), v = b.dataset.fondo;
    if (v === 'subir') return $('ed-fondo-archivo').click();
    try {
      if (v === 'propio') await ED.elegirFondo({ tipo: 'propio' });
      else if (v === 'quitar') await ED.quitarFondoPropio();
      else await ED.elegirFondo({ tipo: 'serie', id: v });
      guardarLocal('prefs', ED.prefs);
      pintarFondos();
    } catch (err) { nota.textContent = 'No se ha podido guardar: ' + (err.message || 'prueba de nuevo') + '.'; }
  });
  $('ed-fondo-archivo').addEventListener('change', async function () {
    var archivo = this.files && this.files[0]; this.value = '';
    if (!archivo) return;
    var nota = $('ed-fondo-nota');
    nota.textContent = 'Pasando la imagen a dos tintas...';
    try {
      await ED.subirFondo(archivo);
      guardarLocal('prefs', ED.prefs);
      nota.textContent = 'Fondo guardado en tu cuenta.';
      pintarFondos();
    } catch (err) { nota.textContent = err.message || 'No se ha podido subir la imagen.'; }
  });

  var buscaCiudad = null;
  $('ed-ciudad-buscar').addEventListener('input', function () {
    var q = this.value.trim(); clearTimeout(buscaCiudad);
    var lista = $('ed-ciudad-resultados');
    if (q.length < 2) { lista.innerHTML = ''; return; }
    buscaCiudad = setTimeout(async function () {
      try {
        var r = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=5&language=es&format=json');
        var j = await r.json();
        lista.innerHTML = (j.results || []).map(function (c, i) {
          return '<li><button type="button" class="enlace" data-i="' + i + '">' + esc([c.name, c.admin1, c.country].filter(Boolean).join(', ')) + '</button></li>';
        }).join('') || '<li class="nota">Sin resultados.</li>';
        lista.onclick = async function (e) {
          var b = e.target.closest('[data-i]'); if (!b) return;
          var c = j.results[+b.dataset.i];
          // La ciudad es la misma que usa la app normal (ciudadTiempo): cambiarla aquí la cambia allí.
          ciudadTiempo = { nombre: c.name, lat: c.latitude, lon: c.longitude };
          lista.innerHTML = ''; $('ed-ciudad-buscar').value = '';
          try { await ED.guardarClaves({ ciudadTiempo: ciudadTiempo }); } catch (err) {}
          pintarTiempo();
        };
      } catch (e) { lista.innerHTML = '<li class="nota">Sin conexión.</li>'; }
    }, 300);
  });

  async function verAjustes() {
    if (ED.vista === 'ajustes') return volverDeAjustes();
    ED.vista = 'ajustes';
    pintarFondos();
    $('ed-ajustes').setAttribute('aria-pressed', 'true');
    var menu = $('ed-menu'), aj = $('ed-ajustes-pliego');
    menu.classList.add('saliendo'); await espera(140);
    menu.hidden = true; menu.classList.remove('visible', 'saliendo');
    aj.hidden = false; aj.classList.remove('saliendo');
    requestAnimationFrame(function () { requestAnimationFrame(function () { aj.classList.add('visible'); }); });
  }
  async function volverDeAjustes() {
    var aj = $('ed-ajustes-pliego');
    aj.classList.add('saliendo'); await espera(140);
    aj.hidden = true; aj.classList.remove('visible', 'saliendo');
    verMenu(false);
  }
  $('ed-ajustes').addEventListener('click', verAjustes);
  $('ed-apuntar-btn').addEventListener('click', function () { ED.abrirApuntar(); });
  $('ed-ajustes-volver').addEventListener('click', volverDeAjustes);

  // ---------- Apartados ----------
  var estado = {};
  function margenHtml(ap) {
    var e = estado[ED.vista];
    return '' +
      '<button type="button" class="enlace firma" data-accion="indice" title="Volver al índice">Bitácora Editorial</button>' +
      '<button type="button" class="enlace indice" data-accion="indice"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M6.5 1.5 3 5l3.5 3.5"/></svg>Índice</button>' +
      '<button type="button" class="apuntar-margen" data-accion="apuntar">+ Apuntar <span>(espacio)</span></button>' +
      '<hr>' +
      '<p class="rot">' + esc(ap.nombre) + '</p>' +
      '<ul class="pestanas">' + ap.pestanas.map(function (p) {
        return '<li><button type="button" data-pestana="' + p.id + '"' + (p.id === e.pestana ? ' aria-current="page"' : '') + '>' + esc(p.nombre) + '</button></li>';
      }).join('') + '</ul>' +
      '<hr>' +
      '<label class="oculto" for="ed-buscar">Buscar en ' + esc(ap.nombre) + '</label>' +
      '<input class="buscar" id="ed-buscar" type="search" placeholder="buscar en ' + esc(ap.nombre.toLowerCase()) + '" value="' + esc(e.buscar || '') + '" autocomplete="off">' +
      '<hr>' +
      '<div class="contexto">' + (ap.contexto ? ap.contexto(e) : '') + '</div>' +
      (ap.acciones ? '<hr><div class="acciones-margen">' + ap.acciones(e) + '</div>' : '') +
      '<div class="pie-margen"><span>' + esc(ap.pie ? ap.pie(e) : '') + '</span><button type="button" class="plegar" data-accion="plegar">Plegar</button></div>';
  }
  function pintarApartado() {
    var ap = ED.apartados[ED.vista]; if (!ap) return;
    var e = estado[ED.vista];
    var margen = $('ed-margen');
    var enfocado = document.activeElement && document.activeElement.id === 'ed-buscar';
    margen.innerHTML = margenHtml(ap);
    if (enfocado) { var b = $('ed-buscar'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    ap.pintar($('ed-pagina'), e);
  }
  ED.pintarApartado = pintarApartado;

  async function abrirApartado(id, pestana, conTransicion) {
    var ap = ED.apartados[id]; if (!ap) return;
    estado[id] = Object.assign({ pestana: ap.pestanas[0].id, pagina: 0, buscar: '' }, estado[id] || {}, pestana ? { pestana: pestana } : {});
    var menu = $('ed-menu');
    if (conTransicion !== false && !menu.hidden) { menu.classList.add('saliendo'); await espera(140); }
    menu.hidden = true; menu.classList.remove('visible', 'saliendo');
    $('ed-ajustes-pliego').hidden = true;
    ED.vista = id;
    guardarLocal('ultimo', { apartado: id, pestana: estado[id].pestana });
    var lam = $('ed-lamina');
    lam.classList.toggle('plegada', !!leerLocal('plegada'));
    pintarApartado();
    lam.hidden = false;
    document.body.classList.add('en-lamina');
    if (ap.alAbrir) ap.alAbrir(estado[id]);
    ponerTono(raiz.getAttribute('data-tono'));
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      lam.classList.add('visible');
      setTimeout(function () { ['ed-firma', 'ed-esquina', 'ed-legal'].forEach(function (i) { $(i).hidden = true; }); $('ed-pagina').focus({ preventScroll: true }); }, reducido ? 100 : 220);
    }); });
  }
  ED.abrirApartado = abrirApartado;

  // Volver al índice: la lámina se desvanece y el índice reaparece de una vez, sin escalonar las columnas.
  async function volverAlIndice() {
    var lam = $('ed-lamina');
    mostrarPortada();
    lam.classList.remove('visible');
    await espera(180);
    lam.hidden = true;
    document.body.classList.remove('en-lamina');
    var menu = $('ed-menu');
    menu.classList.add('directo');
    await verMenu(false);
    setTimeout(function () { menu.classList.remove('directo'); }, 400);
  }
  ED.volverAlIndice = volverAlIndice;

  $('ed-margen').addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-accion]'), p = ev.target.closest('[data-pestana]');
    if (a && a.dataset.accion === 'indice') return volverAlIndice();
    if (a && a.dataset.accion === 'apuntar') return ED.abrirApuntar();
    if (a && a.dataset.accion === 'plegar') {
      var lam = $('ed-lamina'); lam.classList.toggle('plegada');
      guardarLocal('plegada', lam.classList.contains('plegada'));
      return;
    }
    if (p) return cambiarPestana(p.dataset.pestana);
    var ap = ED.apartados[ED.vista];
    if (ap && ap.clicMargen) ap.clicMargen(ev, estado[ED.vista]);
  });
  $('ed-margen').addEventListener('input', function (ev) {
    if (ev.target.id !== 'ed-buscar') return;
    var e = estado[ED.vista]; e.buscar = ev.target.value; e.pagina = 0;
    ED.apartados[ED.vista].pintar($('ed-pagina'), e);
  });
  $('ed-pagina').addEventListener('click', function (ev) {
    var ap = ED.apartados[ED.vista];
    if (ap && ap.clicPagina) ap.clicPagina(ev, estado[ED.vista]);
  });

  async function cambiarPestana(id) {
    var e = estado[ED.vista]; if (e.pestana === id) return;
    var pag = $('ed-pagina');
    pag.classList.add('cambiando'); await espera(120);
    e.pestana = id; e.pagina = 0;
    guardarLocal('ultimo', { apartado: ED.vista, pestana: id });
    pintarApartado();
    pag.classList.remove('cambiando');
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-apartado]'); if (!a) return;
    ev.preventDefault();
    abrirApartado(a.dataset.apartado);
  });

  document.addEventListener('keydown', function (ev) {
    var activo = document.activeElement || {};
    var enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName || '') && activo.offsetParent !== null;
    if (ev.key === 'Escape') {
      if (enCampo && document.activeElement.value) return;
      if (ED.apartados[ED.vista]) { ev.preventDefault(); volverAlIndice(); }
      else if (ED.vista === 'ajustes') { ev.preventDefault(); volverDeAjustes(); }
      return;
    }
    if (enCampo || ED.capaAbierta()) return;
    if (ED.vista !== 'acceso' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (ev.key === ' ' && ED.vista !== 'ajustes') { ev.preventDefault(); return ED.abrirApuntar(); }
      if (ev.key === 'Enter' && !(document.activeElement && /^(BUTTON|A)$/.test(document.activeElement.tagName))) { ev.preventDefault(); return ED.abrirIr(); }
    }
    var ap = ED.apartados[ED.vista];
    if (ap && ap.tecla && ap.tecla(ev, estado[ED.vista])) ev.preventDefault();
  });

  // ---------- Arranque ----------
  ponerTono('cobalto');
  ED.ponerFondoInicial();
  (async function () {
    // Sin sesión guardada, las casillas salen ya, sin esperar a que llegue la lógica de Bitácora.
    var guardada = false;
    try { guardada = Object.keys(localStorage).some(function (k) { return /^sb-.*-auth-token$/.test(k); }); } catch (e) {}
    if (!guardada) return verAcceso();
    try {
      await ED.logica;
      var s = (await sb.auth.getSession()).data.session;
      if (s) return entrar(s.user, false);
    } catch (e) {}
    verAcceso();
  })();
})(window.ED);

// Sin conexión: el service worker guarda la página y la lógica de Bitácora (los datos los guarda loadData)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
