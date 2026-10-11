#!/usr/bin/env node
// Lokální harness pro /sprava/ — bez admin klíče a bez databáze.
//
//   node tools/sprava-harness.mjs            →  http://localhost:4173/sprava/
//   PORT=5000 node tools/sprava-harness.mjs
//
// Servíruje repo tak, jak je, a do /sprava/ před sprava.js vloží skript, který:
//   • podvrhne fetch: RPC do Supabase a kalendář (history.json, verified.json) vrací
//     vymyšlené pobyty níž a drží je v paměti stránky (klikání funguje, reload vše vrátí),
//   • zamrazí „dnešek" na 11. 10. 2026 (jde změnit: /sprava/?dnes=2027-03-01),
//   • pustí bránu bez tokenu (jen v téhle stránce — ostrá /sprava/ se nemění).
//
// Data jsou v tools/sprava-harness-data.mjs — VŠECHNA VYMYŠLENÁ (repo je veřejné).
// Stejná data používá tools/test-zpravy.mjs pro kontrolu denního e-mailu.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { TODAY, BOOKINGS, HOLDS, CALENDAR, VERIFIED, DOOR_CODES, persons0 } from './sprava-harness-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4173;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

/* ---------- skript vložený do stránky ---------- */
function mockScript() {
  const hash = /var TOKEN_HASH = '([0-9a-f]{64})'/.exec(readFileSync(join(ROOT, 'sprava/sprava.js'), 'utf8'))[1];
  return `(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var TODAY = qs.get('dnes') || ${JSON.stringify(TODAY)};
  var FIXED = new Date(TODAY + 'T09:00:00').getTime();
  var RealDate = Date;
  function FakeDate() {
    var a = Array.prototype.slice.call(arguments);
    return a.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(a)))() : new RealDate(FIXED);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return FIXED; };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;

  // brána: sha256(čehokoli) = TOKEN_HASH ze sprava.js → odemkne se bez tokenu
  var HASH = ${JSON.stringify(hash)};
  SubtleCrypto.prototype.digest = function () {
    var b = new Uint8Array(32);
    for (var i = 0; i < 32; i++) b[i] = parseInt(HASH.substr(i * 2, 2), 16);
    return Promise.resolve(b.buffer);
  };
  try { sessionStorage.setItem('vr_sprava_key', 'harness'); } catch (e) {}

  var DB = {
    bookings: ${JSON.stringify(BOOKINGS)},
    holds: ${JSON.stringify(HOLDS)},
    calendar: ${JSON.stringify(CALENDAR)},
    verified: ${JSON.stringify(VERIFIED)},
    config: {},
    calls: []
  };
  window.__harness = DB;
  var seq = 100;
  function byId(id) { return DB.bookings.filter(function (b) { return b.id === id; })[0]; }
  function newToken() { return 'harnessnew' + (seq++) + 'b'.repeat(35); }

  var RPC = {
    vr_admin_list_bookings: function () { return { ok: true, bookings: JSON.parse(JSON.stringify(DB.bookings)) }; },
    vr_admin_get_config: function () { return { ok: true, config: DB.config }; },
    vr_admin_set_config: function (p) { if (p.p_value) DB.config[p.p_key] = p.p_value; else delete DB.config[p.p_key]; return { ok: true }; },
    vr_admin_conflicts: function () { return { ok: true, conflicts: [] }; },
    vr_admin_list_requests: function () { return { ok: true, requests: [] }; },
    vr_admin_list_holds: function () { return { ok: true, holds: DB.holds }; },
    vr_admin_list_payments: function () { return { ok: true, payments: [] }; },
    vr_admin_door_codes: function () { return { ok: true, reported_at: new RealDate(FIXED).toISOString(), codes: ${JSON.stringify(DOOR_CODES)} }; },
    vr_admin_persons: function () { return { ok: true, persons: [] }; },
    vr_admin_ubyport_reports: function () { return { ok: true, reports: [] }; },
    vr_admin_msg_log: function (p) {
      var b = byId(p.p_booking_id);
      if (!b) return { ok: false, error: 'not_found' };
      b.msglog = b.msglog.filter(function (m) { return m.msg_key !== p.p_msg_key; });
      if (p.p_sent) b.msglog.push({ msg_key: p.p_msg_key, sent_at: new RealDate(FIXED).toISOString() });
      return { ok: true, sent: !!p.p_sent };
    },
    vr_admin_upsert_booking: function (p) {
      var b = p.p_id ? byId(p.p_id) : null, token = null;
      if (p.p_id && !b) return { ok: false, error: 'not_found' };
      if (!b) {
        b = { id: 'n' + (seq++), msglog: [], persons: ${JSON.stringify(persons0)}, created_at: new RealDate(FIXED).toISOString() };
        DB.bookings.push(b); token = newToken();
      } else if (p.p_regen_token) token = newToken();
      b.uidh = p.p_uidh || null; b.first_name = p.p_first || null; b.last_name = p.p_last || null;
      b.phone = p.p_phone || null; b.email = p.p_email || null; b.lang = p.p_lang || 'cs';
      b.arrival = p.p_arrival; b.departure = p.p_departure;
      b.adults = p.p_adults == null ? 2 : p.p_adults;      // stejně jako DB: coalesce(p_adults, 2)
      b.children = p.p_children || []; b.platform = p.p_platform || null; b.notes = p.p_notes || null;
      b.door_code = p.p_door_code || null;
      if (token) b.token = token;
      return { ok: true, id: b.id, token: token };
    }
  };

  var realFetch = window.fetch.bind(window);
  function json(obj) { return Promise.resolve(new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } })); }
  window.fetch = function (url, opts) {
    var u = String(url);
    var m = /\\/rest\\/v1\\/rpc\\/([a-z_]+)/.exec(u);
    if (m) {
      var body = {}; try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
      delete body.p_admin_key;
      DB.calls.push({ fn: m[1], body: body });
      return json(RPC[m[1]] ? RPC[m[1]](body) : { ok: true });
    }
    if (u.indexOf('history.json') >= 0) return json(DB.calendar);
    if (u.indexOf('verified.json') >= 0) return json(DB.verified);
    return realFetch(url, opts);
  };

  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.textContent = 'HARNESS · vymyšlená data · dnes = ' + TODAY;
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;background:#7a3fb0;color:#fff;font:600 12px/1 system-ui;padding:6px 10px;text-align:center;opacity:.92';
    document.body.appendChild(bar);
  });
})();`;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__harness/mock.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
      return res.end(mockScript());
    }
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel.split(/[/\\]/).some(seg => seg.startsWith('.'))) { res.writeHead(403); return res.end('ne'); }   // žádné .git, .claude, ..
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    let buf = await readFile(join(ROOT, rel));
    if (rel === 'sprava/index.html') {
      buf = Buffer.from(buf.toString('utf8').replace(/<script src="sprava\.js/, '<script src="/__harness/mock.js"></script>\n<script src="sprava.js'));
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('nenalezeno');
  }
}).listen(PORT, () => console.log(`harness /sprava/: http://localhost:${PORT}/sprava/  (dnes = ${TODAY}, data vymyšlená)`));
