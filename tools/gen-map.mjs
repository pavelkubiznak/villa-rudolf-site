/* Generátor kreslené mapy okolí pro sekci #lokalita.
   JEDNORÁZOVÝ skript — výstup se vkládá do index.html a commituje.
   Za běhu se NESPOUŠTÍ. Žádné závislosti, žádný Math.random() (deterministické).

     node tools/gen-map.mjs > /tmp/map.svg

   Projekce (izotropní, kx = cos 50,6255° = 0,63437):
     X(lon) = (lon − 15,585) × 2127,6
     Y(lat) = (50,765 − lat) × 3348
   Měřítko 30,13 px = 1 km, výřez 33,2 × 23,2 km, viewBox 1000×700.

   Popisky NEJSOU v SVG natvrdo — každý <text> nese data-t a text doplní
   i18n průchod v site.js (klíče lokalita.mapLabels.*). Barvy jdou přes
   CSS proměnné --vr-map-*, takže se mapa v zimě „zasněží". */

const X = (lon) => +((lon - 15.585) * 2127.6).toFixed(0);
const Y = (lat) => +((50.765 - lat) * 3348).toFixed(0);

/* ring: foot | car | day  ·  prio: 1 = vždy, 2 = skryté pod 720 px
   side: r = popisek vpravo, l = vlevo (text-anchor:end), u = nad bodem */
const POINTS = [
  { id: 'snezka',      lat: 50.7359, lon: 15.7400, ring: 'car',  prio: 1, side: 'r', meta: true },
  { id: 'obriDul',     lat: 50.7050, lon: 15.7250, ring: 'car',  prio: 2, side: 'r', meta: false },
  { id: 'pec',         lat: 50.6935, lon: 15.7305, ring: 'car',  prio: 1, side: 'r', meta: true },
  { id: 'cernaHora',   lat: 50.6640, lon: 15.7420, ring: 'car',  prio: 1, side: 'r', meta: true },
  { id: 'hmarsov',     lat: 50.6620, lon: 15.8130, ring: 'car',  prio: 2, side: 'r', meta: false },
  { id: 'janskeLazne', lat: 50.6350, lon: 15.7800, ring: 'foot', prio: 1, side: 'l', meta: true },
  { id: 'rychory',     lat: 50.6480, lon: 15.8600, ring: 'car',  prio: 2, side: 'l', meta: false },
  { id: 'mladeBuky',   lat: 50.6000, lon: 15.8480, ring: 'car',  prio: 2, side: 'l', meta: false },
  { id: 'trutnov',     lat: 50.5610, lon: 15.9130, ring: 'car',  prio: 1, side: 'u', meta: true },
];
const VILLA = { lat: 50.6255, lon: 15.8136 };

const EXITS = [
  // x,y = pata šipky u okraje rámu; dx,dy = směr ven
  { id: 'praha',     x: 96,  y: 632, dx: -22, dy: 16,  prio: 1, anchor: 'start', tx: 6,   ty: 26 },
  { id: 'vratislav', x: 904, y: 78,  dx: 22,  dy: -16, prio: 1, anchor: 'end',   tx: -6,  ty: -26 },
  { id: 'drazdany',  x: 96,  y: 78,  dx: -22, dy: -16, prio: 1, anchor: 'start', tx: 6,   ty: -26 },
  { id: 'adrspach',  x: 918, y: 430, dx: 26,  dy: 0,   prio: 2, anchor: 'end',   tx: -8,  ty: -14 },
  { id: 'safari',    x: 430, y: 654, dx: 0,   dy: 26,  prio: 2, anchor: 'middle', tx: 0,  ty: -14 },
];

const vx = X(VILLA.lon), vy = Y(VILLA.lat);
const e = (s) => String(s);
const out = [];
const p = (s) => out.push(s);

p(`<svg class="vr-lokmap-svg" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="vrMapTitle">`);
p(`  <title id="vrMapTitle" data-t="lokalita.mapAlt">Kreslená mapa okolí Villa Rudolf</title>`);
p(`  <defs>`);
p(`    <pattern id="vrDots" width="14" height="14" patternUnits="userSpaceOnUse">`);
p(`      <circle cx="7" cy="7" r=".6" fill="var(--vr-map-ink)"></circle>`);
p(`    </pattern>`);
p(`    <radialGradient id="vrGlow" cx="50%" cy="50%" r="50%">`);
p(`      <stop offset="0%" stop-color="var(--vr-ember)" stop-opacity=".55"></stop>`);
p(`      <stop offset="100%" stop-color="var(--vr-ember)" stop-opacity="0"></stop>`);
p(`    </radialGradient>`);
p(`    <path id="vrRingArc" d="M${vx - 90},${vy} A90,90 0 0 1 ${vx + 90},${vy}" fill="none"></path>`);
p(`  </defs>`);

/* 1 — papír */
p(`  <rect width="1000" height="700" fill="var(--vr-map-paper)"></rect>`);
p(`  <rect width="1000" height="700" fill="url(#vrDots)" opacity=".05"></rect>`);

/* 2 — hřebeny (vrchol prostřední vrstvy sedí přesně na bodu Sněžky) */
p(`  <g class="vr-map-ridges" fill="var(--vr-map-ridge)">`);
p(`    <path opacity=".10" d="M0,150 C120,60 240,120 360,70 C480,20 620,110 760,60 C862,25 940,80 1000,55 L1000,0 L0,0 Z"></path>`);
p(`    <path opacity=".16" d="M0,190 C110,150 230,140 ${X(15.74)},${Y(50.7359)} C430,55 560,150 700,120 C820,95 920,140 1000,115 L1000,0 L0,0 Z"></path>`);
p(`    <path opacity=".24" d="M0,250 C140,215 260,250 400,215 C540,180 660,240 800,210 C890,190 950,215 1000,205 L1000,0 L0,0 Z"></path>`);
p(`  </g>`);

/* 3 — údolí Úpy */
p(`  <path d="M310,239 C380,280 470,300 485,345 C495,390 470,430 ${vx},${vy} C500,505 545,515 560,552 C578,600 650,640 698,683" fill="none" stroke="var(--vr-map-water)" stroke-width="2.6" opacity=".7" stroke-linecap="round"></path>`);
p(`  <text class="vr-map-river" data-prio="2" data-t="lokalita.mapLabels.upa" x="516" y="410" fill="var(--vr-map-water)">Úpa</text>`);

/* 4 — silnice */
p(`  <g fill="none" stroke="var(--vr-map-road)" stroke-width="2.2" opacity=".5" stroke-linecap="round">`);
p(`    <path d="M${vx},${vy} C460,455 435,450 415,435 C390,410 350,375 334,338"></path>`);
p(`    <path d="M${vx},${vy} C490,420 486,380 485,345 C460,300 330,280 310,239"></path>`);
p(`    <path d="M${vx},${vy} C510,500 540,520 560,552 C600,600 660,650 698,683"></path>`);
p(`  </g>`);

/* 5 — hranice s Polskem */
p(`  <path d="M120,165 C200,140 260,95 330,80 C420,60 490,120 560,140 C660,168 760,150 880,120" fill="none" stroke="var(--vr-map-ink)" stroke-width="1.4" stroke-dasharray="7 6" opacity=".45"></path>`);
p(`  <text class="vr-map-country" data-t="lokalita.mapLabels.polsko" x="300" y="46" fill="var(--vr-map-ink)" opacity=".55">POLSKO</text>`);

/* 6 — kroužek „pěšky od brány" (r = 3 km) */
p(`  <circle cx="${vx}" cy="${vy}" r="90" fill="none" stroke="var(--vr-map-ring)" stroke-width="1.2" stroke-dasharray="4 6" opacity=".8"></circle>`);
p(`  <text class="vr-map-ringlbl" fill="var(--vr-map-ring)"><textPath href="#vrRingArc" startOffset="50%" text-anchor="middle" data-t="lokalita.mapLabels.ring">PĚŠKY OD BRÁNY</textPath></text>`);

/* 7 — cíle */
for (const pt of POINTS) {
  const x = X(pt.lon), y = Y(pt.lat);
  const anchor = pt.side === 'l' ? ' text-anchor="end"' : pt.side === 'u' ? ' text-anchor="end"' : '';
  const dx = pt.side === 'l' || pt.side === 'u' ? -10 : 10;
  const ny = pt.side === 'u' ? y - 16 : y + 1;
  p(`  <g class="vr-mp" data-ring="${pt.ring}" data-prio="${pt.prio}">`);
  p(`    <circle cx="${x}" cy="${y}" r="4" fill="var(--vr-map-ink)" stroke="var(--vr-map-paper)" stroke-width="1.5"></circle>`);
  p(`    <text class="vr-mp-name" x="${x + dx}" y="${ny}"${anchor} data-t="lokalita.mapLabels.${pt.id}" fill="var(--vr-map-ink)">${pt.id}</text>`);
  if (pt.meta) p(`    <text class="vr-mp-meta" x="${x + dx}" y="${ny + 14}"${anchor} data-t="lokalita.mapLabels.${pt.id}Meta" fill="var(--vr-accent-photo)">–</text>`);
  p(`  </g>`);
}

/* 8 — vila */
p(`  <g class="vr-map-villa-g">`);
p(`    <circle class="vr-map-glow" cx="${vx}" cy="${vy}" r="26" fill="url(#vrGlow)"></circle>`);
p(`    <circle class="vr-map-wave" cx="${vx}" cy="${vy}" r="12" fill="none" stroke="var(--vr-ember)" stroke-width="1.4" opacity="0"></circle>`);
p(`    <path d="M${vx},${vy - 12} L${vx + 11},${vy} L${vx},${vy + 12} L${vx - 11},${vy} Z" fill="var(--vr-ember)" stroke="var(--vr-map-paper)" stroke-width="1.5"></path>`);
p(`    <text class="vr-map-villa" x="${vx}" y="${vy + 34}" text-anchor="middle" data-t="lokalita.mapLabels.villa" fill="var(--vr-map-ink)">Villa Rudolf</text>`);
p(`    <text class="vr-map-villasub" x="${vx}" y="${vy + 49}" text-anchor="middle" data-t="lokalita.mapLabels.villaSub" fill="var(--vr-map-ink)" opacity=".7">Svoboda nad Úpou</text>`);
p(`  </g>`);

/* 9 — okrajové šipky */
for (const x of EXITS) {
  const ex = x.x + x.dx, ey = x.y + x.dy;
  p(`  <g class="vr-mexit" data-prio="${x.prio}">`);
  p(`    <path d="M${x.x},${x.y} L${ex},${ey}" stroke="var(--vr-map-ink)" stroke-width="1.2" opacity=".5" stroke-linecap="round"></path>`);
  p(`    <circle cx="${ex}" cy="${ey}" r="2.4" fill="var(--vr-map-ink)" opacity=".6"></circle>`);
  p(`    <text class="vr-mexit-lbl" x="${x.x + x.tx}" y="${x.y + x.ty}" text-anchor="${x.anchor}" data-t="lokalita.mapLabels.${x.id}" fill="var(--vr-map-ink)" opacity=".72">${x.id}</text>`);
  p(`  </g>`);
}

/* 10 — měřítko + severka (30,13 px = 1 km → 60,3 px = 2 km) */
p(`  <g class="vr-map-scale" data-prio="2" opacity=".6">`);
p(`    <path d="M840,664 L900.3,664 M840,660 L840,668 M900.3,660 L900.3,668" stroke="var(--vr-map-ink)" stroke-width="1.2"></path>`);
p(`    <text class="vr-map-scalelbl" x="870" y="654" text-anchor="middle" data-t="lokalita.mapLabels.scale" fill="var(--vr-map-ink)">0 — 2 km</text>`);
p(`  </g>`);
p(`  <g class="vr-map-north" opacity=".6">`);
p(`    <path d="M954,660 L954,624 M954,624 L950,632 M954,624 L958,632" stroke="var(--vr-map-ink)" stroke-width="1.2" fill="none" stroke-linecap="round"></path>`);
p(`    <text class="vr-map-northlbl" x="954" y="618" text-anchor="middle" data-t="lokalita.mapLabels.north" fill="var(--vr-map-ink)">S</text>`);
p(`  </g>`);
p(`</svg>`);

console.log(out.join('\n'));
console.error('Villa: ' + vx + ',' + vy + '  Sněžka: ' + X(15.74) + ',' + Y(50.7359) + '  Trutnov: ' + X(15.913) + ',' + Y(50.561));
