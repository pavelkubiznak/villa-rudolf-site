# Villa Rudolf — web a provozní systém

**Tohle repo je živé jádro celého systému Villa Rudolf.** Web na `villarudolf.com` plus
všechny provozní moduly. Statický web na GitHub Pages, bez build kroku.

> 🗺️ **Než začneš cokoli dělat, přečti si [`MAPA-SYSTEMU.md`](MAPA-SYSTEMU.md).**
> Systém je rozdělený do víc repozitářů a bez mapy nepoznáš, které je živé. Už se stalo,
> že se navrhoval modul, který tady dávno běží.

## Struktura

| Cesta | Co to je | Publikum |
|---|---|---|
| `/` (`index.html`, 80 kB) | homepage, vícejazyčná | hosté, veřejnost |
| `/sprava/` | **admin majitele** — rezervace, kontakty hostů, zprávy, konflikty. `sprava.js` (1 600+ ř.) | jen majitel |
| `/registrace/` | registrace hostů (evidence + poplatek z pobytu) | hosté |
| `/checkin/` | check-in formulář | hosté |
| `/album/` | fotoalbum pobytu | hosté |
| `/vylety/`, `/pruvodce/` | tipy na výlety (data z repa `villa-rudolf-portal`) | hosté |
| `/info/`, `/podminky/` | informace, podmínky | hosté |
| `/n8n/` | exporty n8n workflow (importovatelné) | provoz |
| `supabase/migrations/` | **schéma databáze — zdroj pravdy** | vývoj |

## Data a databáze

- **Supabase** `fpknbrzbqpalguajskut` (sdílený se SINTERA → prefix `vr_`).
  Migrace v `supabase/migrations/`. **Schéma vždy ověřuj proti živé DB**, ne proti kopiím
  `schema.sql` v jiných repech — ty jsou zastaralé.
- **Rezervace** se do `/sprava/` tahají z kalendáře:
  `https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json`
  (veřejné, anonymizované). Spojka na Supabase je **`uidh`** = `sha256(iCal UID)[:16]`,
  viz `vr_admin_upsert_booking(p_uidh, …)`.
- **Autorizace adminu:** `p_admin_key` (ne ingest secret). Klíč nikdy do repa.

## Na co si dát pozor

1. **Žádné PII do repa.** Jména, kontakty a doklady hostů patří výhradně do Supabase (EU).
2. **`p_admin_key`, ingest secret ani `SERVICE_ROLE` klíč se do repa nikdy nedostanou.**
3. Repo je **veřejné** a běží na něm ostrý web s vlastní doménou — commituje se opatrně.
4. Než začneš psát „nový modul", ověř `/sprava/` — hodně věcí už existuje.

## Jazyk

Kód, komentáře i dokumentace česky. Uživatelské rozhraní je vícejazyčné (cs/de/en/pl).
