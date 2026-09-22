-- Test 20260917_vr_mail.sql. Předpokládá _kulisa.sql + spuštěnou migraci (viz README.md).
-- Všechna jména a kontakty jsou VYMYŠLENÉ. Výstup se čte očima, očekávání je v \echo.
\set K '''test-admin-key-1234567890'''
\pset pager off

-- kulisa má vr_bookings jen v základu; doplň sloupce, které živá DB má
alter table public.vr_bookings add column if not exists booking_ref text unique;
alter table public.vr_bookings add column if not exists uidh text;
alter table public.vr_bookings add column if not exists phone text;
alter table public.vr_bookings add column if not exists email text;
alter table public.vr_bookings add column if not exists platform text;
alter table public.vr_bookings add column if not exists anonymized_at timestamptz;

truncate public.vr_mail; delete from public.vr_bookings;
insert into public.vr_bookings(token_hash, first_name, last_name, arrival, departure, platform, phone) values
  ('t1', null,   null,        current_date+100, current_date+107, 'Booking.com', null),            -- prázdný pobyt z kalendáře
  ('t2', 'Ručně','Zapsaný',   current_date+120, current_date+127, 'Booking.com', '+420700000001'), -- ručně vyplněný
  ('t3', null,   null,        current_date+140, current_date+147, 'Fewo-direkt', null),
  ('t4', 'Jana', 'Nováková',  current_date+200, current_date+207, 'Přímá',       null),            -- přímý prodej z poptávky
  ('t5', null,   'Dvojník',   current_date+220, current_date+227, 'E-chalupy',   null),
  ('t6', null,   'Dvojník',   current_date+240, current_date+247, 'Přímá',       null);

\echo '=== A) ZKUŠEBNÍ REŽIM (p_write=false): spáruje, navrhne, na pobyty nesáhne ==='
\echo '    čekám: new 6, matched 4, waiting 2 (dvojník + Booking bez pobytu)'
select jsonb_pretty(public.vr_ingest_mail(jsonb_build_array(
  jsonb_build_object('gmail_id','m1','platform','Booking.com','kind','new_booking','booking_ref','6999000111','arrival',(current_date+100)::text),
  jsonb_build_object('gmail_id','m2','platform','Booking.com','kind','guest_message','booking_ref','6999000222','first_name','Cizí','last_name','Jméno','email','6999000222-x@guest.booking.com','arrival',(current_date+120)::text,'departure',(current_date+127)::text),
  jsonb_build_object('gmail_id','m3','platform','Fewo-direkt','kind','booking_request','booking_ref','HA-TEST01','first_name','Erika','last_name','Beispiel','arrival',(current_date+140)::text,'departure',(current_date+147)::text,'price',4528,'payout',4301.6,'currency','EUR'),
  -- poptaný termín je JINÝ než sjednaný → páruje se příjmením
  jsonb_build_object('gmail_id','m4','platform','E-chalupy','kind','inquiry','booking_ref','3999001','first_name','Jana','last_name','Nováková','phone','+420728111222','email','jana.novakova@example.cz','arrival',(current_date+190)::text,'departure',(current_date+204)::text),
  -- příjmení sedí na DVA pobyty → nesmí se hádat
  jsonb_build_object('gmail_id','m5','platform','E-chalupy','kind','inquiry','first_name','Petr','last_name','Dvojník','phone','+420700000002'),
  -- Booking bez pobytu (kalendář ještě nedorazil)
  jsonb_build_object('gmail_id','m6','platform','Booking.com','kind','new_booking','booking_ref','6999000333','arrival',(current_date+300)::text),
  -- vadné řádky nesmí shodit dávku
  jsonb_build_object('gmail_id','m7','platform','Neznámá','kind','new_booking'),
  jsonb_build_object('gmail_id','m8','platform','Booking.com','kind','new_booking','arrival','nesmysl')
), false));

\echo '--- pobyty se NESMĚLY změnit (booking_ref všude prázdné, t1 bez jména) ---'
select token_hash, booking_ref, first_name, last_name, phone, email from public.vr_bookings order by token_hash;
\echo '--- návrhy: m1 {booking_ref}, m2 {booking_ref,email} (jméno NE — je zapsané ručně), m3 {booking_ref,first_name,last_name}, m4 {phone,email} ---'
select gmail_id, matched_how, proposed, filled, applied_at is not null as hotovo from public.vr_mail order by gmail_id;

\echo '=== B) OSTRÝ REŽIM + tytéž e-maily znovu (klouzavé okno) ==='
\echo '    čekám: new 0; FeWo (m3) zůstane NÁVRHEM i při p_write=true'
select jsonb_pretty(public.vr_ingest_mail(jsonb_build_array(
  jsonb_build_object('gmail_id','m1','platform','Booking.com','kind','new_booking','booking_ref','6999000111','arrival',(current_date+100)::text)
), true));
select token_hash, booking_ref, first_name, last_name, phone, email from public.vr_bookings order by token_hash;
\echo '--- t2: jméno „Ručně Zapsaný" a telefon ZŮSTALY, přibylo jen číslo a e-mail ---'
select gmail_id, matched_how, proposed, filled, applied_at is not null as hotovo from public.vr_mail order by gmail_id;

\echo '=== C) pobyt vznikne AŽ PO e-mailu → další běh ho dotáhne sám (m6) ==='
insert into public.vr_bookings(token_hash, arrival, departure, platform) values ('t7', current_date+300, current_date+305, 'Booking.com');
select public.vr_ingest_mail('[]'::jsonb, true);
select token_hash, booking_ref from public.vr_bookings where token_hash='t7';

\echo '=== D) zpráva hosta k témuž číslu → páruje se už přes „ref" a doplní jméno ==='
select public.vr_ingest_mail(jsonb_build_array(
  jsonb_build_object('gmail_id','m9','platform','Booking.com','kind','guest_message','booking_ref','6999000333','first_name','Jan','last_name','Vzorek','email','6999000333-y@guest.booking.com','arrival',(current_date+300)::text,'departure',(current_date+305)::text)), true);
select b.token_hash, b.first_name, b.last_name, b.email, m.matched_how, m.filled
  from public.vr_mail m join public.vr_bookings b on b.id=m.matched_booking where m.gmail_id='m9';

\echo '=== E) admin: výpis, ruční odklepnutí FeWo návrhu, zahození, špatný klíč ==='
select json_array_length((public.vr_admin_list_mail(:K))->'mail') as radku;
select public.vr_admin_apply_mail(:K, (select id from public.vr_mail where gmail_id='m3'), (select id from public.vr_bookings where token_hash='t3'));
select token_hash, booking_ref, first_name, last_name from public.vr_bookings where token_hash='t3';
select public.vr_admin_apply_mail(:K, (select id from public.vr_mail where gmail_id='m5'), (select id from public.vr_bookings where token_hash='t5'));
select m.matched_how, m.filled, b.phone from public.vr_mail m join public.vr_bookings b on b.id=m.matched_booking where m.gmail_id='m5';
select public.vr_admin_ignore_mail(:K, (select id from public.vr_mail where gmail_id='m4'), 'test');
\echo '    čekám chybu unauthorized:'
select public.vr_admin_list_mail('spatny-klic-spatny-klic');

\echo '=== F) anonymizace pobytu smaže osobní údaje i ve vr_mail ==='
update public.vr_bookings set anonymized_at=now() where token_hash='t7';
select public.vr_ingest_mail('[]'::jsonb, true);
select gmail_id, first_name, last_name, email from public.vr_mail where gmail_id='m9';

\echo '=== G) oprávnění: anon na ingest NE, service_role ANO ==='
select has_function_privilege('anon','public.vr_ingest_mail(jsonb, boolean)','execute') as anon_ingest,
       has_function_privilege('service_role','public.vr_ingest_mail(jsonb, boolean)','execute') as service_ingest,
       has_table_privilege('anon','public.vr_mail','select') as anon_tabulka;
