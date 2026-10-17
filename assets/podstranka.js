/* Villa Rudolf — společný skript podstránek Praktické info a Ubytovací podmínky
   (/info/, /podminky/ a jejich jazykové verze /de/info/, /de/podminky/ …).

   Texty jsou od 10/2026 ve stránce staticky (generuje node tools/gen-jazyky.mjs z
   tools/podstranky-obsah.mjs), aby je přečetli i roboti bez JavaScriptu (AI asistenti).
   Jazyk = adresa: přepínač jazyka jsou odkazy a staré odkazy ?lang= vyřizuje přesměrování
   v <head> české stránky. Tenhle skript už nic nepřekládá, jen:
     · sezóna (léto / zima) — dědí se z webu, jediný zdroj pravdy je assets/season.js,
     · sezóna v odkazech na hlavní web a výlety (a[data-site]),
     · uložení volby jazyka po kliknutí na přepínač (podle ní přesměrovává „/"),
     · mobilní menu. Vanilla JS, bez závislostí. */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var season = 'leto';
  if (window.VRSeason) season = window.VRSeason.resolve(location.search);
  else { var q = (qs.get('season') || '').toLowerCase(); if (q === 'leto' || q === 'zima') season = q; }
  var root = document.querySelector('.pi-root, .pd-root');
  if (root) root.setAttribute('data-season', season);
  if (window.VRSeason) window.VRSeason.remember(season);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', season === 'zima' ? '#eef2f6' : '#0E1311');

  /* Odkazy zpět na hlavní web a na výlety nesou sezónu, ať se dědičnost nerozbije. */
  document.querySelectorAll('a[data-site]').forEach(function (a) {
    try {
      var u = new URL(a.getAttribute('href'), location.href);
      u.searchParams.set('season', season);
      a.setAttribute('href', u.pathname + u.search + u.hash);
    } catch (e) {}
  });

  // vrLang se ukládá jen kliknutím na přepínač — podle něj přesměrovává „/" (10/2026)
  document.querySelectorAll('a.vr-lang').forEach(function (a) {
    a.addEventListener('click', function () {
      try { localStorage.setItem('vrLang', a.getAttribute('data-lang')); } catch (e) {}
    });
  });

  /* Mobilní menu (burger) */
  var burger = document.getElementById('vr-burger');
  var mob = document.getElementById('vr-mob');
  if (burger && mob) {
    var toggleMob = function (open) {
      var o = open == null ? mob.getAttribute('data-open') !== 'true' : open;
      mob.setAttribute('data-open', o ? 'true' : 'false');
      burger.setAttribute('aria-expanded', o ? 'true' : 'false');
      document.body.style.overflow = o ? 'hidden' : '';
    };
    burger.addEventListener('click', function () { toggleMob(); });
    mob.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { toggleMob(false); }); });
  }
})();
