// La edición editorial no reescribe la lógica de Bitácora: carga sus mismos archivos desde appbitacora.es, con la
// versión que esté publicada, y solo pone su propio diseño. Así un arreglo vale para las dos y los datos se leen,
// se funden y se guardan exactamente igual. Los archivos se cargan después de DOMContentLoaded, de modo que el
// arranque de la app normal (nucleo.js) no llega a ejecutarse: solo quedan sus funciones y su estado.
window.ED = window.ED || {};
window.ED.apartados = window.ED.apartados || {};
(function (ED) {
  var ORIGEN = 'https://appbitacora.es/';
  var VERSION_RESERVA = '20261019-179';
  var ARCHIVOS = ['nucleo', 'datos', 'interfaz', 'planificador', 'entradas', 'calendario', 'resumen', 'ocio', 'viajes',
    'trabajo-estudios', 'agenda-laboral', 'enlaces-proyectos', 'eventos', 'ajustes', 'notas-objetivos', 'finanzas',
    'finanzas-pro', 'presupuesto', 'suscripciones', 'documentos', 'vault', 'conector', 'compra', 'proyecto', 'apuntar',
    'universidad', 'servicios', 'asistente'];

  async function versionPublicada() {
    try {
      var html = await (await fetch(ORIGEN + 'index.html', { cache: 'no-store' })).text();
      var m = html.match(/js\/nucleo\.js\?v=([\w.-]+)/);
      if (m) { try { localStorage.setItem('editorial.logica', m[1]); } catch (e) {} return m[1]; }
    } catch (e) {}
    try { return localStorage.getItem('editorial.logica') || VERSION_RESERVA; } catch (e) { return VERSION_RESERVA; }
  }

  function cargarScript(src) {
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = ok; s.onerror = function () { mal(new Error('No carga ' + src)); };
      document.head.appendChild(s);
    });
  }

  // Lo que en la app normal pinta su propia pantalla, aquí no tiene dónde: se apaga o se desvía a la edición.
  function neutralizar() {
    window.updatePageTitle = function () {};
    // Los fallos de la edición no deben contarse como fallos de la app normal en su estadística.
    window.contarFallo = function () {};
    window.contarApartado = function () {};
    window.render = function () { if (ED.repintar) ED.repintar(); };
    window.renderMobileShell = function () {};
    window.showToast = function (texto, esError) { if (ED.aviso) ED.aviso(texto, esError); };
    window.closeModal = function () {};
    window.renderAllNavs = function () {};
    window.refrescarBandeja = function () { if (ED.repintar) ED.repintar(); };
  }

  ED.logica = (async function () {
    var v = await versionPublicada();
    await Promise.all(ARCHIVOS.map(function (a) { return cargarScript(ORIGEN + 'js/' + a + '.js?v=' + v); }));
    neutralizar();
    return true;
  })();

  // Carga los datos de la cuenta con loadData, la misma función de la app normal (con su copia sin conexión).
  ED.cargarDatos = async function (usuario) {
    await ED.logica;
    await window.loadData();
    // loadData solo guarda las claves que conoce la app normal: la de la edición se pide aparte (y sin red, la última
    // copia del navegador).
    var prefs = null;
    try {
      var r = await sb.from('bitacora').select('data->editorial').eq('user_id', usuario.id).maybeSingle();
      if (!r.error) prefs = (r.data && (r.data.editorial || (r.data.data && r.data.data.editorial))) || {};
    } catch (e) {}
    if (!prefs) { try { prefs = JSON.parse(localStorage.getItem('editorial.prefs') || 'null'); } catch (e) {} }
    ED.prefs = Object.assign({}, prefs || {});
    return true;
  };

  // Guarda una parte de los datos de la cuenta con la función de fusión del servidor (solo las claves que se pasan).
  ED.guardarClaves = async function (parche) {
    await ED.logica;
    var r = await sb.rpc('merge_bitacora_data', { p_patch: parche });
    if (r.error) throw r.error;
    // La base de la fusión a tres bandas solo lleva claves de la app normal (como ciudadTiempo): así un guardado
    // posterior no cree que ese cambio está por enviar.
    if (typeof datosBase !== 'undefined' && datosBase) Object.keys(parche).forEach(function (k) { if (k !== 'editorial') datosBase[k] = parche[k]; });
  };

  ED.guardarPrefs = async function (cambios) {
    ED.prefs = Object.assign({}, ED.prefs || {}, cambios);
    try { localStorage.setItem('editorial.prefs', JSON.stringify(ED.prefs)); } catch (e) {}
    await ED.guardarClaves({ editorial: ED.prefs });
  };
})(window.ED);
