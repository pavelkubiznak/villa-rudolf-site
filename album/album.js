/* Villa Rudolf — album pobytu (/album/) — PROTOTYP.
 * Sdílené soukromé fotoalbum skupiny. Přístup přes ?t=<token>.
 * album_id = sha256(token).hex[:16] (derivováno server-side v SECURITY DEFINER RPC).
 * Úložiště: Supabase Storage, privátní bucket vr-album, čtení přes krátké signed URL.
 * Zápis/čtení metadat výhradně přes RPC vr_album_* (anon key, RLS-on tabulka bez anon policy).
 * Bez knihoven, vanilla JS.
 */
(function () {
  'use strict';

  var CFG = {
    SUPABASE_URL: 'https://fpknbrzbqpalguajskut.supabase.co',
    // Veřejný anon klíč (stejný jako guest průvodce). Vše chrání RLS + SECURITY DEFINER RPC.
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA',
    BUCKET: 'vr-album',
    MAX_BYTES: 15 * 1024 * 1024,
    MAX_EDGE: 2000,       // klientská komprese na max delší hranu (px)
    JPEG_Q: 0.85,
    SIGN_TTL: 3600        // platnost signed URL (s)
  };

  /* ---------- i18n (jen UI rámec) ---------- */
  var T = {
    cs: {
      brandBadge: 'Album pobytu', eyebrow: 'Villa Rudolf · Krkonoše',
      gateTitle: 'Album pobytu',
      gateBody: 'Album se otevírá jen přes odkaz z vašeho pobytu. Naskenujte QR kód ve vile nebo použijte odkaz, který jste dostali.',
      title: 'Sdílené album pobytu',
      intro: 'Nahrajte sem fotky z pobytu — z výletů, grilování, od rodiny. Album je soukromé: vidí ho jen vaše skupina, veřejnost ani vyhledávače ne.',
      nick: 'Vaše přezdívka (nepovinné)', nickPh: 'např. Katka',
      guardConsent: 'Potvrzuji, že mám souhlas zákonných zástupců všech osob na fotkách.',
      addPhotos: 'Přidat fotky',
      upHint: 'Jen obrázky, do 15 MB. Velké fotky se před nahráním zmenší.',
      dlAll: 'Stáhnout vše',
      consentNote: 'Zaškrtnutím „Villa Rudolf smí použít“ dovolíte majiteli použít fotku na webu / Instagramu. Bez zaškrtnutí ji majitel nikdy neuvidí.',
      consentLabel: 'Villa Rudolf smí tuto fotku použít (web / Instagram)',
      empty: 'Zatím tu nejsou žádné fotky. Buďte první!',
      proto: 'Prototyp alba', mine: 'vaše', del: 'Smazat',
      count1: 'fotka', count234: 'fotky', count5: 'fotek',
      byUnknown: '', by: 'nahrál/a ',
      errGuard: 'Nejdřív prosím potvrďte souhlas zákonných zástupců.',
      errType: 'Tohle není obrázek: ', errBig: 'Soubor je příliš velký (max 15 MB): ',
      errUpload: 'Nahrání selhalo. Zkuste to prosím znovu.',
      confirmDel: 'Opravdu smazat tuto fotku?',
      uploading: 'Nahrávám', of: 'z'
    },
    en: {
      brandBadge: 'Stay album', eyebrow: 'Villa Rudolf · Giant Mountains',
      gateTitle: 'Stay album',
      gateBody: 'The album only opens through the link for your stay. Scan the QR code at the villa or use the link you were given.',
      title: 'Shared stay album',
      intro: 'Upload your photos from the stay — trips, barbecue, family shots. The album is private: only your group can see it, not the public or search engines.',
      nick: 'Your nickname (optional)', nickPh: 'e.g. Kate',
      guardConsent: 'I confirm I have the consent of the legal guardians of everyone in the photos.',
      addPhotos: 'Add photos',
      upHint: 'Images only, up to 15 MB. Large photos are resized before upload.',
      dlAll: 'Download all',
      consentNote: 'Ticking “Villa Rudolf may use” lets the owner use the photo on the website / Instagram. Without the tick the owner never sees it.',
      consentLabel: 'Villa Rudolf may use this photo (website / Instagram)',
      empty: 'No photos yet. Be the first!',
      proto: 'Album prototype', mine: 'yours', del: 'Delete',
      count1: 'photo', count234: 'photos', count5: 'photos',
      byUnknown: '', by: 'by ',
      errGuard: 'Please confirm the guardians’ consent first.',
      errType: 'This is not an image: ', errBig: 'File too large (max 15 MB): ',
      errUpload: 'Upload failed. Please try again.',
      confirmDel: 'Really delete this photo?',
      uploading: 'Uploading', of: 'of'
    },
    de: {
      brandBadge: 'Aufenthalts-Album', eyebrow: 'Villa Rudolf · Riesengebirge',
      gateTitle: 'Aufenthalts-Album',
      gateBody: 'Das Album öffnet sich nur über den Link zu Ihrem Aufenthalt. Scannen Sie den QR-Code in der Villa oder nutzen Sie den erhaltenen Link.',
      title: 'Gemeinsames Aufenthalts-Album',
      intro: 'Laden Sie hier Ihre Fotos vom Aufenthalt hoch — von Ausflügen, vom Grillen, von der Familie. Das Album ist privat: nur Ihre Gruppe sieht es, nicht die Öffentlichkeit oder Suchmaschinen.',
      nick: 'Ihr Spitzname (optional)', nickPh: 'z. B. Kati',
      guardConsent: 'Ich bestätige, dass ich die Zustimmung der Erziehungsberechtigten aller abgebildeten Personen habe.',
      addPhotos: 'Fotos hinzufügen',
      upHint: 'Nur Bilder, bis 15 MB. Große Fotos werden vor dem Upload verkleinert.',
      dlAll: 'Alle herunterladen',
      consentNote: 'Mit „Villa Rudolf darf verwenden“ erlauben Sie dem Eigentümer die Nutzung des Fotos auf Website / Instagram. Ohne Häkchen sieht es der Eigentümer nie.',
      consentLabel: 'Villa Rudolf darf dieses Foto verwenden (Website / Instagram)',
      empty: 'Noch keine Fotos. Seien Sie die/der Erste!',
      proto: 'Album-Prototyp', mine: 'Ihres', del: 'Löschen',
      count1: 'Foto', count234: 'Fotos', count5: 'Fotos',
      byUnknown: '', by: 'von ',
      errGuard: 'Bitte bestätigen Sie zuerst die Zustimmung der Erziehungsberechtigten.',
      errType: 'Das ist kein Bild: ', errBig: 'Datei zu groß (max 15 MB): ',
      errUpload: 'Upload fehlgeschlagen. Bitte erneut versuchen.',
      confirmDel: 'Dieses Foto wirklich löschen?',
      uploading: 'Lade hoch', of: 'von'
    },
    pl: {
      brandBadge: 'Album pobytu', eyebrow: 'Villa Rudolf · Karkonosze',
      gateTitle: 'Album pobytu',
      gateBody: 'Album otwiera się tylko przez link do Twojego pobytu. Zeskanuj kod QR w willi lub użyj otrzymanego linku.',
      title: 'Wspólny album pobytu',
      intro: 'Dodaj tu zdjęcia z pobytu — z wycieczek, grilla, rodzinne. Album jest prywatny: widzi go tylko Twoja grupa, nie publiczność ani wyszukiwarki.',
      nick: 'Twój pseudonim (opcjonalnie)', nickPh: 'np. Kasia',
      guardConsent: 'Potwierdzam, że mam zgodę opiekunów prawnych wszystkich osób na zdjęciach.',
      addPhotos: 'Dodaj zdjęcia',
      upHint: 'Tylko obrazy, do 15 MB. Duże zdjęcia są zmniejszane przed wysłaniem.',
      dlAll: 'Pobierz wszystko',
      consentNote: 'Zaznaczając „Villa Rudolf może użyć” pozwalasz właścicielowi użyć zdjęcia na stronie / Instagramie. Bez zaznaczenia właściciel nigdy go nie zobaczy.',
      consentLabel: 'Villa Rudolf może użyć tego zdjęcia (strona / Instagram)',
      empty: 'Nie ma jeszcze zdjęć. Bądź pierwszy!',
      proto: 'Prototyp albumu', mine: 'Twoje', del: 'Usuń',
      count1: 'zdjęcie', count234: 'zdjęcia', count5: 'zdjęć',
      byUnknown: '', by: 'dodał(a) ',
      errGuard: 'Najpierw potwierdź zgodę opiekunów prawnych.',
      errType: 'To nie jest obraz: ', errBig: 'Plik za duży (maks 15 MB): ',
      errUpload: 'Wysyłanie nie powiodło się. Spróbuj ponownie.',
      confirmDel: 'Na pewno usunąć to zdjęcie?',
      uploading: 'Wysyłam', of: 'z'
    }
  };

  /* ---------- Stav ---------- */
  var qs = new URLSearchParams(location.search);
  var token = (qs.get('t') || '').trim();
  var lang = 'cs';
  var albumId = null;
  var photos = [];        // [{id, storage_path, uploader_label, consent_marketing, created_at}]
  var mineSet = new Set(); // id fotek nahraných z tohoto zařízení

  var $ = function (id) { return document.getElementById(id); };
  function t(k) { return (T[lang] && T[lang][k] != null) ? T[lang][k] : T.cs[k]; }

  /* ---------- localStorage ---------- */
  function mineKey() { return 'vrAlbumMine_' + albumId; }
  function loadMine() {
    mineSet = new Set();
    try {
      var a = JSON.parse(localStorage.getItem(mineKey()) || '[]');
      if (Array.isArray(a)) a.forEach(function (x) { mineSet.add(x); });
    } catch (e) { }
  }
  function saveMine() { try { localStorage.setItem(mineKey(), JSON.stringify(Array.from(mineSet))); } catch (e) { } }
  function getNick() { try { return localStorage.getItem('vrAlbumNick') || ''; } catch (e) { return ''; } }
  function setNick(v) { try { localStorage.setItem('vrAlbumNick', v); } catch (e) { } }

  /* ---------- API ---------- */
  function rpc(name, body) {
    return fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }
  function storageUpload(path, blob, type) {
    return fetch(CFG.SUPABASE_URL + '/storage/v1/object/' + CFG.BUCKET + '/' + path, {
      method: 'POST',
      headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY, 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'false' },
      body: blob
    }).then(function (r) { if (!r.ok) throw new Error('upload'); return r.json(); });
  }
  function storageDelete(path) {
    return fetch(CFG.SUPABASE_URL + '/storage/v1/object/' + CFG.BUCKET + '/' + path, {
      method: 'DELETE',
      headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY }
    }).catch(function () { });
  }
  function bulkSign(paths) {
    if (!paths.length) return Promise.resolve({});
    return fetch(CFG.SUPABASE_URL + '/storage/v1/object/sign/' + CFG.BUCKET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify({ expiresIn: CFG.SIGN_TTL, paths: paths })
    }).then(function (r) { return r.json(); }).then(function (arr) {
      var map = {};
      (arr || []).forEach(function (x) { if (x && x.signedURL) map[x.path] = CFG.SUPABASE_URL + '/storage/v1' + x.signedURL; });
      return map;
    }).catch(function () { return {}; });
  }

  /* ---------- Komprese ---------- */
  function extOf(file, fallback) {
    var m = /\.([a-z0-9]{2,5})$/i.exec(file.name || '');
    if (m) return m[1].toLowerCase();
    var mt = (file.type || '').split('/')[1];
    return (mt || fallback || 'jpg').toLowerCase();
  }
  function compress(file) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type || '')) { resolve(null); return; }
      var done = function (blob, ext, type) { resolve({ blob: blob, ext: ext, type: type }); };
      var fallback = function () { done(file, extOf(file, 'jpg'), file.type || 'application/octet-stream'); };
      if (!('createImageBitmap' in window)) { fallback(); return; }
      createImageBitmap(file).then(function (bmp) {
        var w = bmp.width, h = bmp.height, max = CFG.MAX_EDGE;
        if (Math.max(w, h) > max) { var s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(bmp, 0, 0, w, h);
        if (bmp.close) bmp.close();
        c.toBlob(function (blob) {
          if (blob && blob.size < file.size) done(blob, 'jpg', 'image/jpeg');
          else fallback();
        }, 'image/jpeg', CFG.JPEG_Q);
      }).catch(fallback);
    });
  }
  function randName(ext) {
    var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(16).slice(2));
    return id + '.' + ext;
  }

  /* ---------- Render ---------- */
  function countLabel(n) {
    var word;
    if (n === 1) word = t('count1');
    else if (n >= 2 && n <= 4) word = t('count234');
    else word = t('count5');
    return n + ' ' + word;
  }

  function render() {
    var grid = $('grid');
    grid.innerHTML = '';
    $('count').textContent = countLabel(photos.length);
    $('empty').hidden = photos.length !== 0;
    $('dlAll').hidden = photos.length === 0;

    // signed URL pro všechny cesty jednou dávkou
    var paths = photos.map(function (p) { return p.storage_path; });
    bulkSign(paths).then(function (urls) {
      photos.forEach(function (p) {
        var url = urls[p.storage_path] || '';
        var mine = mineSet.has(p.id);
        var card = document.createElement('div');
        card.className = 'va-card';

        var thumb = document.createElement('div');
        thumb.className = 'va-thumb';
        var img = document.createElement('img');
        // eager: lazy-loaded thumbnaily se v některých kontextech (in-app webview,
        // krátká stránka) nespustí; pro prototyp nahráváme thumbnaily rovnou.
        img.decoding = 'async'; img.alt = ''; img.src = url;
        thumb.appendChild(img);
        if (mine) { var b = document.createElement('span'); b.className = 'va-mine-badge'; b.textContent = t('mine'); thumb.appendChild(b); }
        thumb.addEventListener('click', function () { openLightbox(url); });
        card.appendChild(thumb);

        var meta = document.createElement('div');
        meta.className = 'va-cardmeta';

        var up = document.createElement('p');
        up.className = 'va-uploader';
        up.textContent = p.uploader_label ? (t('by') + p.uploader_label) : '';
        meta.appendChild(up);

        // souhlas s marketingem — editovatelný jen u vlastní fotky
        var lab = document.createElement('label');
        lab.className = 'va-consent' + (p.consent_marketing ? ' is-on' : '') + (mine ? '' : ' is-ro');
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !!p.consent_marketing; cb.disabled = !mine;
        cb.addEventListener('change', function () { onConsent(p, cb, lab); });
        var span = document.createElement('span'); span.textContent = t('consentLabel');
        lab.appendChild(cb); lab.appendChild(span);
        meta.appendChild(lab);

        if (mine) {
          var del = document.createElement('button');
          del.type = 'button'; del.className = 'va-delete';
          del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
          var dspan = document.createElement('span'); dspan.textContent = t('del'); del.appendChild(dspan);
          del.addEventListener('click', function () { onDelete(p); });
          meta.appendChild(del);
        }

        card.appendChild(meta);
        grid.appendChild(card);
      });
    });
  }

  function onConsent(p, cb, lab) {
    var val = cb.checked;
    lab.classList.toggle('is-on', val);
    rpc('vr_album_set_consent', { p_token: token, p_photo_id: p.id, p_consent: val }).then(function (res) {
      if (!res || res.ok !== true) { cb.checked = !val; lab.classList.toggle('is-on', !val); }
      else { p.consent_marketing = val; }
    }).catch(function () { cb.checked = !val; lab.classList.toggle('is-on', !val); });
  }

  function onDelete(p) {
    if (!window.confirm(t('confirmDel'))) return;
    rpc('vr_album_delete', { p_token: token, p_photo_id: p.id }).then(function (res) {
      if (res && res.ok === true) {
        storageDelete(p.storage_path);
        mineSet.delete(p.id); saveMine();
        photos = photos.filter(function (x) { return x.id !== p.id; });
        render();
      }
    });
  }

  function openLightbox(url) {
    if (!url) return;
    $('lbImg').src = url;
    $('lightbox').hidden = false;
  }
  function closeLightbox() { $('lightbox').hidden = true; $('lbImg').src = ''; }

  /* ---------- Upload flow ---------- */
  function showErr(msg) { var e = $('err'); e.textContent = msg; e.hidden = false; }
  function clearErr() { $('err').hidden = true; }

  function handleFiles(files) {
    clearErr();
    if (!$('guardConsent').checked) { showErr(t('errGuard')); return; }
    var list = Array.prototype.slice.call(files);
    if (!list.length) return;

    var nick = ($('nick').value || '').trim().slice(0, 60);
    if (nick) setNick(nick);

    var prog = $('progress'), bar = $('progressBar'), txt = $('progressTxt');
    prog.hidden = false;
    $('addBtn').disabled = true;
    var total = list.length, done = 0, added = [];

    function step(i) {
      if (i >= total) {
        prog.hidden = true; $('addBtn').disabled = false;
        bar.style.width = '0%';
        if (added.length) { photos = photos.concat(added); added.forEach(function (a) { mineSet.add(a.id); }); saveMine(); render(); }
        return;
      }
      var file = list[i];
      txt.textContent = t('uploading') + ' ' + (i + 1) + ' ' + t('of') + ' ' + total + '…';
      // validace
      if (!/^image\//.test(file.type || '')) { showErr(t('errType') + (file.name || '')); done++; bar.style.width = Math.round(done / total * 100) + '%'; step(i + 1); return; }
      if (file.size > CFG.MAX_BYTES) { showErr(t('errBig') + (file.name || '')); done++; bar.style.width = Math.round(done / total * 100) + '%'; step(i + 1); return; }

      compress(file).then(function (out) {
        if (!out) throw new Error('type');
        var path = albumId + '/' + randName(out.ext);
        return storageUpload(path, out.blob, out.type).then(function () {
          return rpc('vr_album_add', { p_token: token, p_storage_path: path, p_uploader_label: nick || null, p_consent_marketing: false })
            .then(function (res) {
              if (res && res.ok === true) {
                added.push({ id: res.id, storage_path: path, uploader_label: nick || null, consent_marketing: false, created_at: new Date().toISOString() });
              } else {
                storageDelete(path); // úklid osiřelého souboru, když metadata selžou
              }
            });
        });
      }).catch(function () { showErr(t('errUpload')); })
        .then(function () { done++; bar.style.width = Math.round(done / total * 100) + '%'; step(i + 1); });
    }
    step(0);
  }

  /* ---------- Download all (P1: jednotlivá stažení přes signed URL) ---------- */
  function downloadAll() {
    if (!photos.length) return;
    var btn = $('dlAll'); btn.disabled = true;
    var paths = photos.map(function (p) { return p.storage_path; });
    bulkSign(paths).then(function (urls) {
      var i = 0;
      function next() {
        if (i >= photos.length) { btn.disabled = false; return; }
        var p = photos[i]; var url = urls[p.storage_path];
        if (url) {
          fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
            var a = document.createElement('a');
            var obj = URL.createObjectURL(blob);
            a.href = obj;
            a.download = (p.storage_path.split('/').pop()) || ('foto-' + (i + 1) + '.jpg');
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(obj); }, 4000);
            i++; setTimeout(next, 400);
          }).catch(function () { i++; next(); });
        } else { i++; next(); }
      }
      next();
    });
  }

  /* ---------- i18n aplikace ---------- */
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n'); if (T[lang] && T[lang][k] != null) el.textContent = T[lang][k];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph'); if (T[lang] && T[lang][k] != null) el.setAttribute('placeholder', T[lang][k]);
    });
    document.querySelectorAll('.va-lang').forEach(function (b) { b.setAttribute('data-on', String(b.getAttribute('data-lang') === lang)); });
    if (albumId) render();
  }
  function pickLang() {
    var q = (qs.get('lang') || '').toLowerCase();
    var ls = null; try { ls = localStorage.getItem('vrLang'); } catch (e) { }
    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    lang = T[q] ? q : (ls && T[ls]) ? ls : (T[nav] ? nav : 'cs');
  }

  /* ---------- Init ---------- */
  function initAlbum() {
    $('albumView').hidden = false;
    $('nick').value = getNick();
    rpc('vr_album_open', { p_token: token }).then(function (res) {
      if (!res || res.ok !== true) { // token nevalidní / chyba -> chovej se jako gate
        $('albumView').hidden = true; $('gateView').hidden = false; $('loading').hidden = true; return;
      }
      albumId = res.album_id;
      loadMine();
      return rpc('vr_album_list', { p_token: token }).then(function (r2) {
        photos = (r2 && r2.photos) ? r2.photos : [];
        $('loading').hidden = true;
        render();
      });
    }).catch(function () { $('loading').hidden = true; });
  }

  function wire() {
    document.querySelectorAll('.va-lang').forEach(function (b) {
      b.addEventListener('click', function () { lang = b.getAttribute('data-lang'); try { localStorage.setItem('vrLang', lang); } catch (e) { } applyLang(); });
    });
    $('addBtn').addEventListener('click', function () { clearErr(); if (!$('guardConsent').checked) { showErr(t('errGuard')); return; } $('fileInput').click(); });
    $('fileInput').addEventListener('change', function (e) { handleFiles(e.target.files); e.target.value = ''; });
    $('dlAll').addEventListener('click', downloadAll);
    $('lbClose').addEventListener('click', closeLightbox);
    $('lightbox').addEventListener('click', function (e) { if (e.target === $('lightbox')) closeLightbox(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });
  }

  /* ---------- Start ---------- */
  pickLang();
  wire();
  applyLang();
  if (!token) {
    $('gateView').hidden = false;
    $('loading').hidden = true;
  } else {
    initAlbum();
  }
})();
