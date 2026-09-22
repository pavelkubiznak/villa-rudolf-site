# VrMailIngest — údaje o hostech z e-mailů platforem

**Stav: připraveno, NENASAZENO.** Čeká na (1) migraci `supabase/migrations/20260917_vr_mail.sql`
v živé DB a (2) přístup n8n ke čtení Gmailu (credential `gmailOAuth2` — na instanci žádný není
a vytvořit ho může jen majitel účtu v editoru n8n).

Kalendářové feedy nenesou o hostovi nic (Booking „CLOSED", Airbnb „Reserved"). Jméno, číslo
rezervace a kontakt ale chodí majiteli e-mailem — tenhle automat je přečte a doplní do
`vr_bookings`. **Jen do prázdných polí, nikdy nepřepisuje, nic nehádá a pobyty nezakládá.**

Složka není importovatelné workflow — je to referenční kód do Code node plus popis, jak
workflow poskládat (stejná konvence jako `VrPaymentWatch`).

## Řetěz uzlů

| # | Uzel | Nastavení |
|---|---|---|
| 1 | **Schedule Trigger** | každou hodinu |
| 2 | **Gmail** — „Get Many" (message) | credential `gmailOAuth2`, **Simplify vypnuté**, Limit 50, filtr *Search* viz níž |
| 3 | **Code** — „Naparsovat poštu" | *Run Once for All Items*, obsah `VrMailIngest.code.js` **bez úvodního blokového komentáře** |
| 4 | **HTTP Request** — „Ingest do Supabase" | `POST {SUPABASE_URL}/rest/v1/rpc/vr_ingest_mail`, tělo = `{{ $json.ingestBody }}`, credential se **service-role** klíčem (tentýž, co používá `VrConflictWatch`) |
| 5 | **IF** + **Send Email** (volitelné) | pošli majiteli souhrn, když `summary.parsed > 0`. V souhrnu **nejsou jména ani kontakty**, jen počty |

Filtr pro Gmail (pole *Search*):

```
newer_than:3d (from:noreply@booking.com OR from:guest.booking.com OR from:sender@messages.homeaway.com OR from:info@e-chalupy.cz)
```

Čte se klouzavé okno tří dnů, ne „jen nepřečtené" — stejný důvod jako u Fia: kdyby n8n spadlo
mezi stažením a zápisem, e-mail by se ztratil. Dvojí zpracování hlídá databáze (`gmail_id`
je unikátní). V uzlu 2 zapni **Always Output Data**, ať běh bez nové pošty neskončí chybou;
uzel 3 si s prázdným vstupem poradí.

**Jednorázové dotažení historie:** při prvním běhu přepiš `newer_than:3d` na `newer_than:1y`
a Limit na 500, pusť ručně jednou a vrať zpátky.

## ⚠️ První běhy nech ve zkušebním režimu

V `VrMailIngest.code.js` je `WRITE = false`. Databáze e-maily uloží, spáruje s pobyty a do
`/sprava/` → **Z pošty** vypíše, co BY doplnila — ale na pobyty nesáhne. Parsery stojí na
jednom skutečném vzorku z každé platformy (17. 9. 2026); první dávku je potřeba přečíst.
Teprve až sedí, přepni na `true`. Návrhy z doby zkušebního režimu se po přepnutí doplní samy
při dalším běhu (na rozdíl od plateb — tady se páruje vždy všechno otevřené).

I s `WRITE = true` zůstává **FeWo jen návrhem k odklepnutí**: z e-mailu nejde poznat dotaz od
potvrzené rezervace a na tentýž týden se ptá víc lidí.

## Co která platforma posílá (ověřeno na skutečné poště 17. 9. 2026)

| Zdroj | Co z něj jde vyčíst | Jak se páruje |
|---|---|---|
| Booking „Nová rezervace!" | číslo rezervace + den příjezdu (jen v předmětu) | platforma + příjezd |
| Booking zpráva hosta (`<číslo>-…@guest.booking.com`) | jméno, příjezd, odjezd, číslo, zástupný e-mail | číslo, jinak platforma + termín |
| FeWo/Vrbo (`sender@messages.homeaway.com`) | jméno, termín, osoby, `HA-…`, u žádosti cena a odhad výplaty; telefon až „nach Buchung" | termín — **vždy jen návrh** |
| e-chalupy poptávka | jméno, telefon, e-mail, **poptaný** termín | příjmení mezi pobyty „E-chalupy" a „Přímá" (sjednaný termín bývá jiný než poptaný) |
| Airbnb | potvrzení rezervací do schránky **nechodí** | — (zapnout oznámení v Airbnb, pak doplnit parser) |

Booking píše jméno někdy jako „Příjmení Jméno" — parser bere poslední slovo jako příjmení,
takže se občas prohodí. Doplňuje se jen prázdné pole a majitel to v `/sprava/` vidí; opravit
jde ručně a automat to už nepřepíše.

`VrEchalupyInquiry` (starší samostatný parser e-chalup, nikdy nenasazený) je tímhle nahrazen.

## Bezpečnost

- **Obsah e-mailu je nedůvěryhodný vstup.** Čtou se jen pole pevného tvaru; „jméno" s číslicí,
  odkazem nebo zavináčem se zahodí. Tělo e-mailu se nikam neukládá a nic z něj se neprovádí.
- E-mail, kterému v Gmailu neprošlo DKIM, se zahodí (adresa odesílatele jde podvrhnout).
- `vr_ingest_mail` smí volat jen `service_role`; žádné sdílené heslo.
- Do logu n8n ani do souhrnného e-mailu nejdou jména ani kontakty. **V nastavení workflow
  vypni ukládání dat úspěšných běhů** (*Settings → Save successful production executions:
  Do not save*), jinak by těla e-mailů ležela v historii n8n.
- Do repa patří jen vymyšlené vzorky (`test_VrMailIngest.mjs`).

## Testy

```bash
node n8n/VrMailIngest/test_VrMailIngest.mjs
```

Párování a doplňování se testuje na straně databáze: `supabase/tests/test_vr_mail.sql`.
