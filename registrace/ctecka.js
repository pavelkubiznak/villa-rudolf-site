/* Villa Rudolf — čtečka dokladu (/registrace/): foťák telefonu přečte strojově čitelnou zónu.
 *
 * Volitelná pomůcka, načítá se až po klepnutí na tlačítko (registrace.js → loadReader).
 * CO SE DĚJE S OBRAZEM: snímky z foťáku se kreslí do <canvas> v paměti prohlížeče a čte je
 * knihovna Tesseract (WebAssembly, ../vendor/tesseract/) v tomtéž prohlížeči. Obraz se nikam
 * neodesílá, neukládá (ani do localStorage / IndexedDB) a po zavření čtečky se zahodí.
 * Ven jde jen text: číslo a druh dokladu, datum narození, občanství a jméno – do formuláře,
 * kde je host vidí a může opravit, než je odešle.
 *
 * Knihovna i model jsou v repu (vendor/tesseract/), žádné CDN. Rozbor textu a kontrolní
 * číslice: mrz.js.
 */
(function () {
  'use strict';

  var BASE = new URL('../vendor/tesseract/', document.currentScript ? document.currentScript.src : location.href).href;
  var OCR_WIDTH = 1000;          // šířka výřezu pro OCR (px) – znak pak má ~25 px na výšku
  // Výřez snímku, který se čte: pruh přes celou šířku uprostřed, výška = HW × šířka videa.
  // Rámeček na obrazovce (GUIDE) je o něco menší, ať host nemusí mířit přesně.
  var CROP = { x: 0.02, w: 0.96, hw: 0.26 };
  var GUIDE = { w: 0.92, hw: 0.19 };
  // Kontrolní číslice MRZ (váhy 7-3-1, mod 10) nechytí všechno: záměna G↔6, 1↔L nebo 8↔S
  // projde a tři chyby se mohou vyrušit. Proto se výsledek bere, až když ho DVA snímky
  // přečtou shodně a OCR si je textem dost jisté.
  var MIN_CONF = 75;

  var workerP = null;            // Promise<worker> – drží se pro další osobu ve skupině
  var state = null;              // otevřená čtečka

  /* ---------- co prohlížeč umí ---------- */
  function simd() {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
        3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (e) { return false; }
  }
  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      window.Worker && window.WebAssembly && simd());
  }

  /* ---------- OCR ---------- */
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { fail(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function getWorker() {
    if (workerP) return workerP;
    workerP = loadScript(BASE + 'tesseract.min.js?v=5.1.1').then(function () {
      return window.Tesseract.createWorker('mrz', 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: BASE + 'tesseract-core-simd-lstm.wasm.js',
        langPath: BASE.replace(/\/$/, ''),
        gzip: false,
        cacheMethod: 'none'        // model nechá na běžné mezipaměti prohlížeče, ne v IndexedDB
      });
    }).then(function (w) {
      return w.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
        tessedit_pageseg_mode: '6'
      }).then(function () { return w; });
    });
    workerP.catch(function () { workerP = null; });
    return workerP;
  }

  // Výřez zdroje (video / canvas / obrázek) → šedý canvas šířky OCR_WIDTH s roztaženým kontrastem.
  function cropGray(src, sw, sh, canvas) {
    var cw = Math.round(sw * CROP.w), ch = Math.min(sh, Math.round(sw * CROP.hw));
    var cx = Math.round(sw * CROP.x), cy = Math.round((sh - ch) / 2);
    var k = OCR_WIDTH / cw;
    canvas.width = OCR_WIDTH; canvas.height = Math.round(ch * k);
    var g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
    var im = g.getImageData(0, 0, canvas.width, canvas.height), d = im.data, n = d.length;
    var hist = new Uint32Array(256), i, v;
    for (i = 0; i < n; i += 4) {
      v = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      d[i] = v; hist[v]++;
    }
    // 2. a 98. percentil → 0 a 255 (vyrovná šero i přepal)
    var total = n / 4, lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
    for (acc = 0, i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
    var span = Math.max(1, hi - lo);
    for (i = 0; i < n; i += 4) {
      v = (d[i] - lo) * 255 / span; v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(im, 0, 0);
    return canvas;
  }

  /** Jeden snímek → { r: údaje z MRZ nebo null, conf: jistota OCR 0–100 }. src: video | canvas | img. */
  function readFrame(src, sw, sh, canvas) {
    var c = cropGray(src, sw, sh, canvas || document.createElement('canvas'));
    return getWorker().then(function (w) { return w.recognize(c); }).then(function (res) {
      var d = (res && res.data) || {};
      return { r: window.VRMrz.parseMrz(String(d.text || '').split('\n'), todayIso()), conf: d.confidence || 0 };
    });
  }
  // Dva snímky se shodly? Porovnává se všechno, co jde do formuláře.
  function key(r) {
    return [r.docType, r.docNumber, r.birth, r.citizenship, r.lastName, r.firstName].join('|');
  }
  /** Postupné snímky jedné relace → výsledek, až když se dva shodnou. */
  function Agree() { this.seen = {}; }
  Agree.prototype.push = function (f) {
    if (!f || !f.r || f.conf < MIN_CONF) return null;
    var k = key(f.r);
    if (this.seen[k]) return f.r;
    this.seen[k] = true;
    return null;
  };
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- obrazovka čtečky ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** opts: { texts: {…}, onResult(údaje), onClose() } */
  function open(opts) {
    if (state) return;
    var L = opts.texts;
    var box = el('div', 'vp-scan'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', L.scanTitle);
    var head = el('p', 'vp-scan-t', L.scanTitle);
    var stage = el('div', 'vp-scan-stage');
    var video = el('video', 'vp-scan-video');
    video.setAttribute('playsinline', ''); video.muted = true; video.autoplay = true;
    var guide = el('div', 'vp-scan-guide'); guide.setAttribute('aria-hidden', 'true');
    stage.appendChild(video); stage.appendChild(guide);
    var status = el('p', 'vp-scan-status', L.scanStarting); status.setAttribute('role', 'status');
    var privacy = el('p', 'vp-scan-priv', L.scanPrivacy);
    var close = el('button', 'vp-scan-close', L.scanManual); close.type = 'button';
    box.appendChild(head); box.appendChild(stage); box.appendChild(status);
    box.appendChild(close); box.appendChild(privacy);
    box.style.top = (window.pageYOffset || 0) + 'px';
    document.body.appendChild(box);
    document.documentElement.classList.add('vp-scan-open');

    state = { box: box, video: video, stream: null, canvas: document.createElement('canvas'), agree: new Agree(),
      stopped: false, opts: opts, started: Date.now(), hinted: false, status: status, guide: guide };
    close.addEventListener('click', function () { shut(); if (opts.onClose) opts.onClose(); });
    close.focus({ preventScroll: true });

    var st = state;
    function fail(msg) { stage.hidden = true; status.textContent = msg; status.classList.add('vp-scan-fail'); }

    var cam = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    cam.then(function (stream) {
      if (st.stopped) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      st.stream = stream; video.srcObject = stream;
      return video.play().catch(function () {});
    }).then(function () {
      if (st.stopped || !st.stream) return;
      status.textContent = L.scanLoading;
      return getWorker().then(function () {
        if (st.stopped) return;
        status.textContent = L.scanAim;
        loop(st);
      }, function () { fail(L.scanErrLoad); });
    }).catch(function (e) {
      if (st.stopped) return;
      var n = e && e.name;
      fail(n === 'NotAllowedError' || n === 'SecurityError' ? L.scanErrDenied : L.scanErrNoCam);
    });
  }

  function loop(st) {
    if (st.stopped) return;
    var v = st.video;
    if (!v.videoWidth) { setTimeout(function () { loop(st); }, 200); return; }
    // rámeček přesně podle skutečného poměru stran videa
    if (!st.sized) {
      st.sized = true;
      // výška podle poměru stran videa, nejvýš 58 % výšky okna (video se pak ořízne nahoře a dole;
      // šířka zůstává celá, takže rámeček dál sedí na čtený pruh)
      var w = v.parentNode.clientWidth;
      v.parentNode.style.height = Math.round(Math.min(w * v.videoHeight / v.videoWidth, window.innerHeight * 0.58)) + 'px';
      st.guide.style.width = (GUIDE.w * 100) + '%';
      st.guide.style.aspectRatio = GUIDE.w + ' / ' + GUIDE.hw;
    }
    readFrame(v, v.videoWidth, v.videoHeight, st.canvas).then(function (f) {
      if (st.stopped) return;
      var r = st.agree.push(f);
      if (r) { var cb = st.opts.onResult; shut(); cb(r); return; }
      if (f.r) st.status.textContent = st.opts.texts.scanHold;
      if (!st.hinted && Date.now() - st.started > 20000) {
        st.hinted = true; st.status.textContent = st.opts.texts.scanSlow;
      }
      setTimeout(function () { loop(st); }, 120);
    }).catch(function () {
      if (st.stopped) return;
      st.status.textContent = st.opts.texts.scanErrLoad;
    });
  }

  function shut() {
    var st = state; if (!st) return;
    st.stopped = true; state = null;
    if (st.stream) st.stream.getTracks().forEach(function (t) { t.stop(); });
    st.video.srcObject = null;
    st.canvas.width = st.canvas.height = 0;            // poslední snímek pryč z paměti
    if (st.box.parentNode) st.box.parentNode.removeChild(st.box);
    document.documentElement.classList.remove('vp-scan-open');
  }

  window.VRCtecka = { supported: supported, open: open, close: shut,
    readFrame: readFrame, Agree: Agree, preload: getWorker };       // poslední tři jen pro zkoušky
})();
