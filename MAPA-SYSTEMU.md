# Villa Rudolf — mapa systému

**Tohle je jediné místo, kde je napsáno, co kde běží.** Než začneš cokoli programovat nebo
navrhovat — ať jsi člověk nebo AI session — přečti si tuhle tabulku. Systém je rozdělený do
několika repozitářů a bez mapy se v nich nedá poznat, které je živé.

Aktualizováno: 13. 8. 2026

## Součásti

| Repo | Co dělá | Kde běží | Stav |
|---|---|---|---|
| **villa-rudolf-site** ← *jsi tady* | Web + celý provozní systém: `/sprava/` (majitel), `/registrace/` (evidence hostů), `/checkin/`, `/album/`, `/vylety/`, `/pruvodce/`. Supabase migrace v `supabase/migrations/`. | **villarudolf.com** | 🟢 **ŽIVÉ JÁDRO** |
| **villa-booking-calendar** | Kalendář rezervací: `index.html` pro úklid, `owner.html` pro majitele (tržby, token). Actionem každé 3 h stahuje iCal a publikuje `data/feed.ics` + `data/history.json`. | pavelkubiznak.github.io/villa-booking-calendar/ | 🟢 živé — **dodavatel dat** |
| **villa-rudolf-portal** | Průvodce pro hosty (PWA, `?t=<token>`). Drží `data/trips.json` (katalog výletů) a `data/forecast.json` (počasí, cron na Hetzneru). | pavelkubiznak.github.io/villa-rudolf-portal/ | 🟡 živé — **jen zdroj dat**, role se překrývá se `site` |
| villa-rudolf-vylety | Staré stránky výletů pro konkrétní hosty | GitHub Pages | 🔴 nahrazeno `site/vylety/` |
| villa-rudolf-web *(privátní)* | Opuštěný pokus o vícejazyčný web a rezervační platformu (Next.js + drizzle) | neběží | 🔴 opuštěno 28. 6. 2026 |
| villa-rudolf-cedule-22 | Podklady pro ceduli „22:00" (výroba) | GitHub Pages | ⚪ hotový výrobek, needituje se |

## Jak data tečou

```
  platformy (Airbnb · Booking · FeWo · e-chalupy)
        │  iCal
        ▼
  villa-booking-calendar ──── data/history.json ────┐   (veřejné, ANONYMIZOVANÉ:
        │  Action každé 3 h                          │    uidh, termín, platforma —
        ▼                                            │    žádná jména hostů)
  kalendář pro úklid + owner.html (tržby)            │
                                                     ▼
  villa-rudolf-portal ── trips.json ──▶  villa-rudolf-site  /sprava/
       forecast.json                            │  admin: rezervace, kontakty, zprávy
                                                ▼
                                     Supabase  fpknbrzbqpalguajskut
                                     (vr_* tabulky a funkce — PII hostů)
                                                ▲
                                     /registrace/ · /checkin/ · /album/
```

## Kdo vlastní kterou pravdu

| Fakt | Vlastník | Pozn. |
|---|---|---|
| **KDY** — termín pobytu, platforma | `villa-booking-calendar` (z iCal) | chodí automaticky, nepřepisovat ručně |
| **KDO** — jméno, kontakt, evidence osob, tokeny | Supabase `vr_*` | PII, nikdy do repa |
| **KOLIK** — ceny a tržby | `villa-booking-calendar/owner.html` | šifrované, klíč má jen majitel |
| **CO** — výlety, počasí | `villa-rudolf-portal/data/` | `site` je odtud čte |
| **SPOJKA** mezi kalendářem a rezervací | `uidh` (= `sha256(iCal UID)[:16]`) | používá `sprava.js` i `vr_admin_upsert_booking(p_uidh)` |

## Infrastruktura

- **Supabase** `fpknbrzbqpalguajskut` — sdílený projekt se SINTERA, proto prefix `vr_`.
  Schéma pravdy = `villa-rudolf-site/supabase/migrations/` (ne kopie v jiných repech).
- **Hetzner** (`178.104.207.97`, tailnet `sintera-radar`) — cron na počasí, n8n (`127.0.0.1:5678`,
  **zvenku nedostupné**), Umami, doklady.
- **GitHub Pages** — všechna veřejná repa. Vlastní doména jen `site` (CNAME villarudolf.com).

## Pravidla, ať se zmatek nevrátí

1. **Jedno repo = jedna práce.** Napsaná na prvním řádku jeho `CLAUDE.md`.
2. **Každá nová session začíná touhle mapou**, ne prohledáváním repozitářů.
3. **Živý systém je `villa-rudolf-site`.** Když něco vypadá, že to má být „nový modul", nejdřív
   ověř, jestli to už není v `/sprava/` — `sprava.js` má přes 1 600 řádků a umí víc, než se zdá.
4. **Schéma databáze se ověřuje proti živé DB**, ne proti souboru v repu. Kopie `schema.sql`
   v jiných repech jsou zastaralé.
5. **Žádné PII do žádného repa.** Jména hostů patří jen do Supabase.
6. Když se změní role některého repa, **uprav tuhle mapu ve stejném commitu**.

## Otevřené

- **Aplikace na tvorbu smluv** — existuje, ale není v žádném repozitáři. Doplnit sem, až se najde.
- Rozhodnout osud `villa-rudolf-portal`: buď data o výletech přesunout do `site`, nebo natrvalo
  potvrdit roli „jen datový zdroj".
- Archivovat `villa-rudolf-vylety`, `villa-rudolf-web`, `villa-rudolf-cedule-22`
  (archivace na GitHubu je jen zámek — URL fungují dál).
- Kalendář: **číst 4 feedy zvlášť** místo e-chalupy hubu — hub odmítá import rezervace přes
  existující překryv, takže platné rezervace z feedu mizí a `/sprava/` je pak nevidí.
