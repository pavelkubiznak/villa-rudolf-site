#!/usr/bin/env node
// Zkušební server pro /registrace/ — formulář bez živé databáze.
// Spusť: node tools/registrace-harness.mjs  →  http://localhost:4174/registrace/?t=demo
//
// Servíruje repo tak, jak je, jen do registrace/index.html vloží náhradu za Supabase RPC:
// vymyšlený pobyt (včera až za 5 dní), seznam osob v paměti stránky, nic neodchází ven.
// Bez ?t= ukáže lednicovou cestu; kód od dveří je 12345. Odeslaná data jsou ve window.__sent.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 4174);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.traineddata': 'application/octet-stream' };

const STUB = `<script>
(function () {
  function iso(n) { var d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var booking = { arrival: iso(-1), departure: iso(5) }, persons = [], seq = 1;
  window.__sent = [];
  var RPC = {
    vr_verify_token: function () { return { name: { first: 'Jan', last: 'Vzorový' }, arrival: booking.arrival, departure: booking.departure }; },
    vr_fridge_open: function (b) { return b.p_code === '12345'
      ? { ok: true, token: 'harness', booking: { arrival: booking.arrival, departure: booking.departure, last_name: 'Vzorový' } }
      : { ok: false, error: 'code_invalid' }; },
    vr_persons_list: function () { return { ok: true, persons: persons }; },
    vr_persons_add: function (b) { window.__sent.push(b);
      var p = { id: 'p' + (seq++), first_name: b.p_first, last_name: b.p_last, citizenship: b.p_citizenship,
        stay_from: b.p_from, stay_to: b.p_to, doc_filled: !!b.p_doc };
      persons.push(p); return { ok: true, id: p.id, person: p }; },
    vr_persons_delete: function (b) { persons = persons.filter(function (p) { return p.id !== b.p_id; }); return { ok: true }; }
  };
  var real = window.fetch;
  window.fetch = function (url, opt) {
    var m = /\\/rest\\/v1\\/rpc\\/(\\w+)/.exec(String(url));
    if (!m) return real.apply(this, arguments);
    var fn = RPC[m[1]], body = JSON.parse((opt && opt.body) || '{}');
    var data = fn ? fn(body) : { ok: false, error: 'unknown_rpc' };
    return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
})();
</script>`;

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    let body = await readFile(file);
    if (path === '/registrace/index.html') {
      body = Buffer.from(body.toString('utf8')
        .replace('<script src="doklady.js', STUB + '\n<script src="doklady.js')
        .replace(/<script defer src="https:\/\/178-104-207-97[^>]*><\/script>/, ''));   // bez Umami
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
  }
}).listen(PORT, () => console.log('registrace harness: http://localhost:' + PORT + '/registrace/?t=demo'));
