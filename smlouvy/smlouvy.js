/* Villa Rudolf — generátor ubytovacích smluv (/smlouvy/)
 *
 * Jen majitel, jen česky (UI), smlouva pro hosta cs/de/en.
 *  - Brána: stejný token jako /sprava/ (sha256 === TOKEN_HASH, uložený pod stejným klíčem,
 *    takže kdo je přihlášený ve správě, je přihlášený i tady).
 *  - Data: vr_admin_list_bookings (host, termín, jazyk), vr_admin_list_holds (faktura),
 *    vr_admin_list_contracts (archiv). Ceník se čte z ../assets/site.js (VR_PRICING),
 *    aby cena za noc měla jediný zdroj pravdy.
 *  - Smlouva = data + šablona (smlouva-sablona.js). Uloží se i vykreslené HTML.
 *  - „Vystavit“ zároveň založí/aktualizuje předrezervaci (vr_holds) — ta drží termín
 *    v kalendáři a hlídá splatnost. Smlouva sama termín neblokuje.
 *
 * Zálohová faktura se vystavuje ručně v iDokladu; sem se opíše číslo, VS a splatnost.
 */
(function () {
  'use strict';

  var CFG = {
    SUPABASE_URL: 'https://fpknbrzbqpalguajskut.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA'
  };
  var TOKEN_HASH = 'b887a4a499dc6306d51fd15138f4235e680ae721edec15712c7030a589367430';
  var STORE_KEY = 'vr_sprava_key';

  // Záloha pro případ, že se ceník z site.js nepodaří přečíst. Zdroj pravdy je VR_PRICING.
  var PRICING = {
    seasons: [
      { name: 'letni', from: '05-01', to: '10-31', nightly: 12900 },
      { name: 'zimni', from: '12-15', to: '03-31', nightly: 12900 },
      { name: 'mimo', nightly: 11900 }
    ],
    cleaning: 3500, cityTaxAdultNight: 25, petPerStay: 500, bond: 5000
  };
  var FX_EUR = 25;
  var SPLIT_MIN_DAYS = 21;   // doplatek musí mít splatnost aspoň 3 týdny od dneška, jinak nemá smysl dělit

  var S = VR_SMLOUVA;
  var adminKey = null;
  var bookings = [], holds = [], contracts = [];
  var cur = null;          // právě editovaná smlouva {id, data, status, booking_id, hold_id}
  var previewTimer = null;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 250); }, 2400);
  }
  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseISO(s) { return new Date(s + 'T00:00:00'); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function fmtShort(a, b) {
    var da = parseISO(a), db = parseISO(b);
    return da.getDate() + '. ' + (da.getMonth() + 1) + '. – ' + db.getDate() + '. ' + (db.getMonth() + 1) + '. ' + db.getFullYear();
  }
  function fmtDay(iso) { return iso ? S.fmtD(iso, 'cs') : '—'; }
  function fmtKc(n) { return (Math.round(Number(n) || 0)).toLocaleString('cs-CZ') + ' Kč'; }
  function sha256hex(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function readStoredKey() { try { return localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY); } catch (e) { return null; } }
  function storeKey(tok, remember) { try { sessionStorage.setItem(STORE_KEY, tok); if (remember) localStorage.setItem(STORE_KEY, tok); } catch (e) {} }
  function clearKey() { try { sessionStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_KEY); } catch (e) {} }

  /* ============ Demo (#demo) ============ */
  // Ukázka bez klíče a bez databáze — stejná konvence jako ?t=demo v průvodci.
  // Nic neukládá: zápisové RPC jen vrátí ok. Slouží k vývoji a k prohlédnutí UI.
  var DEMO = location.hash === '#demo';
  var DEMO_DATA = {
    vr_admin_list_bookings: { ok: true, bookings: [
      { id: 'demo-b1', first_name: 'Petra', last_name: 'Ukázková', phone: '+420 777 000 111', email: 'ukazka@example.com', lang: 'cs', arrival: '2027-08-21', departure: '2027-08-28', platform: 'Přímá' },
      { id: 'demo-b2', first_name: 'Lena', last_name: 'Muster', phone: '+49 171 0000000', email: 'muster@example.de', lang: 'de', arrival: '2027-02-13', departure: '2027-02-20', platform: 'Přímá' },
      { id: 'demo-b3', first_name: 'Sina', last_name: 'Beispiel', lang: 'de', arrival: '2027-08-30', departure: '2027-09-05', platform: 'Booking.com' }
    ] },
    vr_admin_list_holds: { ok: true, holds: [] },
    vr_admin_list_contracts: { ok: true, contracts: [] }
  };

  /* ============ RPC ============ */
  function rpc(fn, body) {
    if (DEMO) return Promise.resolve({ ok: true, status: 200, data: DEMO_DATA[fn] || { ok: true, id: 'demo-' + Math.random().toString(36).slice(2, 8) } });
    body = body || {};
    body.p_admin_key = adminKey;
    return fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; })
        .catch(function () { return { ok: r.ok, status: r.status, data: null }; });
    });
  }
  function rpcList(fn, key) {
    return rpc(fn, {}).then(function (res) {
      if (res.data && res.data.ok) return res.data[key] || [];
      if (res.status === 401 || (res.data && res.data.message === 'unauthorized')) throw new Error('unauthorized');
      // 404 = migrace neproběhla; nesmí shodit celou stránku
      return [];
    });
  }

  /* Ceník z homepage — jediný zdroj pravdy pro cenu za noc. */
  function loadPricing() {
    return fetch('../assets/site.js?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (src) {
        var m = /const VR_PRICING = (\{[\s\S]*?\n\});/.exec(src);
        if (m) { try { var p = new Function('return ' + m[1])(); if (p && p.seasons) PRICING = p; } catch (e) {} }
        var f = /const VR_FX = (\{[^}]*\})/.exec(src);
        if (f) { try { var fx = new Function('return ' + f[1])(); if (fx && fx.EUR) FX_EUR = fx.EUR; } catch (e) {} }
      }).catch(function () {});
  }
  function nightlyFor(iso) {
    if (!iso) return PRICING.seasons[0].nightly;
    var md = iso.slice(5);
    for (var i = 0; i < PRICING.seasons.length; i++) {
      var s = PRICING.seasons[i];
      if (!s.from) continue;
      var inSeason = s.from <= s.to ? (md >= s.from && md <= s.to) : (md >= s.from || md <= s.to);
      if (inSeason) return s.nightly;
    }
    var mimo = PRICING.seasons.filter(function (s) { return !s.from; })[0];
    return mimo ? mimo.nightly : PRICING.seasons[0].nightly;
  }

  /* ============ Data ============ */
  function reload() {
    $('loadline').hidden = false; $('loadline').textContent = 'Načítám pobyty a smlouvy…';
    return Promise.all([
      rpcList('vr_admin_list_bookings', 'bookings'),
      rpcList('vr_admin_list_holds', 'holds'),
      rpcList('vr_admin_list_contracts', 'contracts'),
      loadPricing()
    ]).then(function (r) {
      bookings = r[0]; holds = r[1]; contracts = r[2];
      $('loadline').hidden = true;
      renderList();
      if ($('view-edit').hidden) $('view-list').hidden = false;
      handleDeepLink();
    }).catch(function (e) {
      if (String(e && e.message) === 'unauthorized') { lockOut('Přístup vypršel. Přihlaste se znovu.'); return; }
      $('loadline').textContent = 'Načtení se nepodařilo. Zkuste Obnovit.';
    });
  }
  function bookingById(id) { for (var i = 0; i < bookings.length; i++) if (bookings[i].id === id) return bookings[i]; return null; }
  function holdById(id) { for (var i = 0; i < holds.length; i++) if (holds[i].id === id) return holds[i]; return null; }
  function contractForBooking(id) { for (var i = 0; i < contracts.length; i++) if (contracts[i].booking_id === id && contracts[i].status !== 'cancelled') return contracts[i]; return null; }
  function contractForHold(id) { for (var i = 0; i < contracts.length; i++) if (contracts[i].hold_id === id && contracts[i].status !== 'cancelled') return contracts[i]; return null; }
  function holdForBooking(id) { for (var i = 0; i < holds.length; i++) if (holds[i].booking_id === id) return holds[i]; return null; }
  function holdForSpan(a, b) { for (var i = 0; i < holds.length; i++) if (holds[i].arrival === a && holds[i].departure === b && holds[i].status !== 'cancelled') return holds[i]; return null; }
  function guestName(b) { return [b.first_name, b.last_name].filter(function (x) { return x && String(x).trim(); }).join(' '); }

  /* ============ Seznam ============ */
  var STATUS = {
    draft: { label: 'koncept', cls: 'hold-st-draft' },
    issued: { label: 'vystavená', cls: 'hold-st-ok' },
    cancelled: { label: 'zrušená', cls: 'hold-st-muted' }
  };
  function renderList() {
    // výběr pobytu pro novou smlouvu: přímé rezervace napřed, pak ostatní (i ty jdou — třeba host z e-chalup)
    var today = isoToday();
    var sel = $('new-booking');
    var opts = bookings.filter(function (b) { return b.departure >= today; })
      .sort(function (a, b) { return (a.platform === 'Přímá' ? 0 : 1) - (b.platform === 'Přímá' ? 0 : 1) || a.arrival.localeCompare(b.arrival); });
    sel.innerHTML = opts.map(function (b) {
      var has = contractForBooking(b.id);
      return '<option value="' + esc(b.id) + '">' + esc(fmtShort(b.arrival, b.departure)) + ' · ' + esc(guestName(b) || 'bez jména') +
        ' · ' + esc(b.platform || '?') + (has ? ' · smlouva ' + esc(has.contract_no) : '') + '</option>';
    }).join('') + '<option value="">— bez vazby na pobyt (zadat ručně) —</option>';

    var host = $('contracts');
    host.innerHTML = '';
    $('contracts-empty').hidden = contracts.length > 0;
    $('contracts-count').textContent = contracts.length ? contracts.length + ' celkem' : '';
    contracts.forEach(function (c) {
      var st = STATUS[c.status] || STATUS.draft;
      var d = c.data || {};
      var lines = [];
      lines.push('💶 ' + fmtKc(c.price) + (c.currency === 'EUR' ? ' · platí v EUR' : '') + ' · ' + (c.plan === 'split' ? 'dvě splátky' : 'najednou'));
      if (d.inv1 && d.inv1.no) lines.push('🧾 ' + esc(d.inv1.no) + (d.inv1.due ? ' · splatnost ' + fmtDay(d.inv1.due) : ''));
      if (c.plan === 'split' && d.inv2 && d.inv2.due) lines.push('🧾 doplatek ' + fmtKc(d.inv2.amount) + ' · splatnost ' + fmtDay(d.inv2.due));
      var h = c.hold_id ? holdById(c.hold_id) : null;
      if (h) lines.push(h.paid_at ? '💰 předrezervace uhrazená' : (h.status === 'hold' ? '⏳ předrezervace drží termín do ' + fmtDay(h.hold_until) : '📌 předrezervace: ' + esc(h.status)));
      else if (c.status === 'issued') lines.push('⚠️ bez předrezervace — termín není držený v kalendáři');
      if (c.issued_at) lines.push('📤 vystavená ' + fmtDay(String(c.issued_at).slice(0, 10)));

      var el = document.createElement('div');
      el.className = 'contract' + (c.status === 'issued' ? ' contract-issued' : (c.status === 'cancelled' ? ' contract-cancelled' : ''));
      el.innerHTML = '<div class="contract-main">' +
        '<div class="contract-t">' + esc(c.guest_name || 'bez jména') + ' <span class="contract-n">' + esc(fmtShort(c.arrival, c.departure)) + '</span></div>' +
        '<div class="contract-tags"><span class="hold-st ' + st.cls + '">' + st.label + '</span>' +
        '<span class="pill pill-plat">' + esc(c.contract_no) + '</span><span class="pill pill-plat">' + esc(c.lang) + '</span></div>' +
        '<div class="contract-d">' + lines.join('<br>') + '</div></div>' +
        '<div class="contract-actions">' +
        '<button type="button" class="btn btn-sm btn-primary" data-open>' + (c.status === 'draft' ? 'Dokončit' : 'Otevřít') + '</button>' +
        (c.has_html ? '<button type="button" class="btn btn-sm btn-outline" data-print>Tisk / PDF</button>' : '') +
        '</div>';
      el.querySelector('[data-open]').onclick = function () { openContract(c); };
      var pb = el.querySelector('[data-print]');
      if (pb) pb.onclick = function () { rpc('vr_admin_get_contract', { p_id: c.id }).then(function (res) {
        if (res.data && res.data.ok && res.data.contract.html) openHtml(res.data.contract.html); else toast('Smlouva nemá uložené HTML.');
      }); };
      host.appendChild(el);
    });
  }

  /* ============ Editor ============ */
  function showList() { $('view-edit').hidden = true; $('view-list').hidden = false; cur = null; try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  function showEdit() { $('view-list').hidden = true; $('view-edit').hidden = false; window.scrollTo(0, 0); }

  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function suggestNo(arrival, name, excludeId) {
    var last = fold(String(name || '').trim().split(/\s+/).pop()).toUpperCase().replace(/[^A-Z]/g, '');
    var abbr = (last + 'XXX').slice(0, 3);
    var base = 'VR-' + arrival.slice(0, 4) + '-' + arrival.slice(5, 7) + '-' + abbr;
    var no = base, k = 2;
    while (contracts.some(function (c) { return c.contract_no === no && c.id !== excludeId; })) { no = base + '-' + (k++); }
    return no;
  }
  var COUNTRY_BY_LANG = { cs: 'Česká republika', de: 'Deutschland', en: '' };

  /* Nová smlouva z pobytu (nebo prázdná). */
  function newFromBooking(b) {
    var today = isoToday();
    var d = {
      lang: b ? (b.lang === 'de' || b.lang === 'en' ? b.lang : 'cs') : 'cs',
      contractNo: '',
      guest: { name: b ? guestName(b) : '', lastName: b ? (b.last_name || '') : '', address: '', country: '', phone: b ? (b.phone || '') : '', email: b ? (b.email || '') : '' },
      arrival: b ? b.arrival : '', departure: b ? b.departure : '',
      checkin: '15:00', checkout: '10:00',
      nightly: null, price: null, currency: 'CZK', fx: FX_EUR,
      plan: 'split',
      inv1: { no: '', vs: '', due: S.addDays(today, 7), amount: null, amountEur: null },
      inv2: { no: '', vs: '', due: '', amount: null, amountEur: null },
      deposit: PRICING.bond, cleaning: PRICING.cleaning, cityTax: PRICING.cityTaxAdultNight, petFee: PRICING.petPerStay,
      pet: '', note: ''
    };
    d.guest.country = COUNTRY_BY_LANG[d.lang] || '';
    if (d.arrival) { d.nightly = nightlyFor(d.arrival); d.contractNo = suggestNo(d.arrival, d.guest.name, null); }
    // předrezervace k pobytu už může existovat (faktura vystavená dřív) — převezmi z ní fakturu
    var h = b ? (holdForBooking(b.id) || holdForSpan(b.arrival, b.departure)) : null;
    if (h) {
      if (h.invoice_no) { d.inv1.no = h.invoice_no; d.inv1.vs = String(h.invoice_no).replace(/\D/g, ''); }
      if (h.invoice_due) d.inv1.due = h.invoice_due;
      if (h.invoice_currency === 'EUR') d.currency = 'EUR';
    }
    cur = { id: null, status: 'draft', booking_id: b ? b.id : null, hold_id: h ? h.id : null, data: d };
    fillForm(d);
    showEdit();
  }
  function openContract(c) {
    cur = { id: c.id, status: c.status, booking_id: c.booking_id, hold_id: c.hold_id, data: JSON.parse(JSON.stringify(c.data || {})) };
    fillForm(cur.data);
    showEdit();
  }

  function fillForm(d) {
    $('f-lang').value = d.lang || 'cs';
    $('f-cno').value = d.contractNo || '';
    $('f-name').value = d.guest.name || '';
    $('f-address').value = d.guest.address || '';
    $('f-country').value = d.guest.country || '';
    $('f-phone').value = d.guest.phone || '';
    $('f-email').value = d.guest.email || '';
    $('f-arrival').value = d.arrival || '';
    $('f-departure').value = d.departure || '';
    $('f-checkin').value = d.checkin || '15:00';
    $('f-checkout').value = d.checkout || '10:00';
    $('f-nightly').value = d.nightly != null ? d.nightly : '';
    $('f-price').value = d.price != null ? d.price : '';
    $('f-currency').value = d.currency || 'CZK';
    $('f-fx').value = d.fx || FX_EUR;
    $('f-pet').value = d.pet || '';
    $('plan-single').checked = d.plan !== 'split';
    $('plan-split').checked = d.plan === 'split';
    $('f-inv1-no').value = d.inv1.no || '';
    $('f-inv1-vs').value = d.inv1.vs || '';
    $('f-inv1-due').value = d.inv1.due || '';
    $('f-inv1-amount').value = d.inv1.amount != null ? d.inv1.amount : '';
    $('f-inv1-eur').value = d.inv1.amountEur != null ? d.inv1.amountEur : '';
    $('f-inv2-due').value = d.inv2.due || '';
    $('f-inv2-amount').value = d.inv2.amount != null ? d.inv2.amount : '';
    $('f-note').value = d.note || '';
    $('form-err').hidden = true;
    var st = STATUS[cur.status] || STATUS.draft;
    $('edit-status').className = 'hold-st ' + st.cls; $('edit-status').textContent = st.label;
    $('btn-delete').hidden = !cur.id;
    recompute({ silent: true });
  }

  /* Přepočet odvozených hodnot z formuláře → cur.data, náhled. */
  function recompute(opts) {
    opts = opts || {};
    var d = cur.data;
    var prevArrival = d.arrival, prevName = d.guest.name, prevNightly = d.nightly;
    d.lang = $('f-lang').value;
    d.guest.name = $('f-name').value.trim();
    d.guest.lastName = d.guest.name.split(/\s+/).pop();
    d.guest.address = $('f-address').value.trim();
    d.guest.country = $('f-country').value.trim();
    d.guest.phone = $('f-phone').value.trim();
    d.guest.email = $('f-email').value.trim();
    d.arrival = $('f-arrival').value; d.departure = $('f-departure').value;
    d.checkin = $('f-checkin').value.trim() || '15:00'; d.checkout = $('f-checkout').value.trim() || '10:00';
    d.currency = $('f-currency').value;
    d.fx = Number($('f-fx').value) || FX_EUR;
    d.pet = $('f-pet').value.trim();
    d.note = $('f-note').value;

    var nights = (d.arrival && d.departure) ? S.nights(d.arrival, d.departure) : 0;
    d.nights = nights;
    $('h-nights').textContent = nights ? nights + ' nocí' + (nights === 7 ? ' (týden)' : '') : 'zadej termín';

    // cena za noc podle sezóny — jen když ji uživatel nepřepsal, nebo se změnil termín
    if (d.arrival && (opts.arrivalChanged || $('f-nightly').value === '')) {
      $('f-nightly').value = nightlyFor(d.arrival);
    }
    d.nightly = Number($('f-nightly').value) || 0;
    // cena celkem = noc × nocí, dokud ji ručně nepřepíšeš (pak se drží a hint to řekne)
    var auto = d.nightly * nights;
    if (opts.priceEdited) d.priceManual = Number($('f-price').value) !== auto;
    if (!d.priceManual || $('f-price').value === '') $('f-price').value = auto || '';
    d.price = Number($('f-price').value) || 0;
    $('h-price').textContent = nights ? (d.priceManual ? 'ručně upravená cena (výpočet ' + fmtKc(auto) + ')' : nights + ' × ' + fmtKc(d.nightly) + ' = ' + fmtKc(auto)) : '';

    // číslo smlouvy: navrhni, dokud ho nepřepíšeš
    if (d.arrival && (!$('f-cno').value || (opts.arrivalChanged || opts.nameChanged) && !d.cnoManual)) {
      $('f-cno').value = suggestNo(d.arrival, d.guest.name, cur.id);
    }
    if (opts.cnoEdited) d.cnoManual = true;
    d.contractNo = $('f-cno').value.trim();

    // země podle jazyka, dokud ji nepřepíšeš
    if (opts.langChanged && !d.countryManual) { $('f-country').value = COUNTRY_BY_LANG[d.lang] || ''; d.guest.country = $('f-country').value; }
    if (opts.countryEdited) d.countryManual = true;

    // EUR
    $('fx-wrap').hidden = d.currency !== 'EUR';
    $('inv1-eur-wrap').hidden = d.currency !== 'EUR';

    // splátky
    var today = isoToday();
    var balDue = d.arrival ? S.balanceDue(d.arrival) : '';
    var splitOk = !!balDue && daysBetween(today, balDue) >= SPLIT_MIN_DAYS;
    $('h-bal-due').textContent = balDue ? fmtDay(balDue) : '—';
    $('plan-split').disabled = !splitOk;
    $('plan-split').parentElement.classList.toggle('disabled', !splitOk);
    if (!splitOk && $('plan-split').checked) { $('plan-single').checked = true; }
    d.plan = $('plan-split').checked ? 'split' : 'single';
    $('h-plan').textContent = !d.arrival ? '' : (splitOk
      ? (d.plan === 'split'
        ? 'Záloha 50 % drží storno do 50 % (89.–60. den). Doplatek musí být na účtu před 59. dnem, kdy storno vyskočí na 70 % — proto splatnost ' + fmtDay(balDue) + '.'
        : 'Host zaplatí celou cenu jednou fakturou. Dvě splátky jsou možné — doplatek by byl splatný ' + fmtDay(balDue) + '.')
      : 'Příjezd je moc blízko (doplatek by byl splatný ' + (balDue ? fmtDay(balDue) : '—') + ') — celá cena najednou.');

    $('inv2').hidden = d.plan !== 'split';
    $('inv1-lbl').textContent = d.plan === 'split' ? '— 1. splátka 50 %' : '— celá cena';
    var a1 = d.plan === 'split' ? Math.round(d.price / 2) : d.price;
    if (!opts.inv1Edited) $('f-inv1-amount').value = a1 || '';
    d.inv1.no = $('f-inv1-no').value.trim();
    if (opts.invNoEdited && !d.vsManual) $('f-inv1-vs').value = d.inv1.no.replace(/\D/g, '');
    if (opts.vsEdited) d.vsManual = true;
    d.inv1.vs = $('f-inv1-vs').value.trim();
    d.inv1.due = $('f-inv1-due').value;
    d.inv1.amount = Number($('f-inv1-amount').value) || 0;
    // EUR částka z faktury: dopočítává se kurzem, dokud ji ručně nepřepíšeš (iDoklad ji zaokrouhlí jinak)
    if (opts.eurEdited) d.eurManual = true;
    if (d.currency === 'EUR') {
      if (!d.eurManual || $('f-inv1-eur').value === '') $('f-inv1-eur').value = d.inv1.amount ? Math.round(d.inv1.amount / d.fx) : '';
      d.inv1.amountEur = Number($('f-inv1-eur').value) || null;
    } else d.inv1.amountEur = null;
    if (d.plan === 'split') {
      d.inv2.due = balDue; $('f-inv2-due').value = balDue;
      d.inv2.amount = Math.max(0, d.price - d.inv1.amount); $('f-inv2-amount').value = d.inv2.amount;
      d.inv2.amountEur = d.currency === 'EUR' ? Math.round(d.inv2.amount / d.fx) : null;
    } else { d.inv2 = { no: '', vs: '', due: '', amount: null, amountEur: null }; }

    // splatnost 1. faktury vs. doplatek: první musí být dřív
    var warn = [];
    if (d.plan === 'split' && d.inv1.due && d.inv1.due >= balDue) warn.push('splatnost zálohy je až po splatnosti doplatku');
    if (d.arrival && d.inv1.due && d.inv1.due >= d.arrival) warn.push('splatnost faktury je po příjezdu');
    $('h-issue').textContent = warn.length ? '⚠️ ' + warn.join(' · ') : '';

    schedulePreview();
  }

  function validate() {
    var d = cur.data, errs = [];
    if (!d.guest.name) errs.push('jméno hosta');
    if (!d.arrival || !d.departure || d.nights < 1) errs.push('termín');
    if (!d.contractNo) errs.push('číslo smlouvy');
    if (!(d.price > 0)) errs.push('cena');
    if (!d.inv1.no) errs.push('číslo zálohové faktury z iDokladu');
    if (!d.inv1.due) errs.push('splatnost faktury');
    if (!(d.inv1.amount > 0)) errs.push('částka faktury');
    return errs;
  }

  function renderHtml() { return S.render(JSON.parse(JSON.stringify(cur.data))); }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      if (!cur) return;
      var d = cur.data;
      // do náhledu jde i neúplná smlouva — chybějící pole se ukážou jako [doplnit]
      var snap = JSON.parse(JSON.stringify(d));
      if (!snap.inv1.no) snap.inv1.no = '[číslo faktury]';
      if (!snap.inv1.due) snap.inv1.due = isoToday();
      if (!snap.arrival || !snap.departure) { $('preview').srcdoc = '<p style="font-family:sans-serif;color:#888;padding:20px">Zadej termín pobytu.</p>'; return; }
      if (!snap.guest.name) snap.guest.name = '[jméno hosta]';
      if (!snap.contractNo) snap.contractNo = '[číslo]';
      var html = S.render(snap);
      $('preview').srcdoc = html;
      $('preview-info').textContent = Math.round(html.length / 1024) + ' kB · ' + (d.lang || 'cs');
      // odkaz ke stažení
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a = $('btn-download');
      if (a.href) try { URL.revokeObjectURL(a.href); } catch (e) {}
      a.href = URL.createObjectURL(blob);
      a.download = fileName(d);
    }, 250);
  }
  function fileName(d) {
    var base = { cs: 'Ubytovaci_smlouva', de: 'Beherbergungsvertrag', en: 'Accommodation_Agreement' }[d.lang] || 'Smlouva';
    var last = fold(d.guest.lastName || 'host').replace(/[^A-Za-z0-9]/g, '');
    return base + '_Villa_Rudolf_' + last + '_' + (d.arrival || '').slice(0, 4) + '.html';
  }
  function openHtml(html) {
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var w = window.open(url, '_blank');
    if (!w) toast('Prohlížeč zablokoval nové okno — povol vyskakovací okna.');
  }

  /* ============ Ukládání ============ */
  function save(status) {
    var d = cur.data;
    var errs = status === 'issued' ? validate() : (d.arrival && d.departure && d.nights > 0 && d.contractNo ? [] : ['termín a číslo smlouvy']);
    if (errs.length) { $('form-err').textContent = 'Doplň: ' + errs.join(', ') + '.'; $('form-err').hidden = false; return Promise.resolve(false); }
    $('form-err').hidden = true;
    var html = (status === 'issued' || cur.status === 'issued') ? renderHtml() : null;
    var payload = {
      p_id: cur.id, p_contract_no: d.contractNo, p_lang: d.lang, p_status: status,
      p_arrival: d.arrival, p_departure: d.departure, p_guest_name: d.guest.name,
      p_price: d.price, p_currency: d.currency, p_plan: d.plan, p_data: d, p_html: html,
      p_booking_id: cur.booking_id, p_hold_id: cur.hold_id
    };
    return rpc('vr_admin_upsert_contract', payload).then(function (res) {
      if (!(res.data && res.data.ok)) {
        var err = (res.data && (res.data.error || res.data.message)) || 'chyba';
        if (err === 'contract_no_taken') err = 'číslo smlouvy ' + d.contractNo + ' už existuje';
        $('form-err').textContent = 'Uložení se nepodařilo: ' + err; $('form-err').hidden = false; return false;
      }
      cur.id = res.data.id; cur.status = status;
      var st = STATUS[status] || STATUS.draft;
      $('edit-status').className = 'hold-st ' + st.cls; $('edit-status').textContent = st.label;
      $('btn-delete').hidden = false;
      return true;
    });
  }

  /* Předrezervace k vystavené smlouvě: založí ji, nebo do existující dopíše fakturu. */
  function upsertHold() {
    var d = cur.data;
    var h = cur.hold_id ? holdById(cur.hold_id) : (holdForBooking(cur.booking_id) || holdForSpan(d.arrival, d.departure));
    var payload = {
      p_id: h ? h.id : null,
      p_arrival: d.arrival, p_departure: d.departure,
      p_status: h ? h.status : 'hold',
      p_hold_until: h && h.status === 'hold' ? null : (h ? h.hold_until : null),   // null → server dopočítá ze splatnosti + 3 dny
      p_channel: h && h.channel ? h.channel : 'Přímá',
      p_guest_note: h && h.guest_note ? h.guest_note : d.guest.name,
      p_invoice_no: d.inv1.no, p_invoice_amount: d.currency === 'EUR' && d.inv1.amountEur ? d.inv1.amountEur : d.inv1.amount,
      p_invoice_currency: d.currency, p_invoice_issued: (h && h.invoice_issued) || isoToday(), p_invoice_due: d.inv1.due,
      p_invoice_account: d.currency === 'EUR' ? 'VR_EUR' : 'VR_CZK',
      p_note: ((h && h.note) ? h.note + ' · ' : '') + 'smlouva ' + d.contractNo,
      p_booking_id: cur.booking_id || (h ? h.booking_id : null), p_request_id: h ? h.request_id : null
    };
    if (h && h.note && h.note.indexOf('smlouva ' + d.contractNo) >= 0) payload.p_note = h.note;
    return rpc('vr_admin_upsert_hold', payload).then(function (res) {
      if (res.data && res.data.ok) { cur.hold_id = res.data.id; return true; }
      return false;
    });
  }

  function onIssue() {
    var btn = $('btn-issue'); btn.disabled = true;
    save('issued').then(function (ok) {
      if (!ok) return;
      return upsertHold().then(function (hok) {
        if (hok && cur.hold_id) {
          // dopiš hold_id ke smlouvě
          return rpc('vr_admin_upsert_contract', {
            p_id: cur.id, p_contract_no: cur.data.contractNo, p_lang: cur.data.lang, p_status: 'issued',
            p_arrival: cur.data.arrival, p_departure: cur.data.departure, p_guest_name: cur.data.guest.name,
            p_price: cur.data.price, p_currency: cur.data.currency, p_plan: cur.data.plan, p_data: cur.data, p_html: renderHtml(),
            p_booking_id: cur.booking_id, p_hold_id: cur.hold_id
          }).then(function () { toast('Smlouva vystavená, předrezervace drží termín.'); });
        }
        toast('Smlouva vystavená. Předrezervaci se nepodařilo založit — zkontroluj ve správě.');
      });
    }).then(function () { return reload(); }).then(function () {
      var c = contracts.filter(function (x) { return x.id === cur.id; })[0];
      if (c) openContract(c);
    }).finally(function () { btn.disabled = false; });
  }

  /* ============ Průvodní e-mail ============ */
  function mailText(d) {
    var L = d.lang in { cs: 1, de: 1, en: 1 } ? d.lang : 'cs';
    var span = S.fmtSpan(d.arrival, d.departure, L);
    var money = function (n) { return L === 'cs' ? Math.round(n).toLocaleString('cs-CZ') + ' Kč' : (L === 'de' ? Math.round(n).toLocaleString('de-DE') + ' CZK' : 'CZK ' + Math.round(n).toLocaleString('en-GB')); };
    var eur = function (n) { return d.currency === 'EUR' && n ? ' (' + n + ' EUR)' : ''; };
    var last = d.guest.lastName || d.guest.name;
    var split = d.plan === 'split';
    if (L === 'de') return {
      subject: 'Villa Rudolf — Vorausrechnung und Vertrag, ' + span,
      body: 'Guten Tag ' + d.guest.name + ',\n\nanbei sende ich Ihnen die Vorausrechnung und den Beherbergungsvertrag für ' + span + ' (' + d.nights + ' Nächte, Anreise ab ' + d.checkin + ', Abreise bis ' + d.checkout + ' Uhr).\n\n' +
        'Der Vertrag muss nicht unterschrieben oder zurückgeschickt werden — mit der Zahlung der Vorausrechnung ist er geschlossen und der Termin verbindlich Ihrer. Bis dahin kann ich den Termin leider nicht freihalten.\n\n' +
        'Zum Betrag: der Mietpreis beträgt ' + money(d.price) + ' für das ganze Haus samt Grundstück (' + d.nights + ' × ' + money(d.nightly) + '). Energie, Wasser und Heizung sind enthalten.\n' +
        (split ? 'Die Zahlung erfolgt in zwei Raten: ' + money(d.inv1.amount) + eur(d.inv1.amountEur) + ' laut beigefügter Rechnung bis ' + S.fmtD(d.inv1.due, 'de') + ', die zweite Rate ' + money(d.inv2.amount) + eur(d.inv2.amountEur) + ' bis ' + S.fmtD(d.inv2.due, 'de') + ' (die Rechnung dafür schicke ich rechtzeitig).\n'
               : 'Die Rechnung über ' + money(d.inv1.amount) + eur(d.inv1.amountEur) + ' ist bis ' + S.fmtD(d.inv1.due, 'de') + ' fällig.\n') +
        '\nDie Kaution von ' + money(d.deposit) + ' wird erst bei Anreise hinterlegt. Daraus werden nach dem Aufenthalt die Endreinigung (' + money(d.cleaning) + ') und die Kurtaxe (' + d.cityTax + ' CZK pro Erwachsenem und Nacht) abgerechnet, der Rest wird zurückerstattet.\n\n' +
        'Bei Fragen zur Rechnung oder zum Vertrag melden Sie sich gern.\n\nHerzliche Grüße\nPavel Kubizňák\n+420 775 220 785\nVilla Rudolf, Svoboda nad Úpou\nvillarudolf.com'
    };
    if (L === 'en') return {
      subject: 'Villa Rudolf — advance invoice and agreement, ' + span,
      body: 'Dear ' + d.guest.name + ',\n\nplease find attached the advance invoice and the accommodation agreement for ' + span + ' (' + d.nights + ' nights, arrival from ' + d.checkin + ', departure by ' + d.checkout + ').\n\n' +
        'The agreement needs no signature — it is concluded by paying the invoice, and the dates are then firmly yours. Until then I unfortunately cannot hold the dates.\n\n' +
        'About the amount: the rental price is ' + money(d.price) + ' for the whole house and grounds (' + d.nights + ' × ' + money(d.nightly) + '). Energy, water and heating are included.\n' +
        (split ? 'Payment is in two instalments: ' + money(d.inv1.amount) + eur(d.inv1.amountEur) + ' per the attached invoice by ' + S.fmtD(d.inv1.due, 'en') + ', and the second instalment of ' + money(d.inv2.amount) + eur(d.inv2.amountEur) + ' by ' + S.fmtD(d.inv2.due, 'en') + ' (I will send that invoice in good time).\n'
               : 'The invoice for ' + money(d.inv1.amount) + eur(d.inv1.amountEur) + ' is due by ' + S.fmtD(d.inv1.due, 'en') + '.\n') +
        '\nThe deposit of ' + money(d.deposit) + ' is paid on arrival. After the stay, the final cleaning (' + money(d.cleaning) + ') and the local tourist tax (CZK ' + d.cityTax + ' per adult per night) are settled from it and the rest is refunded.\n\n' +
        'If anything about the invoice or the agreement is unclear, just let me know.\n\nKind regards\nPavel Kubizňák\n+420 775 220 785\nVilla Rudolf, Svoboda nad Úpou\nvillarudolf.com'
    };
    return {
      subject: 'Villa Rudolf — zálohová faktura a smlouva, ' + span,
      body: 'Dobrý den, ' + (vocative(d.guest.name) || d.guest.name) + ',\n\nposílám slíbené podklady. V příloze najdete zálohovou fakturu a ubytovací smlouvu na termín ' + span + ' (' + d.nights + ' nocí, příjezd od ' + d.checkin + ', odjezd do ' + d.checkout + ').\n\n' +
        'Smlouvu není potřeba podepisovat ani posílat zpět. Uhrazením faktury je uzavřená a termín je pevně váš — do té doby ho bohužel držet nemůžu, zůstává v nabídce i pro ostatní zájemce.\n\n' +
        'K částce. Cena za pronájem je ' + money(d.price) + ' za celý dům i pozemek (' + d.nights + ' × ' + money(d.nightly) + '). Energie, voda i vytápění jsou v ceně, nic dalšího se k pobytu nepřipočítává.\n' +
        (split ? 'Platí se ve dvou splátkách: ' + money(d.inv1.amount) + ' podle přiložené faktury se splatností ' + S.fmtD(d.inv1.due, 'cs') + ' a druhá splátka ' + money(d.inv2.amount) + ' do ' + S.fmtD(d.inv2.due, 'cs') + ' (fakturu na ni pošlu s předstihem).\n'
               : 'Faktura na ' + money(d.inv1.amount) + ' má splatnost ' + S.fmtD(d.inv1.due, 'cs') + '.\n') +
        '\nKauce ' + money(d.deposit) + ' se skládá až při příjezdu. Po pobytu se z ní odečte závěrečný úklid a prádelna (' + money(d.cleaning) + ') a poplatek obci (' + d.cityTax + ' Kč za dospělou osobu a noc, děti neplatí) a zbytek se vám vrací.\n\n' +
        'Kdyby k faktuře nebo ke smlouvě cokoliv nebylo jasné, klidně zavolejte.\n\nS pozdravem\nPavel Kubizňák\n775 220 785\nVilla Rudolf, Svoboda nad Úpou\nvillarudolf.com'
    };
  }
  /* Oslovení v 5. pádě — jednoduchá pravidla, výsledek si před odesláním přečti. */
  function vocative(name) {
    var last = String(name || '').trim().split(/\s+/).pop();
    if (!last) return '';
    if (/[áa]$/.test(last) && /(ov|sk|ck|n|l|r|t|d|š|č|ž|ř)á$/.test(last)) return 'paní ' + last;
    if (/á$/.test(last)) return 'paní ' + last;
    var v = last;
    if (/ek$/.test(v)) v = v.slice(0, -2) + 'ku';
    else if (/(ch|[khg])$/.test(v)) v = v + 'u';
    else if (/[ščžřjcďťň]$/.test(v)) v = v + 'i';
    else if (/a$/.test(v)) v = v.slice(0, -1) + 'o';
    else if (/[eiyouů]$/.test(v)) v = v;
    else v = v + 'e';
    return 'pane ' + v;
  }
  function openMail() {
    var m = mailText(cur.data);
    $('sheet-body').innerHTML = '<div class="mail-subj">Předmět: ' + esc(m.subject) + '</div>' +
      '<textarea class="mail" id="mail-body"></textarea>' +
      '<div class="mail-actions"><button type="button" class="btn btn-primary btn-sm" id="mail-copy">Kopírovat text</button>' +
      '<a class="btn btn-outline btn-sm" id="mail-to" target="_blank" rel="noopener">Otevřít v poště</a></div>' +
      '<p class="hint" style="margin-top:10px">Přílohy (PDF smlouvy a faktura z iDokladu) přidej ručně. Text je jen návrh — před odesláním si ho přečti.</p>';
    $('mail-body').value = m.body;
    $('mail-to').href = 'mailto:' + encodeURIComponent(cur.data.guest.email || '') + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
    $('mail-copy').onclick = function () {
      navigator.clipboard.writeText($('mail-body').value).then(function () { toast('Zkopírováno.'); }, function () { $('mail-body').select(); });
    };
    $('overlay').hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeOverlay() { $('overlay').hidden = true; document.body.style.overflow = ''; $('sheet-body').innerHTML = ''; }

  /* ============ Deep link ze /sprava/ ============ */
  function handleDeepLink() {
    var qs = new URLSearchParams(location.search);
    var bid = qs.get('booking'), hid = qs.get('hold');
    if (bid) {
      var c = contractForBooking(bid);
      if (c) { openContract(c); return; }
      var b = bookingById(bid);
      if (b) { newFromBooking(b); return; }
    }
    if (hid) {
      var ch = contractForHold(hid);
      if (ch) { openContract(ch); return; }
      var h = holdById(hid);
      if (h) {
        newFromBooking(h.booking_id ? bookingById(h.booking_id) : null);
        cur.hold_id = h.id; cur.data.arrival = h.arrival; cur.data.departure = h.departure;
        if (h.guest_note && !cur.data.guest.name) cur.data.guest.name = h.guest_note;
        if (h.invoice_no) { cur.data.inv1.no = h.invoice_no; cur.data.inv1.vs = String(h.invoice_no).replace(/\D/g, ''); }
        if (h.invoice_due) cur.data.inv1.due = h.invoice_due;
        if (h.invoice_currency === 'EUR') cur.data.currency = 'EUR';
        cur.data.nightly = nightlyFor(h.arrival);
        fillForm(cur.data);
      }
    }
  }

  /* ============ Brána ============ */
  function showApp() { $('lock').hidden = true; $('app').hidden = false; }
  function lockOut(msg) {
    adminKey = null; clearKey();
    $('app').hidden = true; $('lock').hidden = false;
    if (msg) { $('lock-err').textContent = msg; $('lock-err').hidden = false; }
  }
  function attemptUnlock(token, remember) {
    token = (token || '').trim();
    if (!token) return Promise.resolve(false);
    return sha256hex(token).then(function (h) {
      if (h !== TOKEN_HASH) return false;
      adminKey = token; storeKey(token, remember); showApp(); reload();
      return true;
    });
  }

  function bindForm() {
    var f = function (id, ev, opts) { $(id).addEventListener(ev || 'input', function () { recompute(opts || {}); }); };
    f('f-lang', 'change', { langChanged: true });
    f('f-cno', 'input', { cnoEdited: true });
    f('f-name', 'input', { nameChanged: true });
    f('f-address'); f('f-phone'); f('f-email'); f('f-checkin'); f('f-checkout'); f('f-pet'); f('f-note');
    f('f-country', 'input', { countryEdited: true });
    f('f-arrival', 'change', { arrivalChanged: true });
    f('f-departure', 'change', { arrivalChanged: true });
    f('f-nightly', 'input', {});
    f('f-price', 'input', { priceEdited: true });
    f('f-currency', 'change', { fxChanged: true });
    f('f-fx', 'input', { fxChanged: true });
    $('plan-single').addEventListener('change', function () { recompute({}); });
    $('plan-split').addEventListener('change', function () { recompute({}); });
    f('f-inv1-no', 'input', { invNoEdited: true });
    f('f-inv1-vs', 'input', { vsEdited: true });
    f('f-inv1-due', 'change', {});
    f('f-inv1-amount', 'input', { inv1Edited: true });
    f('f-inv1-eur', 'input', { eurEdited: true });
    $('form').addEventListener('submit', function (e) { e.preventDefault(); });

    $('btn-back').addEventListener('click', function () { showList(); renderList(); });
    $('btn-save').addEventListener('click', function () {
      save(cur.status === 'issued' ? 'issued' : 'draft').then(function (ok) { if (ok) { toast('Uloženo.'); reload(); } });
    });
    $('btn-issue').addEventListener('click', onIssue);
    $('btn-open').addEventListener('click', function () {
      var errs = validate();
      if (errs.length) { $('form-err').textContent = 'Před tiskem doplň: ' + errs.join(', ') + '.'; $('form-err').hidden = false; return; }
      openHtml(renderHtml());
    });
    $('btn-email').addEventListener('click', openMail);
    $('btn-delete').addEventListener('click', function () {
      if (!cur.id) return;
      if (!confirm('Smazat smlouvu ' + cur.data.contractNo + '? Předrezervace ve správě zůstane.')) return;
      rpc('vr_admin_delete_contract', { p_id: cur.id }).then(function (res) {
        if (res.data && res.data.ok) { toast('Smazáno.'); showList(); reload(); } else toast('Smazání se nepodařilo.');
      });
    });
    $('btn-new').addEventListener('click', function () {
      var id = $('new-booking').value;
      var existing = id ? contractForBooking(id) : null;
      if (existing) { openContract(existing); return; }
      newFromBooking(id ? bookingById(id) : null);
    });
  }

  function initGate() {
    var stored = readStoredKey();
    var qs = new URLSearchParams(location.search);
    var keyParam = qs.get('key');

    $('lock-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      $('lock-err').hidden = true;
      attemptUnlock($('lock-input').value, $('lock-remember').checked).then(function (ok) {
        if (!ok) { $('lock-err').textContent = 'Neplatný token.'; $('lock-err').hidden = false; }
      });
    });
    $('btn-refresh').addEventListener('click', function () { reload(); });
    $('btn-lock').addEventListener('click', function () { lockOut(); $('lock-input').value = ''; });
    $('sheet-close').addEventListener('click', closeOverlay);
    $('overlay').addEventListener('click', function (e) { if (e.target === $('overlay')) closeOverlay(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('overlay').hidden) closeOverlay(); });
    bindForm();

    if (DEMO) { showApp(); reload(); return; }
    if (keyParam) {
      attemptUnlock(keyParam, false).finally(function () {
        try { qs.delete('key'); history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs.toString() : '')); } catch (e) {}
      });
    } else if (stored) {
      attemptUnlock(stored, false).then(function (ok) { if (!ok) clearKey(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGate);
  else initGate();
})();
