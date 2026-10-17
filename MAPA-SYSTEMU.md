# Villa Rudolf — mapa systému

**Tohle je jediné místo, kde je napsáno, co kde běží.** Než začneš cokoli programovat nebo
navrhovat — ať jsi člověk nebo AI session — přečti si tuhle tabulku. Systém je rozdělený do
několika repozitářů a bez mapy se v nich nedá poznat, které je živé.

Aktualizováno: 13. 10. 2026

## Součásti

| Repo | Co dělá | Kde běží | Stav |
|---|---|---|---|
| **villa-rudolf-site** ← *jsi tady* | Web (česky `/`, jazykové verze `/de/` `/pl/` `/en/`, Časté dotazy `/faq/` — statické HTML z `tools/gen-jazyky.mjs`) + celý provozní systém: `/sprava/` (majitel), `/registrace/` (evidence hostů), `/checkin/`, `/album/`, `/vylety/`, `/pruvodce/`. Supabase migrace v `supabase/migrations/`. | **villarudolf.com** | 🟢 **ŽIVÉ JÁDRO** |
| **villa-booking-calendar** | Kalendář rezervací: `index.html` pro úklid, `owner.html` pro majitele (tržby, token). Actionem každé 3 h stahuje iCal a publikuje `data/feed.ics` + `data/history.json`. | pavelkubiznak.github.io/villa-booking-calendar/ | 🟢 živé — **dodavatel dat** |
| **villa-rudolf-portal** | **Datový zdroj:** `data/trips.json` (katalog výletů, 4 jazyky) a `data/forecast.json` (počasí, cron na Hetzneru). **Zdroj pravdy pro ceník** (`docs/cenik.json` + `scripts/cenik.mjs`) **a pro texty** (`docs/text-villa-rudolf.md`). `index.html` = jen demo průvodce + přesměrování: host s `?t=` jde od 11. 10. 2026 na `villarudolf.com/pruvodce/?t=`. | pavelkubiznak.github.io/villa-rudolf-portal/ | 🟢 živé — **datový zdroj + zdroj pravdy ceníku a textů** (role potvrzena 11. 10. 2026) |
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
        ▲          │                                 │    žádná jména hostů)
        │          ▼                                 │
        │  kalendář pro úklid + owner.html (tržby)   │
        │                                            ▼
        │  villa-rudolf-portal ─ trips.json ─▶ villa-rudolf-site  /sprava/
        │       forecast.json                       │  admin: rezervace, kontakty, zprávy
        │                                           ▼
        └──── vr_public_holds() ────────  Supabase  fpknbrzbqpalguajskut
              PŘEDREZERVACE a přímý       (vr_* tabulky a funkce — PII hostů)
              prodej (anonymizovaně)                ▲
                                     /registrace/ · /checkin/ · /album/
```

**Od 9. 9. 2026 tečou data i opačným směrem.** Pobyt prodaný napřímo v žádném feedu není,
takže ho kalendář musí dostat z `/sprava/` — jinak ho web dál nabízí jako volný termín
(přesně případ 14.–21. 8. 2027).

## Kdo vlastní kterou pravdu

| Fakt | Vlastník | Pozn. |
|---|---|---|
| **KDY** — termín pobytu, platforma | `villa-booking-calendar` (z iCal) | chodí automaticky, nepřepisovat ručně |
| **KDO** — jméno, kontakt, evidence osob, tokeny | Supabase `vr_*` | PII, nikdy do repa |
| **KOLIK** — ceny a tržby | `villa-booking-calendar/owner.html` | šifrované, klíč má jen majitel |
| **CENÍK** — cena za noc, min. noci, sezóny na všech kanálech | `villa-rudolf-portal/docs/cenik.json` | web ho nečte za běhu: `node tools/gen-cenik-web.mjs <portál>` přepíše kalkulačku v `assets/site.js` a přes `tools/gen-jazyky.mjs` ceny v HTML homepage ve všech jazycích; `/smlouvy/` je čte ze `site.js` |
| **CO** — výlety, počasí | `villa-rudolf-portal/data/` | `site` je odtud čte |
| **SPOJKA** mezi kalendářem a rezervací | `uidh` (= `sha256(iCal UID)[:16]`) | používá `sprava.js` i `vr_admin_upsert_booking(p_uidh)` |
| **PŘÍMÝ PRODEJ** — předrezervace ze zálohové faktury, potvrzené přímé rezervace | Supabase `vr_holds` (tady) | jediná věc, kterou `site` posílá **do** kalendáře — přes `vr_public_holds()`; `uidh` = `sha256('vr-hold:'+id)[:16]` |
| **ZPRÁVY HOSTŮM** — texty, sekvence, co už odešlo, jak host odpověděl | texty: `sprava/sprava.js` (`TPL`, `NEWS`, `SEQUENCE`) + **kopie** v `n8n/VrDailyTasks/VrDailyTasks.code.js`; stav: Supabase `vr_msglog` | kopie hlídá `node tools/test-zpravy.mjs`; **zprávy vykají ve všech jazycích** (i německy — na rozdíl od webu a inzerátů); ve `vr_msglog` jsou i podmínky pobytu (čas příjezdu, placení poplatku) |
| **NÁVŠTĚVNOST** webu — kolik lidí, odkud, kam, jak dlouho | Umami na Hetzneru | cookieless, bez PII; skript na všech stránkách kromě `/sprava/`, tokeny `?t=` se nezapisují |

## Infrastruktura

- **Supabase** `fpknbrzbqpalguajskut` — sdílený projekt se SINTERA, proto prefix `vr_`.
  Edge Function `album` (`supabase/functions/album/`) je jediná brána ke Storage bucketu
  `vr-album`; nasazuje se `supabase functions deploy album`.
  Schéma pravdy = `villa-rudolf-site/supabase/migrations/` (ne kopie v jiných repech).
  **Retence běží uvnitř DB:** pg_cron job `vr-purge-expired` (04:40 UTC, migrace
  `20261011_vr_purge_cron.sql`) 30 dní po odjezdu anonymizuje kontakt, poznámky a token,
  pobyt nemaže; výmaz po 6 letech. Odkaz hosta `?t=` platí **14 dní po odjezdu**.
- **Hetzner** (`178.104.207.97`, tailnet `sintera-radar`) — cron na počasí (purge cron se od
  11. 10. 2026 ruší — byl rozbitý, viz `STAV.md`), n8n (`127.0.0.1:5678`,
  **zvenku nedostupné**), Umami — **analytika návštěvnosti webu** (dashboard
  `https://178-104-207-97.sslip.io`; vchody: `villarudolf.com/metrika` a odkaz
  „📈 Návštěvnost" v liště `/sprava/`), doklady.
- **GitHub Pages** — všechna veřejná repa. Vlastní doména jen `site` (CNAME villarudolf.com).

## E-mail — kudy tečou zprávy hostům

**Jediná veřejná adresa Villy Rudolf je `rezervace@villarudolf.com`.** Pozor — **není nikde
jeden zdroj pravdy**, adresa je vysázená natvrdo na sedmi místech a při změně je nutné projít
všechna: `index.html`, `podminky/podminky.js` (8×, ve 4 jazycích), `podminky/index.html`
(noscript), `vylety/index.html` (2×), `pruvodce/index.html`, `registrace/index.html`
a `assets/site.js` (4 chybové hlášky + záloha v `renderFooterContact`). Konstanta
`VR_CONTACT.email` řídí **jen patičku homepage**, nic dalšího z ní nečerpá.
**Další adresy na doméně nezakládat** — rozhodnuto 26. 8. 2026. Kdo potřebuje jiného
příjemce, řeší to štítkem v Gmailu, ne novou adresou.

| Směr | Kudy to jde dnes | Pozn. |
|---|---|---|
| Host → vila | `rezervace@villarudolf.com` | přeposílá se do majitelovy Gmail schránky, **ověřeno 26. 8. 2026** |
| Vila → host (zprávy k pobytu) | hosté z platforem: **celý text přes platformu** (tlačítko „Zkopírovat pro platformu" ve `/sprava/`) + krátká průvodní zpráva na WhatsApp; přímý prodej: **WhatsApp** (`wa.me`). Odesílá majitel ručně | nic se neposílá samo; záznam na platformě je pojistka při škodě; odpovědi hostů systém nečte — majitel je zapisuje tlačítky „jede / váhá" |
| Vila → host (ručně) | odchází z majitelova Gmailu | ⚠️ **nesedí s adresou na webu** — host vidí v odpovědi jiného odesílatele |
| Vila → host (zálohová faktura) | z fakturační schránky Sintery | ⚠️ host pak odpovídá do účetní schránky cizí firmy |
| Systém → majitel | n8n přes Gmail SMTP (`VrSmtpGmail0001`) | v pořádku, majitel sám sobě — hosta to nevidí |

Dvě „⚠️" nejsou chyba v kódu, řeší se v nastavení pošty (Gmail „Odeslat poštu jako" nad
vlastní doménou, u faktur `Reply-To` na `rezervace@`). Do repa z toho nepatří nic —
**žádné adresy, hesla ani SMTP údaje.**

## Pravidla, ať se zmatek nevrátí

1. **Jedno repo = jedna práce.** Napsaná na prvním řádku jeho `CLAUDE.md`.
2. **Každá nová session začíná touhle mapou**, ne prohledáváním repozitářů.
3. **Živý systém je `villa-rudolf-site`.** Když něco vypadá, že to má být „nový modul", nejdřív
   ověř, jestli to už není v `/sprava/` — `sprava.js` má přes 3 200 řádků a umí víc, než se zdá.
   Zkoušet se dá bez klíče a bez databáze: `node tools/sprava-harness.mjs` (vymyšlené pobyty).
4. **Schéma databáze se ověřuje proti živé DB**, ne proti souboru v repu. Kopie `schema.sql`
   v jiných repech jsou zastaralé.
5. **Žádné PII do žádného repa.** Jména hostů patří jen do Supabase.
6. Když se změní role některého repa, **uprav tuhle mapu ve stejném commitu**.

## Otevřené

- **Aplikace na tvorbu smluv** — existuje, ale není v žádném repozitáři. Doplnit sem, až se najde.
- ~~Rozhodnout osud `villa-rudolf-portal`~~ — **potvrzeno 11. 10. 2026:** datový zdroj (výlety,
  počasí) + zdroj pravdy pro ceník a texty; `index.html` jen demo + přesměrování hostů na
  `/pruvodce/`. Data se do `site` nestěhují.
- Archivovat `villa-rudolf-vylety`, `villa-rudolf-web`, `villa-rudolf-cedule-22`
  (archivace na GitHubu je jen zámek — URL fungují dál).
- Kalendář: **čtení 4 feedů zvlášť je nasazené** (13. 8.), ale běží zatím v hub módu — chybí
  secrety `ICAL_URL_AIRBNB` / `_BOOKING` / `_FEWO`. Dokud nejsou, platí původní problém: hub
  odmítá import rezervace přes existující překryv, takže platné rezervace z feedu mizí
  a `/sprava/` je pak nevidí. Podrobnosti v `STAV.md`.
- ~~**Bezpečnost:** `vr_purge_expired` jde spustit zvenku~~ — **zamčeno 15. 9. 2026** (jen
  `service_role`, secret jen jako hash v configu). Zámek ale retenci na 26 dní zastavil (Hetzner
  volal dál anon klíčem) — **od 11. 10. 2026 běží pg_cron job `vr-purge-expired`** uvnitř DB,
  bez secretu. Zbývá ručně zrušit cron, skript a hlídač `vr-purge` na velínu. Viz `STAV.md`.
- **Rozhodnutí Pavla z auditu portálu 11. 10. 2026** (nálezy v `villa-rudolf-portal`, větev
  `claude/audit-2026-10`; čísla jsou id nálezů):
  - **Oddělit Supabase projekt od SINTERA** (infra-14, db-04). Portál i web používají veřejný
    anon klíč téhož projektu, ve kterém leží CRM SINTERA — sdílený klíč = sdílený dosah každé
    chyby (11. 10. tři SINTERA views čitelné z anon klíče; zamčeno, ale příčina trvá).
  - **Zálohy Supabase** (infra-02). Projekt je na **free plánu** (ověřeno 11. 10.: org „Open brain",
    plan `free`) — žádné denní zálohy ani PITR, a nikdo ho nedumpuje; `vr_bookings`, `vr_persons`,
    `vr_contracts`, `vr_holds` existují jen tam. Buď Pro plán, nebo noční šifrovaný `pg_dump`
    z velínu (návrh skriptu v nálezu).
  - **Přepsat git historii portálu** (gdpr-01, gdpr-02). Křestní i celá jména hostů byla v
    `docs/audit-cen/` a `docs/cenova-logika-2027-2028.md` veřejného repa; z pracovního stromu
    jsou pryč (commit `051c9c0`), v historii zůstávají — `git filter-repo` + force-push (s koordinací
    cronu na velínu), nebo riziko přijmout.
  - **Šifrovat zálohy z Hetzneru na Google Drive** (infra-08, sec-02, gdpr-11). Denní
    `backup-critical.sh` odnáší v plaintextu deploy key se zápisem do `main`, rclone token, anon
    klíč, `.env` všech stacků a data Umami/n8n s PII.
  - **Google Fonts na webu i v portálu** (app-07, gdpr-09). `/pruvodce/` i portál stahují písma
    z `fonts.googleapis.com` — IP každého hosta do USA bez informace. Buď písma k nám do repa,
    nebo to zapsat do `/podminky/`.
- **Heslo Wi-Fi** bylo natvrdo ve veřejném repu (a v git historii zůstává). Kód od 15. 9. čte
  `vr_admin_config.wifi_password` (migrace nasazena 15. 9.); zbývá vyplnění v Nastavení `/sprava/`,
  změna hesla na routeru a uzel v n8n `VrDailyTasks`. Od 11. 10. bez něj uvítací zpráva nejde
  odeslat a „Co doplnit" to hlásí nahoře. Viz `STAV.md`.
- **Zprávy hostům (13. 10. 2026):** kód je v repu, ale **`VrDailyTasks` v n8n běží ještě se starou
  sekvencí**, dokud se nenasadí (`tools/n8n-patch-vrdailytasks.py`). Do té doby denní e-mail a `/sprava/`
  neříkají totéž. Viz `STAV.md`, „Zprávy hostovi".
- **Schéma není úplné:** `vr_request` / `vr_requests` (formulář homepage) v migracích chybí —
  vytáhnout z živé DB. Viz `STAV.md`, audit 8. 9.
