\set K '''test-admin-key-1234567890'''
\pset pager off
truncate public.vr_payments; delete from public.vr_holds;

insert into public.vr_holds(arrival,departure,status,hold_until,invoice_no,invoice_amount,invoice_currency,invoice_issued,invoice_due,invoice_account)
values (current_date+200,current_date+207,'hold',current_date+10,'2026-0142',48000,'CZK',current_date-2,current_date+7,'VR_CZK'),
       (current_date+300,current_date+307,'hold',current_date+20,'2026-0143',1800,'EUR',current_date-1,current_date+17,'VR_EUR'),
       (current_date+350,current_date+357,'hold',current_date+25,'2026-0144',48000,'CZK',current_date-1,current_date+22,'VR_CZK');

\echo '=== A) první běh BEZ povoleného zapisování (p_autoconfirm = false) ==='
select jsonb_pretty(public.vr_ingest_payments(jsonb_build_array(
  jsonb_build_object('account','VR_CZK','tx_id','T-001','booked_on',current_date::text,'amount',48000,'currency','CZK','vs','20260142','counterparty','Novák Jan','message','zaloha'),
  jsonb_build_object('account','VR_CZK','tx_id','T-002','booked_on',current_date::text,'amount',-5000,'currency','CZK','vs','999','message','odchozi platba')
), false));

select status, hold_until is not null as drzi_dal from public.vr_holds where invoice_no='2026-0142';

\echo '=== B) druhý běh, zapisování povolené — a záměrně tytéž pohyby znovu ==='
\echo '    (klouzavé okno vrací staré pohyby; nesmí se zpracovat dvakrát)'
select jsonb_pretty(public.vr_ingest_payments(jsonb_build_array(
  jsonb_build_object('account','VR_CZK','tx_id','T-001','booked_on',current_date::text,'amount',48000,'currency','CZK','vs','20260142','message','zaloha'),
  -- bez VS, částka 48 000 sedí na DVĚ předrezervace → nesmí se hádat
  jsonb_build_object('account','VR_CZK','tx_id','T-003','booked_on',current_date::text,'amount',48000,'currency','CZK','vs',null,'counterparty','Svoboda Petr','message',''),
  -- VS sedí, částka ne (dílčí platba) → jen návrh
  jsonb_build_object('account','VR_EUR','tx_id','T-004','booked_on',current_date::text,'amount',900,'currency','EUR','vs','20260143','message','anzahlung'),
  -- SEPA bez VS, číslo faktury je v textu platby
  jsonb_build_object('account','VR_EUR','tx_id','T-005','booked_on',current_date::text,'amount',1800,'currency','EUR','vs',null,'message','Rechnung 2026-0143 Villa Rudolf'),
  -- nesedí na nic
  jsonb_build_object('account','VR_CZK','tx_id','T-006','booked_on',current_date::text,'amount',777,'currency','CZK','vs',null,'message','vratka')
), true));

\echo '--- co se stalo s předrezervacemi ---'
select invoice_no, status, hold_until, paid_amount, paid_account from public.vr_holds order by invoice_no;

\echo '--- platby a jejich osud ---'
select tx_id, account, amount, currency, coalesce(vs,'—') as vs,
       coalesce(matched_how,'—') as jak, confirmed,
       coalesce((select invoice_no from public.vr_holds h where h.id=p.matched_hold),'—') as faktura
from public.vr_payments p order by tx_id;

\echo '=== C) platba na CIZÍ účet — spáruje se, ale hlásí přeúčtování ==='
insert into public.vr_holds(arrival,departure,status,hold_until,invoice_no,invoice_amount,invoice_currency,invoice_issued,invoice_due,invoice_account)
values (current_date+400,current_date+407,'hold',current_date+30,'2026-0145',52000,'CZK',current_date,current_date+27,'VR_CZK');
select public.vr_ingest_payments(jsonb_build_array(
  jsonb_build_object('account','SINTERA','tx_id','T-007','booked_on',current_date::text,'amount',52000,'currency','CZK','vs','20260145','message','')
), true)->>'autoconfirmed' as potvrzeno;
select x->>'invoice_no' as faktura, x->>'status' as stav, x->>'paid_account' as kam_prislo,
       coalesce(x->>'paid_mismatch','(v pořádku)') as hlaska
from json_array_elements((public.vr_admin_list_holds(:K))->'holds') x
where x->>'invoice_no' = '2026-0145';

\echo '=== D) ruční přiřazení nepřiřazené platby ==='
select public.vr_admin_assign_payment(:K,
  (select id from public.vr_payments where tx_id='T-003'),
  (select id from public.vr_holds where invoice_no='2026-0144'), true);
select invoice_no, status, paid_amount from public.vr_holds where invoice_no='2026-0144';

\echo '=== E) co čeká na člověka ==='
select x->>'booked_on' as datum, x->>'amount' as castka, x->>'currency' as mena,
       coalesce(x->>'matched_how','—') as jak, x->>'confirmed' as potvrzeno,
       coalesce(x->>'hold_invoice_no','—') as faktura
from json_array_elements((public.vr_admin_list_payments(:K))->'payments') x
order by 1,2;

\echo '=== F) shoda variabilního symbolu ==='
select v as vs, i as faktura, public._vr_vs_matches(v,i) as sedi from (values
  ('20260142','2026-0142'), ('2026 0142','2026-0142'), ('0142','2026-0142'),
  ('142','2026-0142'), ('20260143','2026-0142'), (null,'2026-0142'), ('20260142',null)
) t(v,i);

\echo '=== G) service_role smí ingest, anon ne ==='
set role anon;
do $$ begin
  begin perform public.vr_ingest_payments('[]'::jsonb, false); raise notice 'FAIL: anon zapisuje platby';
  exception when insufficient_privilege then raise notice 'ok: anon na ingest nedosáhne'; end;
end $$;
reset role;
set role service_role;
select (public.vr_ingest_payments('[]'::jsonb, false))->>'ok' as service_role_smi;
reset role;
