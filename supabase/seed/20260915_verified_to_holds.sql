-- Villa Rudolf — přenos ověřených přímých prodejů z verified.json do vr_holds
-- ============================================================================
-- JEDNORÁZOVÝ DATOVÝ SKRIPT, ne migrace schématu. Pustit RUČNĚ v SQL Editoru
-- **až po** 20260909_vr_holds.sql. Je idempotentní — druhé spuštění nic nepřidá.
--
-- PROČ
-- Ruční audit majitele (villa-booking-calendar → data/verified.json, 12. 9. 2026)
-- vede vedle vr_holds druhou evidenci téhož. Tenhle skript z ní přenese ty řádky,
-- které do vr_holds opravdu patří, aby se přestaly vést dvakrát.
--
-- CO SE PŘENÁŠÍ A CO NE — hranice je VYSTAVENÁ ZÁLOHOVÁ FAKTURA
-- vr_holds stojí na tom, že předrezervaci zakládá doklad. Přenášejí se proto jen
-- termíny, u kterých faktura existuje; z auditu to jsou tři:
--
--   2027-08-07..14  přímá smlouva + záloha z 26. 8. 2026, v e-chalupách zablokováno
--   2027-08-14..21  přímá smlouva + záloha z 26. 8. 2026, v kalendáři CHYBÍ
--   2027-02-13..20  faktura z 29. 8. 2026 (splatnost 1. 9.) NEUHRAZENA → propadlo
--
-- Ve verified.json naopak ZŮSTÁVAJÍ (a je to správně — hold to nejsou):
--   * termíny bez faktury: „nabídka odeslaná, bez smlouvy a bez platby"
--     (2027-06-10..13), „jen e-mailový dotaz" (2028-05-25..28), 2027-01-30..02-06;
--   * 2027-02-20..27 — živý blok z e-chalup, který je nejspíš zbytek po propadlé
--     nabídce a patří zrušit u zdroje, ne zakládat jako předrezervaci;
--   * vlastní blokace (2026-11-02..12-18 „rekonstrukce schodů");
--   * ověření CIZÍCH bloků v extranetech platforem — to vr_holds neumí a umět nemá.
--
-- ⚠️ ČÍSLA FAKTUR, ČÁSTKY A ÚČTY SE NEDOPLŇUJÍ. V auditu nejsou a vymyslet se
-- nedají; zůstávají NULL a majitel je dopíše v /sprava/ → Předrezervace → Upravit.
-- Do té doby hlásí `account_mismatch` NULL (nemá co porovnávat) — až se měna a účet
-- vyplní, pojistka se rozjede sama.
--
-- CO SE STANE PO PRVNÍM BĚHU ACTIONU KALENDÁŘE (do 3 h)
--   2027-08-14..21 → v history.json přibude {platform:'Přímá', kind:'direct'}
--                    → termín se konečně objeví v kalendáři A přestane být volný
--                      na villarudolf.com. To je celý smysl téhle operace.
--   2027-08-07..14 → NEpřibude: na stejné datumy sedí živý blok z e-chalup a
--                    update_history.py hold se shodným (start,end) nepublikuje.
--                    Záznam tu je jako doklad o prodeji; /sprava/ si ho k tomu
--                    bloku sama přilepí (pravidlo holdBySpan v buildStays).
--   2027-02-13..20 → NEpřibude: status 'expired' se přes vr_public_holds() ven
--                    nedostane. Termín zůstává volný, doklad o faktuře zůstává.

insert into public.vr_holds
  (arrival, departure, status, hold_until, channel, invoice_issued, invoice_due, note)
select v.arrival, v.departure, v.status, null, 'Přímá', v.issued, v.due, v.note
from (values
  (date '2027-08-07', date '2027-08-14', 'confirmed', date '2026-08-26', null::date,
   'Z ručního auditu (verified.json 12. 9. 2026): přímá smlouva + zálohová faktura '
   'z 26. 8. 2026. Termín je zablokovaný v e-chalupách, proto se do kalendáře '
   'nepublikuje zvlášť. Doplnit číslo faktury, částku, měnu a účet.'),

  (date '2027-08-14', date '2027-08-21', 'confirmed', date '2026-08-26', null::date,
   'Z ručního auditu (verified.json 12. 9. 2026): přímá smlouva + zálohová faktura '
   'z 26. 8. 2026. Tenhle termín v kalendáři CHYBĚL (zbyl po něm jen mrtvý blok '
   'z Airbnb) a web ho nabízel jako volný — kvůli němu celý modul vznikl. '
   'Zadat ho i do e-chalup. Doplnit číslo faktury, částku, měnu a účet.'),

  (date '2027-02-13', date '2027-02-20', 'expired', date '2026-08-29', date '2026-09-01',
   'Z ručního auditu (verified.json 12. 9. 2026): zálohová faktura z 29. 8. 2026 '
   'se splatností 1. 9. 2026 nebyla uhrazena — podle textu smlouvy tím smlouva '
   'nevznikla a termín je volný. Do e-chalup NEZADÁVAT. Doplnit číslo faktury a částku.')
) as v(arrival, departure, status, issued, due, note)
where not exists (
  select 1 from public.vr_holds h
  where h.arrival = v.arrival and h.departure = v.departure
);


-- ---------- ověření ----------
-- Tři řádky; `expired` mezi nimi je schválně (drží doklad, termín neblokuje).
select arrival, departure, status, invoice_issued, invoice_due, channel
from public.vr_holds
where arrival in (date '2027-08-07', date '2027-08-14', date '2027-02-13')
order by arrival;

-- Ven do kalendáře smí jen ty dvě potvrzené — propadlá se tu objevit NESMÍ.
select x->>'start' as start, x->>'end' as "end", x->>'kind' as kind
from json_array_elements(public.vr_public_holds()) x
where (x->>'start') like '2027-%'
order by 1;
