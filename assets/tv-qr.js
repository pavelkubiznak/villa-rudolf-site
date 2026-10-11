/* Villa Rudolf — QR kód z průvodce na TV ve vile.
   Sekce „Do mobilu“ na villarudolf.com/tv/ ukazuje QR na /vylety/ a /info/ s příznakem ?tv.
   Tady se z něj zapíše jen anonymní „QR načten“ (která stránka, jaký jazyk) — žádné ID,
   žádná cookie, žádná IP v tabulce (supabase/migrations/20261011_vr_tv_events.sql). Počty čte
   Home Assistant na vile spolu s tím, kolikrát se QR na TV zobrazil.
   Příznak se z adresy hned odstraní, aby se obnovení stránky ani přeposlaný odkaz nepočítaly
   znovu. Chyby se polykají — na stránku to nemá žádný vliv. */
(function () {
  'use strict';
  try {
    var q = new URLSearchParams(location.search);
    if (!q.has('tv')) return;
    var lang = (q.get('lang') || '').toLowerCase();
    if (['cs', 'de', 'en', 'pl'].indexOf(lang) < 0) lang = 'cs';
    var sekce = location.pathname.indexOf('/info') >= 0 ? 'info' : 'vylety';
    q.delete('tv');
    var s = q.toString();
    history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash);
    var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA';   // veřejný anon klíč, stejný jako v assets/site.js
    fetch('https://fpknbrzbqpalguajskut.supabase.co/rest/v1/rpc/vr_tv_event', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY },
      body: JSON.stringify({ p_typ: 'qr_nacten', p_sekce: sekce, p_jazyk: lang })
    }).catch(function () {});
  } catch (e) {}
})();
