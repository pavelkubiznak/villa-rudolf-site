-- Villa Rudolf — purge secret: hash do configu, secret vzniká a zůstává jen v DB
-- ============================================================================
-- Předpoklad pro 20260908_vr_purge_lockdown.sql: ta migrace čte sha256 secretu
-- z vr_admin_config (klíč purge_secret_sha256) a bez něj vr_purge_expired odmítá
-- všechno. Tahle migrace klíč založí — ale secret NIKDO NEZNÁ: vygeneruje se
-- náhodně přímo v databázi (gen_random_bytes) a uloží se jen jeho hash.
--
-- Proč takhle: staré heslo je v git historii veřejného repa, takže rotace je
-- povinná, a v repu ani v logu Actions nesmí nový secret nikdy být. vr_purge_expired
-- dnes nikdo nevolá (žádný pg_cron v migracích, n8n ho nezná), takže secret, který
-- nikdo nezná, nic nerozbije — funkce je prostě zamčená, dokud si majitel nenastaví
-- vlastní: v SQL editoru
--     insert into public.vr_admin_config(k, v)
--     values ('purge_secret_sha256', encode(extensions.digest('<NOVÝ SECRET>', 'sha256'), 'hex'))
--     on conflict (k) do update set v = excluded.v;
-- a volat pak jen service_role klíčem (po lockdownu anon neprojde).
--
-- Idempotentní: když klíč už existuje (majitel si ho nastavil sám), nesahá na něj.

insert into public.vr_admin_config(k, v)
select 'purge_secret_sha256',
       encode(extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'), 'hex')
where not exists (select 1 from public.vr_admin_config where k = 'purge_secret_sha256');

-- Kontrola do logu (hodnoty hashů se nevypisují): které klíče config má.
select k, case when k like '%sha256' then '(hash)' else '(hodnota)' end as v
from public.vr_admin_config order by k;
