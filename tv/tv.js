/* Villa Rudolf na TV — průvodce pro hosty ovládaný šipkami ovladače.
   Běží ve WebView aplikace cz.villarudolf.tv (ta načte villarudolf.com/tv/, bez internetu
   svou zabalenou kopii) a stejně tak v běžném prohlížeči (šipky + Enter + Esc).
   Výlety a počasí: villa-rudolf-portal (jediný zdroj pravdy), záložně data/ vedle stránky.
   Žádná data hostů — jazyk přijde jen jako ?lang=cs|de|en|pl. */
(function () {
  'use strict';

  var VERZE = '2026-09-28b';
  var PORTAL = 'https://pavelkubiznak.github.io/villa-rudolf-portal/data/';
  var WEB = 'https://villarudolf.com/';
  /* Odkaz na aplikaci pro hosty z jiného repa — dokud je null, dlaždice se neukáže. */
  var APP_URL = null;
  var LANGS = ['cs', 'de', 'en', 'pl'];
  var SEKCE = ['home', 'dum', 'sauna', 'bazen', 'vylety', 'pocasi', 'okoli', 'mobil'];
  var NECINNOST_MS = 10 * 60 * 1000;   // po 10 min bez ovladače zpět na úvod (další host)

  var TX = window.VR_TEXTY, OK = window.VR_OKOLI;
  var qs = new URLSearchParams(location.search);
  var S = { lang: pickLang(), sec: 'home', filtr: 'vse', trips: null, food: null, fc: null, offline: false, lastMain: null };
  var $ = function (id) { return document.getElementById(id); };
  var T = function () { return TX[S.lang]; };

  function pickLang() {
    var q = (qs.get('lang') || '').toLowerCase();
    if (LANGS.indexOf(q) >= 0) return q;
    try { var s = localStorage.getItem('vrLang'); if (LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    var n = (navigator.language || 'cs').slice(0, 2).toLowerCase();
    return LANGS.indexOf(n) >= 0 ? n : 'cs';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loc(v) { return v == null ? '' : (typeof v === 'string' ? v : (v[S.lang] || v.en || v.cs || '')); }

  /* ---------------- ikony (čárové, 24×24) ---------------- */
  var P = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    dum: '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-5h6v5"/><path d="M9 11h2M13 11h2"/>',
    sauna: '<path d="M12 3c2 3-1 4 0 7M8 5c1.5 2.5-1 3.5 0 6M16 5c1.5 2.5-1 3.5 0 6"/><path d="M4 15h16v5H4z"/><path d="M4 17.5h16"/>',
    bazen: '<path d="M2 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M2 20c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M8 13V5a2 2 0 0 1 4 0M16 13V5a2 2 0 0 0-4 0"/><path d="M8 8h8"/>',
    vylety: '<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M8.5 9l1.5 2 1-1"/>',
    pocasi: '<circle cx="9" cy="9" r="3.5"/><path d="M9 2v1.5M2 9h1.5M4 4l1 1M14 4l-1 1"/><path d="M8 20h9a4 4 0 0 0 0-8 5 5 0 0 0-9.5 1.5A3.3 3.3 0 0 0 8 20z"/>',
    okoli: '<path d="M4 6h2l2 10h10l2-7H7"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
    mobil: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    thermo: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 11v6"/>',
    kitchen: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18"/><path d="M17 21V3c-2 0-3 3-3 7h3"/>',
    wash: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M7.5 6.5h2"/>',
    ski: '<path d="M4 20l16-6"/><path d="M8 4l4 12M12 4l4 12"/>',
    grill: '<path d="M4 9h16a8 8 0 0 1-16 0z"/><path d="M8 17l-2 4M16 17l2 4"/><path d="M9 3c1 1.5-1 2 0 3.5M13 3c1 1.5-1 2 0 3.5"/>',
    fire: '<path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2.5 1.5-4 3-5 0 2 1 3 2 3 0-3-1-5 1-8z"/><path d="M5 21h14"/>',
    kids: '<circle cx="12" cy="5" r="2.2"/><path d="M12 8v7M8 11h8M9.5 21l2.5-6 2.5 6"/>',
    car: '<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 12h16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
    bus: '<rect x="5" y="3" width="14" height="15" rx="2.5"/><path d="M5 11h14"/><path d="M8 18v2.5M16 18v2.5"/><circle cx="8.5" cy="14.5" r=".8"/><circle cx="15.5" cy="14.5" r=".8"/>',
    hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.5L8 14"/>',
    nosmoke: '<path d="M3 15h13v3H3z"/><path d="M19 15v3M17 8c0-2 2-2 2-4"/><path d="M3 3l18 18"/>',
    power: '<path d="M12 3v8"/><path d="M6.5 7a7.5 7.5 0 1 0 11 0"/>',
    shower: '<path d="M5 21V7a4 4 0 0 1 8 0"/><path d="M10 10h6"/><path d="M11 13v1M13 14v1M15 13v1M12 17v1M14 18v1"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4M10 2h4"/>',
    water: '<path d="M12 3c3.5 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-11z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    cloud: '<path d="M7 19h10a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 2A3.6 3.6 0 0 0 7 19z"/>',
    rain: '<path d="M7 15h10a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 2A3.6 3.6 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    snow: '<path d="M7 14h10a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 2A3.6 3.6 0 0 0 7 14z"/><path d="M8 18h.01M12 20h.01M16 18h.01M10 22h.01M14 22h.01"/>',
    storm: '<path d="M7 15h10a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 2A3.6 3.6 0 0 0 7 15z"/><path d="M12 15l-2 4h4l-2 4"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5 11v10h14V11"/>',
    cart: '<path d="M4 6h2l2 10h10l2-7H7"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
    pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10"/><path d="M14 8l3 2v8a1.5 1.5 0 0 0 3 0V9l-3-3"/>'
  };
  function ico(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || P.home) + '</svg>'; }

  /* ---------------- datum, sezona, počasí ---------------- */
  function dnes() { return new Date(); }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function datumText(d, kratce) {
    var t = T(), den = kratce ? t.dnyK[d.getDay()] : t.dny[d.getDay()];
    if (S.lang === 'en') return den + ' ' + d.getDate() + (kratce ? '' : ' ' + t.mesice[d.getMonth()]);
    if (S.lang === 'de') return den + (kratce ? ' ' : ', ') + d.getDate() + '.' + (kratce ? '' : ' ' + t.mesice[d.getMonth()]);
    return den + ' ' + d.getDate() + '.' + (kratce ? '' : ' ' + t.mesice[d.getMonth()]);
  }
  /* Hranice sezón jako na webu (assets/season.js): zima 15. 10. – 31. 3. */
  function zima(d) { var m = d.getMonth() + 1, x = d.getDate(); return m >= 11 || m <= 3 || (m === 10 && x >= 15); }
  function sezonaOk(t) { var s = t.seasons; return !s || !s.length || s.indexOf(zima(dnes()) ? 'winter' : 'summer') >= 0; }
  function bazenSezona(d) { var m = d.getMonth() + 1; return m >= 5 && m <= 9; }
  function wxDen(d) { var v = S.fc && S.fc.byLocation && S.fc.byLocation.villa; return v && v.daily ? v.daily[iso(d)] : null; }
  function wxIco(c) { return { clear: 'sun', fair: 'pocasi', partly: 'pocasi', cloudy: 'cloud', fog: 'cloud', showers: 'rain', rain: 'rain', snow: 'snow', sleet: 'snow', thunder: 'storm' }[c] || 'cloud'; }
  function wxText(w) { return T().wx[w.thunder ? 'thunder' : w.cat] || w.cat || ''; }

  /* ---------------- výlety ---------------- */
  var FILTRY = {
    vse: function () { return true; },
    deti: function (t) { return t.category === 'kids' || t.category === 'animals' || (t.minAge <= 4 && t.effort === 'easy'); },
    dest: function (t) { return t.rainOk || t.indoorOrCovered; },
    pesky: function (t) { return t.byFoot; },
    vyhledy: function (t) { return t.category === 'viewpoint' || t.category === 'walk'; },
    kultura: function (t) { return t.category === 'culture'; },
    voda: function (t) { return t.category === 'water'; },
    adrenalin: function (t) { return t.category === 'adrenalin'; }
  };
  function vylety() { return (S.trips || []).filter(sezonaOk).sort(function (a, b) { return (a.byFoot ? 0 : a.travelMin || 60) - (b.byFoot ? 0 : b.travelMin || 60); }); }
  function cesta(t) { return t.byFoot ? T().pesky : (t.travelMin + ' ' + T().autem); }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  /* Tipy na dnešek podle předpovědi; mění se každý den, ne při každém otevření. */
  function tipyDnes() {
    var w = wxDen(dnes()), mokro = w && (w.precip >= 2 || ['rain', 'showers', 'thunder', 'sleet'].indexOf(w.cat) >= 0 || w.thunder);
    var hezky = w && !mokro && ['clear', 'fair', 'partly'].indexOf(w.cat) >= 0, den = iso(dnes());
    var sc = vylety().map(function (t) {
      var s = (hash(den + t.id) % 100) / 60;
      if (mokro) s += (t.rainOk || t.indoorOrCovered) ? 4 : (t.outdoor ? -4 : 0);
      if (hezky) s += (t.outdoor ? 2 : 0) + (t.needsClearLowWind && w.windKmh < 30 ? 1.5 : 0) + (t.category === 'water' && w.max >= 24 ? 2 : 0);
      if (t.category === 'water' && w && w.max < 20) s -= 4;
      s += t.byFoot ? 1 : (t.travelMin <= 20 ? .6 : (t.travelMin > 45 ? -1 : 0));
      return { t: t, s: s };
    }).sort(function (a, b) { return b.s - a.s; });
    var out = [], kat = {}, mista = {};
    sc.forEach(function (x) {
      var m = x.t.id.split('-')[0];   // snezka-cablecar a snezka-pec… = stejné místo, stačí jednou
      if (out.length < 3 && !kat[x.t.category] && !mista[m]) { out.push(x.t); kat[x.t.category] = 1; mista[m] = 1; }
    });
    return out;
  }
  function tripKarta(t) {
    return '<button class="f trip" data-trip="' + esc(t.id) + '" style="--acc:' + esc(t.accent || '#E9B949') + '"><b>' + esc(loc(t.name)) +
      '</b><span>' + esc(loc(t.tagline)) + '</span><i>' + esc(cesta(t)) + '</i></button>';
  }

  /* ---------------- QR ---------------- */
  function qrSvg(url) {
    try { var q = qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
    catch (e) { return ''; }
  }

  /* ---------------- sekce ---------------- */
  function karty(list) {
    return '<div class="karty">' + list.filter(function (k) { return k[2]; }).map(function (k) {
      return '<button class="f karta">' + ico(k[0]) + '<b>' + esc(k[1]) + '</b><p>' + esc(k[2]) + '</p></button>';
    }).join('') + '</div>';
  }
  function bazenStav() {
    var t = T(), d = dnes(), h = d.getHours();
    if (!bazenSezona(d)) return [t.bazenMimo, t.bazenMimoV];
    return h >= 6 && h < 22 ? [t.menu.bazen, t.bazenOtevreno] : [t.menu.bazen, t.bazenRano];
  }

  var R = {
    home: function (t) {
      var w = wxDen(dnes()), b = bazenStav(), tipy = S.trips ? tipyDnes() : [];
      var wx = w ? '<div class="wxnow"><small>' + esc(t.dnes) + ' · ' + esc(datumText(dnes(), true)) + '</small><div class="t">' + ico(wxIco(w.cat)) +
        '<strong>' + Math.round(w.max) + '°</strong></div><p>' + esc(wxText(w)) + ' · ' + Math.round(w.min) + '–' + Math.round(w.max) + ' °C</p></div>' : '';
      return '<div class="hero"><div><h1>' + esc(t.vitejte) + '</h1><p class="sub">' + esc(t.vitejteSub) + '</p></div>' + wx + '</div>' +
        '<div class="rychle">' +
        '<button class="f" data-go="sauna">' + ico('sauna') + '<b>' + esc(t.menu.sauna) + '</b><span>' + esc(t.saunaKratce) + '</span></button>' +
        '<button class="f" data-go="bazen">' + ico('bazen') + '<b>' + esc(b[0]) + '</b><span>' + esc(b[1]) + '</span></button>' +
        '<button class="f" data-go="dum">' + ico('clock') + '<b>' + esc(t.odjezd) + '</b><span>' + esc(t.odjezdV) + '</span></button>' +
        '<button class="f" data-go="dum">' + ico('moon') + '<b>' + esc(t.klid) + '</b><span>' + esc(t.klidV) + '</span></button>' +
        '</div>' +
        (tipy.length ? '<h2>' + esc(t.dnesSeHodi) + '</h2><div class="grid">' + tipy.map(tripKarta).join('') + '</div>' : '');
    },
    dum: function (t) { return '<h1>' + esc(t.menu.dum) + '</h1><p class="sub">Villa Rudolf · Luční 519, Svoboda nad Úpou</p>' + karty(t.dum); },
    sauna: function (t) {
      /* první dvě karty jsou fakta (zapnutí, nahřátí), zbytek doporučení */
      return '<h1>' + esc(t.saunaTitul) + '</h1><p class="sub">' + esc(t.saunaUvod) + '</p>' + karty(t.sauna.slice(0, 2)) +
        '<h2>' + esc(t.doporuceni) + '</h2>' + karty(t.sauna.slice(2));
    },
    bazen: function (t) {
      var mimo = !bazenSezona(dnes());
      return '<h1>' + esc(t.bazenTitul) + '</h1><p class="sub">' + esc(mimo ? t.bazenMimoText : t.bazenUvod) + '</p>' + karty(t.bazen);
    },
    vylety: function (t) {
      if (!S.trips) return '<h1>' + esc(t.vyletyTitul) + '</h1><p class="sub">…</p>';
      var all = vylety(), list = all.filter(FILTRY[S.filtr]);
      var chips = Object.keys(FILTRY).filter(function (k) { return k === 'vse' || all.some(FILTRY[k]); }).map(function (k) {
        return '<button class="f chip' + (k === S.filtr ? ' on' : '') + '" data-filtr="' + k + '">' + esc(t.filtry[k]) + '</button>';
      }).join('');
      return '<h1>' + esc(t.vyletyTitul) + '</h1><p class="sub">' + esc(t.vyletySub.replace('{n}', all.length)) + '</p>' +
        '<div class="chips">' + chips + '</div>' +
        (list.length ? '<div class="grid">' + list.map(tripKarta).join('') + '</div>' : '<p class="prazdno">' + esc(t.zadneVylety) + '</p>');
    },
    pocasi: function (t) {
      var dny = [];
      for (var i = 0; i < 7; i++) { var d = dnes(); d.setDate(d.getDate() + i); var w = wxDen(d); if (w) dny.push([d, w]); }
      if (!dny.length) return '<h1>' + esc(t.pocasiTitul) + '</h1><p class="sub">' + esc(t.pocasiNic) + '</p>';
      return '<h1>' + esc(t.pocasiTitul) + '</h1><p class="sub">' + esc(t.pocasiSub) + '</p><div class="dnyp">' + dny.map(function (x, i) {
        var w = x[1];
        return '<button class="f den"><small>' + esc(i === 0 ? t.dnes : datumText(x[0], true)) + '</small>' + ico(wxIco(w.cat)) +
          '<strong>' + Math.round(w.max) + '°<em>' + Math.round(w.min) + '°</em></strong><p>' + esc(wxText(w)) + '<br>' +
          (w.precip ? esc(t.srazky) + ' ' + String(w.precip).replace('.', S.lang === 'en' ? '.' : ',') + ' mm<br>' : '') +
          esc(t.vitr) + ' ' + Math.round(w.windKmh) + ' km/h</p></button>';
      }).join('') + '</div>' + (S.trips ? '<h2>' + esc(t.dnesSeHodi) + '</h2><div class="grid">' + tipyDnes().map(tripKarta).join('') + '</div>' : '');
    },
    okoli: function (t) {
      function mista(l) {
        return '<div class="karty">' + l.map(function (m) {
          return '<button class="f misto">' + ico(m.ico) + '<b>' + esc(m.n) + '</b><span class="d">' + esc(t[m.d]) + '</span><span>' + esc(m.a) + '</span>' +
            (m.h ? '<p>' + esc(t[m.h]) + (m.p ? ' · ' + esc(t[m.p]) : '') + '</p>' : '') + '</button>';
        }).join('') + '</div>';
      }
      return '<h1>' + esc(t.okoliTitul) + '</h1>' +
        '<h2>' + esc(t.zdravi) + '</h2><button class="f s112"><strong>112</strong><div><b>' + esc(t.t112) + '</b><p>' + esc(t.v112) + '</p></div></button>' +
        '<div style="height:.9rem"></div>' + mista(OK.zdravi) +
        '<h2>' + esc(t.nakupy) + '</h2>' + mista(OK.nakupy) +
        '<h2>' + esc(t.sluzby) + '</h2>' + mista(OK.sluzby) + '<p class="pozn">' + esc(t.overit) + '</p>';
    },
    mobil: function (t) {
      var q = [[WEB + 'vylety/?lang=' + S.lang, t.qrPlanovac, t.qrPlanovacSub], [WEB + 'info/?lang=' + S.lang, t.qrInfo, t.qrInfoSub]];
      if (APP_URL) q.unshift([APP_URL, t.qrApp, t.qrAppSub]);
      return '<h1>' + esc(t.mobilTitul) + '</h1><p class="sub">' + esc(t.mobilSub) + '</p><div class="qrs">' + q.map(function (x) {
        return '<button class="f qr">' + qrSvg(x[0]) + '<b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></button>';
      }).join('') + '</div>';
    }
  };

  /* ---------------- vykreslení ---------------- */
  function renderSide() {
    var t = T();
    $('menu').innerHTML = SEKCE.map(function (s) {
      return '<li><button data-sec="' + s + '" class="' + (s === S.sec ? 'on' : '') + '">' + ico(s) + '<span>' + esc(t.menu[s]) + '</span></button></li>';
    }).join('');
    $('langs').innerHTML = LANGS.map(function (l) { return '<button data-lang="' + l + '" class="' + (l === S.lang ? 'on' : '') + '">' + l.toUpperCase() + '</button>'; }).join('');
    document.documentElement.lang = S.lang;
    hodiny();
  }
  function renderMain() {
    $('main').innerHTML = '<div class="scroll" id="scroll">' + R[S.sec](T()) + '</div><div class="hint">' + esc(T().hint) + '</div>';
    S.lastMain = null;
  }
  function hodiny() {
    var d = dnes();
    $('cas').textContent = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
    $('datum').textContent = datumText(d, false);
  }
  function ukaz(sec, fokusDoObsahu) {
    S.sec = sec;
    Array.prototype.forEach.call(document.querySelectorAll('#menu button'), function (b) { b.classList.toggle('on', b.getAttribute('data-sec') === sec); });
    renderMain();
    if (fokusDoObsahu) fokusMain();
  }
  function fokusMain() { var f = S.lastMain && document.body.contains(S.lastMain) ? S.lastMain : $('main').querySelector('.f'); if (f) fokus(f); }
  function fokusMenu() { var b = document.querySelector('#menu button[data-sec="' + S.sec + '"]'); if (b) fokus(b); }
  function fokus(el) {
    el.focus({ preventScroll: true });
    var sc = el.closest('.scroll');
    if (sc) {
      var r = el.getBoundingClientRect(), c = sc.getBoundingClientRect(), m = c.height * .18;
      if (el === sc.querySelector('.f') && r.top < c.bottom - m) sc.scrollTop = 0;
      else if (r.bottom > c.bottom - m) sc.scrollTop += r.bottom - c.bottom + m;
      else if (r.top < c.top + m) sc.scrollTop -= c.top + m - r.top;
      S.lastMain = el;
    }
  }
  function setLang(l) {
    if (LANGS.indexOf(l) < 0 || l === S.lang) return;
    S.lang = l;
    try { localStorage.setItem('vrLang', l); } catch (e) {}
    try { if (window.VRApp && VRApp.setLang) VRApp.setLang(l); } catch (e) {}
    renderSide(); renderMain();
    var b = document.querySelector('#langs button[data-lang="' + l + '"]'); if (b) b.focus();
  }

  /* ---------------- detail výletu ---------------- */
  function otevriVylet(id) {
    var t = null; (S.trips || []).forEach(function (x) { if (x.id === id) t = x; });
    if (!t) return;
    var L = T(), links = t.links || [], mapa = null, web = null;
    links.forEach(function (l) { if (!mapa && l.icon === 'pin') mapa = l; if (!web && l.icon !== 'pin') web = l; });
    var qr = mapa || web;
    var dl = (t.openNote ? '<dt>' + esc(L.otevreno) + '</dt><dd>' + esc(loc(t.openNote)) + '</dd>' : '') +
      (t.price ? '<dt>' + esc(L.cena) + '</dt><dd>' + esc(loc(t.price)) + '</dd>' : '');
    $('detail').innerHTML = '<div class="panel" style="--acc:' + esc(t.accent || '#E9B949') + '"><h1>' + esc(loc(t.name)) + '</h1>' +
      '<div class="tag">' + esc(loc(t.tagline)) + '</div>' +
      '<div><div class="txt">' + esc(loc(t.desc)) + '</div>' + (dl ? '<dl>' + dl + '</dl>' : '') + '</div>' +
      (qr ? '<button class="qr f" id="detailFokus">' + qrSvg(qr.url) + '<b>' + esc(qr === mapa ? L.qrMapa : L.qrWeb) + '</b><span>' + esc(qr === mapa ? L.qrMapaSub : loc(qr.label)) + '</span></button>' : '<button class="f" id="detailFokus"></button>') +
      '<div class="zpet"><b>OK</b> / <b>⟵</b></div></div>';
    $('detail').hidden = false;
    S.predDetailem = document.activeElement;
    $('detailFokus').focus();
  }
  function zavriDetail() {
    $('detail').hidden = true; $('detail').innerHTML = '';
    if (S.predDetailem && document.body.contains(S.predDetailem)) fokus(S.predDetailem); else fokusMain();
  }

  /* ---------------- ovládání ---------------- */
  function zona(el) { return !el ? null : el.closest('#detail') ? 'detail' : el.closest('.side') ? 'side' : el.closest('#main') ? 'main' : null; }
  function kandidati(z) {
    var sel = z === 'side' ? '.side button' : z === 'detail' ? '#detail button' : '#main .f';
    return Array.prototype.slice.call(document.querySelectorAll(sel)).filter(function (e) { return e.offsetParent !== null; });
  }
  function nejblizsi(cur, dir, list) {
    var r = cur.getBoundingClientRect(), best = null, bs = 1e9;
    list.forEach(function (c) {
      if (c === cur) return;
      var q = c.getBoundingClientRect(), p, s;
      if (dir === 'right') { if (q.left < r.right - 2) return; p = q.left - r.right; s = Math.max(0, Math.max(q.top, r.top) < Math.min(q.bottom, r.bottom) ? 0 : Math.abs((q.top + q.bottom) - (r.top + r.bottom)) / 2); }
      else if (dir === 'left') { if (q.right > r.left + 2) return; p = r.left - q.right; s = Math.max(q.top, r.top) < Math.min(q.bottom, r.bottom) ? 0 : Math.abs((q.top + q.bottom) - (r.top + r.bottom)) / 2; }
      else if (dir === 'down') { if (q.top < r.bottom - 2) return; p = q.top - r.bottom; s = Math.max(q.left, r.left) < Math.min(q.right, r.right) ? Math.abs(q.left - r.left) / 4 : Math.abs((q.left + q.right) - (r.left + r.right)) / 2; }
      else { if (q.bottom > r.top + 2) return; p = r.top - q.bottom; s = Math.max(q.left, r.left) < Math.min(q.right, r.right) ? Math.abs(q.left - r.left) / 4 : Math.abs((q.left + q.right) - (r.left + r.right)) / 2; }
      var sc = p + s * 2.5;
      if (sc < bs) { bs = sc; best = c; }
    });
    return best;
  }
  function pohyb(dir) {
    var cur = document.activeElement, z = zona(cur);
    if (!z) { if (!$('detail').hidden) $('detailFokus').focus(); else fokusMenu(); return; }
    if (z === 'detail') return;
    /* Šipka doprava hned po výběru v menu: sekci přepnout teď, nečekat na zpožděné přepnutí. */
    if (z === 'side' && dir === 'right' && cur.hasAttribute('data-sec') && cur.getAttribute('data-sec') !== S.sec) {
      clearTimeout(menuTimer); ukaz(cur.getAttribute('data-sec'), true); return;
    }
    var n = nejblizsi(cur, dir, kandidati(z));
    if (n) { fokus(n); return; }
    if (z === 'side' && dir === 'right') fokusMain();
    else if (z === 'main' && dir === 'left') fokusMenu();
    else if (z === 'main' && (dir === 'up' || dir === 'down')) { var sc = $('scroll'); if (sc) sc.scrollTop += dir === 'down' ? 200 : -200; }
  }
  var menuTimer = null;
  document.addEventListener('focusin', function (e) {
    var b = e.target.closest && e.target.closest('#menu button');
    if (!b) return;
    clearTimeout(menuTimer);
    var s = b.getAttribute('data-sec');
    if (s !== S.sec) menuTimer = setTimeout(function () { if (document.activeElement === b) ukaz(s, false); }, 180);
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button'); if (!el) return;
    if (el.hasAttribute('data-sec')) { var s = el.getAttribute('data-sec'); if (s !== S.sec) ukaz(s, false); fokusMain(); return; }
    if (el.hasAttribute('data-lang')) { setLang(el.getAttribute('data-lang')); return; }
    if (el.hasAttribute('data-go')) { ukaz(el.getAttribute('data-go'), true); fokusMenu(); return; }
    if (el.hasAttribute('data-filtr')) {
      S.filtr = el.getAttribute('data-filtr'); renderMain();
      var c = document.querySelector('.chip[data-filtr="' + S.filtr + '"]'); if (c) fokus(c); return;
    }
    if (el.hasAttribute('data-trip')) { otevriVylet(el.getAttribute('data-trip')); return; }
    if (el.closest('#detail')) { zavriDetail(); }
  });
  var posledni = Date.now();
  document.addEventListener('keydown', function (e) {
    posledni = Date.now();
    var k = e.key, dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[k];
    if (dir) { e.preventDefault(); pohyb(dir); return; }
    if (k === 'Escape' || k === 'Backspace' || k === 'GoBack' || k === 'BrowserBack') { e.preventDefault(); if (zpet() === 'exit' && window.VRApp && VRApp.exit) VRApp.exit(); }
  });
  /* Tlačítko Zpět na ovladači (volá aplikace): 'handled' = vyřízeno, 'exit' = zavřít aplikaci. */
  function zpet() {
    if (!$('detail').hidden) { zavriDetail(); return 'handled'; }
    var z = zona(document.activeElement);
    if (z === 'main') { fokusMenu(); return 'handled'; }
    if (S.sec !== 'home') { ukaz('home', false); fokusMenu(); return 'handled'; }
    return 'exit';
  }
  window.vrBack = zpet;
  window.vrSetLang = setLang;

  /* ---------------- data ---------------- */
  function nacti(jmeno) {
    var zdroje = [PORTAL + jmeno, 'data/' + jmeno], i = 0;
    return new Promise(function (ok) {
      (function dalsi() {
        if (i >= zdroje.length) return ok(null);
        var u = zdroje[i++], ctl = window.AbortController ? new AbortController() : null;
        var tm = setTimeout(function () { if (ctl) ctl.abort(); }, 7000);
        fetch(u, ctl ? { signal: ctl.signal, cache: 'no-cache' } : {}).then(function (r) { if (!r.ok) throw 0; return r.json(); })
          .then(function (d) { clearTimeout(tm); if (i > 1) S.offline = true; ok(d); })
          .catch(function () { clearTimeout(tm); dalsi(); });
      })();
    });
  }
  function nactiVse() {
    Promise.all([nacti('trips.json'), nacti('forecast.json')]).then(function (x) {
      if (x[0]) { S.trips = x[0].trips || []; S.food = x[0].food || []; }
      if (x[1]) S.fc = x[1];
      var f = document.activeElement, bylMain = zona(f) === 'main';
      renderMain();
      if (bylMain) fokusMain();
      if (S.offline) toast(T().offline);
    });
  }
  function toast(s) { var el = $('toast'); el.textContent = s; el.hidden = false; setTimeout(function () { el.hidden = true; }, 5000); }

  /* ---------------- start ---------------- */
  renderSide(); renderMain(); fokusMenu();
  nactiVse();
  setInterval(hodiny, 15000);
  setInterval(nactiVse, 3 * 3600 * 1000);
  setInterval(function () {
    if (Date.now() - posledni > NECINNOST_MS && (S.sec !== 'home' || !$('detail').hidden)) {
      if (!$('detail').hidden) { $('detail').hidden = true; $('detail').innerHTML = ''; }
      S.filtr = 'vse'; ukaz('home', false); fokusMenu();
    }
  }, 60000);
  document.documentElement.setAttribute('data-verze', VERZE);
})();
