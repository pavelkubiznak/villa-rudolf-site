# Villa Rudolf — web a provozní systém

**Tohle repo je živé jádro celého systému Villa Rudolf.** Web na `villarudolf.com` plus
všechny provozní moduly. Statický web na GitHub Pages, bez build kroku.

> 🗺️ **Než začneš cokoli dělat, přečti si [`MAPA-SYSTEMU.md`](MAPA-SYSTEMU.md).**
> Systém je rozdělený do víc repozitářů a bez mapy nepoznáš, které je živé. Už se stalo,
> že se navrhoval modul, který tady dávno běží.
>
> 📋 **Co je rozdělané a co zbývá: [`STAV.md`](STAV.md).**

## Struktura

| Cesta | Co to je | Publikum |
|---|---|---|
| `/` (`index.html`, 80 kB) | homepage, vícejazyčná | hosté, veřejnost |
| `/sprava/` | **admin majitele** — rezervace, kontakty hostů, zprávy, konflikty. `sprava.js` (1 600+ ř.) | jen majitel |
| `/metrika/` | přesměrování na dashboard návštěvnosti (Umami na Hetzneru), bez odkazů z webu | jen majitel |
| `/registrace/` | registrace hostů (evidence + poplatek z pobytu) | hosté |
| `/checkin/` | check-in formulář | hosté |
| `/album/` | fotoalbum pobytu | hosté |
| `/vylety/`, `/pruvodce/` | tipy na výlety (data z repa `villa-rudolf-portal`) | hosté |
| `/info/`, `/podminky/` | informace, podmínky | hosté |
| `/n8n/` | exporty n8n workflow (importovatelné) | provoz |
| `supabase/migrations/` | **schéma databáze — zdroj pravdy** (neúplný, viz `STAV.md`) | vývoj |
| `supabase/functions/album/` | Edge Function `album` — jediná brána ke Storage bucketu `vr-album`, autorizace tokenem pobytu | vývoj |

## Data a databáze

- **Supabase** `fpknbrzbqpalguajskut` (sdílený se SINTERA → prefix `vr_`).
  Migrace v `supabase/migrations/`. **Schéma vždy ověřuj proti živé DB**, ne proti kopiím
  `schema.sql` v jiných repech — ty jsou zastaralé.
- **Rezervace** se do `/sprava/` tahají z kalendáře:
  `https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json`
  (veřejné, anonymizované). Spojka na Supabase je **`uidh`** = `sha256(iCal UID)[:16]`,
  viz `vr_admin_upsert_booking(p_uidh, …)`.
- **Autorizace adminu:** `p_admin_key` (ne ingest secret). Klíč nikdy do repa.

## Předrezervace (`vr_holds`) — přímý prodej, který systému chyběl

**Spouštěčem rezervace není platba, ale vystavení zálohové faktury.** Pobyt prodaný napřímo
(telefon, e-mail, poptávka z e-chalup) není v žádném iCal feedu, takže do 9/2026 pro systém
neexistoval: `/sprava/` o něm nevěděla a **veřejná dostupnost na homepage** (`assets/site.js`
čte `history.json`) ten termín dál nabízela jako volný. Tak zmizel termín **14.–21. 8. 2027** —
faktura vystavená, uhrazená, peníze v bance, a v systému nic.

```
PŘEDREZERVACE ── uhrazeno do splatnosti ──▶ REZERVACE
              ── neuhrazeno do hold_until ─▶ propadlá (termín se uvolní)
```

| | |
|---|---|
| Tabulka | `vr_holds` (migrace `supabase/migrations/20260909_vr_holds.sql`) |
| Veřejně ven | `vr_public_holds()` — **jen** `{uidh,start,end,kind,holdUntil}`, čte to Action kalendáře |
| Admin | `vr_admin_list_holds` / `vr_admin_upsert_hold` / `vr_admin_set_hold_status` / `vr_admin_delete_hold` |
| UI | sekce **Předrezervace** v `/sprava/` + tlačítko „+ Předrezervace" v hlavičce Pobytů |

**Proč vlastní tabulka a ne sloupec ve `vr_bookings`:** `vr_purge_expired` maže bookingy
30+ dní po odjezdu bez zapsaných osob — přímý prodej i s doklady o faktuře by tiše zmizel.
Hold je navíc obchodní záznam (termín, faktura, platba), ne evidence hosta; host se doplní
až po zaplacení, vazbou `booking_id`. A nemuselo se sáhnout na `vr_admin_upsert_booking`,
takže se dá nasadit v libovolném pořadí, aniž by se cokoli rozbilo.

**Propadnutí je líné — žádný cron.** `vr_public_holds()` propadlý hold prostě nevrátí, takže
se termín uvolní sám i kdyby n8n týden neběželo. Řádek zůstane a čeká na rozhodnutí: zaplatit
o dva dny později je běžné a tiché smazání blokace je ta chyba, kterou modul řeší, jen obráceně.

**Pojistka proti špatnému účtu.** Faktura se dá omylem vystavit na hlavní účet Sintery
místo účtu Villa Rudolf. Pravidlo `měna ⇒ účet` (CZK → `VR_CZK`, EUR → `VR_EUR`) hlídá
`vr_hold_account_mismatch()` v databázi **a zároveň** `accountMismatch()` v `sprava.js` —
klient varuje živě při psaní, ať se faktura opraví, dokud ji host nezaplatil; server je
druhá vrstva. Dialog „Uhrazeno" se ptá i na to, **kam** peníze dorazily: platba na cizí účet
rezervaci potvrdí (host svoje udělal), ale zůstane v záznamu, že je potřeba přeúčtovat.

**Sekce Problémy** hlásí tři časově citlivé věci: špatný účet na faktuře, propadlou splatnost
(„než ji odepíšeš, ověř, jestli platba nedorazila na jiný účet") a **termín, který ještě není
zablokovaný na platformách** — dokud není, může ho kterýkoli kanál prodat znovu, hub nás
neochrání.

**Párování s blokací na platformě.** Když majitel termín zablokuje v e-chalupách, vrátí se
zpátky feedem. Skript kalendáře proto hold se **shodným** `(start, end)` nepublikuje a
`buildStays()` v `sprava.js` ho ke stejnému termínu přilepí — jeden pobyt, ne dva, a žádná
falešná dvojitá rezervace. Naopak **částečný** překryv předrezervace s cizí rezervací je
skutečný konflikt a vyskočí červený banner.

## Párování plateb (`vr_payments`) — etapa 2

Předrezervaci potvrzuje majitel kliknutím na „Uhrazeno". Druhá cesta: bankovní pohyby ze
**tří účtů u Fia** (VR korunový, VR eurový, **a hlavní účet Sintery**) natáhne n8n
(`n8n/VrPaymentWatch`) a `vr_ingest_payments()` je zkusí spárovat s vystavenou fakturou.

Sintera se čte schválně: faktura se dá omylem vystavit na ni, a kdyby se sledovaly jen
villové účty, taková platba by se **ztratila** — předrezervace by propadla, přestože host
zaplatil. Párování jde podle variabilního symbolu bez ohledu na účet; `paid_mismatch` pak
řekne, že je potřeba přeúčtovat.

**Žebříček jistoty — samo se potvrzuje jen nejvyšší stupeň:**

| | Podmínka | Co se stane |
|---|---|---|
| 1 | číslo faktury sedí (z VS, nebo z textu platby u SEPA) **a** měna **a** částka | potvrdí se samo * |
| 2 | číslo faktury sedí, částka ne (záloha / doplatek) | návrh k odklepnutí |
| 3 | bez VS: přesná částka + měna, v okně, a **jediný** kandidát | návrh k odklepnutí |
| 4 | cokoli jiného | **nepřiřazená platba** — vlastní sekce v `/sprava/` |

\* a i ten jen když `p_autoconfirm = true`. **První ostré běhy mají zůstat read-only**
(`AUTOCONFIRM = false` v Code node): pravidla jsou postavená proti dokumentaci Fia, ne proti
skutečnému výpisu tohohle účtu. Stejný postup jako u čtyř feedů v kalendáři — přečíst první
dávku, pak teprve povolit zápis. Přepnutí **nepůsobí zpětně** (pohyb se podruhé nezpracuje).

Nepřiřazená platba **není chyba k zahození** — je to přesně ten případ, kterým celý modul
začal: peníze v bance viděné, ale nikomu nedošlo, že jimi vznikla rezervace.

Dvě věci, na kterých to stojí:
- **Ambiguita se nikdy nehádá.** Když na částku bez VS sedí dvě předrezervace, platba
  zůstane nepřiřazená. Ceny se z ceníku opakují a spárovat platbu k cizí rezervaci je horší
  než nechat ji čekat na kliknutí.
- **Fio se nečte endpointem `last`.** Drží ukazatel na své straně a posouvá ho při stažení —
  pád n8n mezi stažením a zápisem by ty pohyby ztratil natrvalo. Čte se klouzavé okno 30 dní
  a odduplikovává se podle ID pohybu (unikátní index na `(source, account, tx_id)`).

Tokeny Fia patří do prostředí n8n instance (`FIO_TOKEN_VR_CZK` / `_VR_EUR` / `_SINTERA`),
**nikdy do repa** — a vždy **jen ke čtení**, k jednomu účtu. `vr_ingest_payments` má grant
jen pro `service_role` a **žádné sdílené heslo** — přesně ta chyba, kterou u `vr_purge_expired`
zavírá `20260908_vr_purge_lockdown.sql`.

**iDoklad zatím napojený není.** Kontrola, na jaký účet faktura zní, se dnes dělá z toho, co
majitel zapíše v editoru předrezervace — pravidlo `měna ⇒ účet` varuje živě při psaní. Číst
to přímo z iDokladu je další krok; jeho API se sem nepsalo naslepo.

⚠️ **`n8n/VrConflictWatch` je potřeba znovu importovat** — referenční kód byl upraven, aby
překryv dvou přímých prodejů („Přímá" × „Přímá") neschoval mezi artefakty kalendáře.

## Na co si dát pozor

1. **Žádné PII do repa.** Jména, kontakty a doklady hostů patří výhradně do Supabase (EU).
2. **`p_admin_key`, ingest secret ani `SERVICE_ROLE` klíč se do repa nikdy nedostanou.**
3. Repo je **veřejné** a běží na něm ostrý web s vlastní doménou — commituje se opatrně.
4. Než začneš psát „nový modul", ověř `/sprava/` — hodně věcí už existuje.

## Jazyk

Kód, komentáře i dokumentace česky. Uživatelské rozhraní je vícejazyčné (cs/de/en/pl).
