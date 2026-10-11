-- ═══════════════════════════════════════════════════════════════════════════════
-- Villa Rudolf — denní retence přes pg_cron místo cronu na Hetzneru (11. 10. 2026)
--
-- Proč: vr_purge_expired(p_secret) je od 15. 9. 2026 spustitelná jen pro service_role
--   (20260908_vr_purge_lockdown.sql). Skript /opt/vr-portal/purge-expired.sh na Hetzneru
--   ji ale dál volal anon klíčem → každý den HTTP 401 „permission denied" → retence
--   NEBĚŽELA 26 dní (11. 10. 2026: 5 rezervací s prošlým expires_at, 0 anonymizovaných).
--
-- Řešení: plánovač uvnitř databáze. Žádný secret mimo DB, žádný klíč na serveru,
--   nic k rotaci, nic k hlídání na Hetzneru. Job běží jako vlastník DB (postgres) a volá
--   wrapper bez parametru, na který nemá anon/authenticated/service_role EXECUTE.
--
-- Co se dělá (varianta „anonymizovat, nemazat" – viz STAV.md „Retence pobytů"):
--   • 30+ dní po odjezdu: pryč phone, email, door_code, notes, cleaning_note, token_enc;
--     token_hash nahrazen náhodným (starý odkaz hosta přestane platit); anonymized_at = now().
--     Jméno, termín, platforma a počty zůstávají (historie pobytů, ceník, účetnictví);
--     evidence osob (vr_persons) zůstává 6 let ze zákona.
--   • 6+ let po odjezdu: smazat celý pobyt (cascade vr_persons – evidenční povinnost skončila).
--   Oproti vr_purge_expired(p_secret) se už NEMAŽOU pobyty bez evidovaných osob 30 dní po
--   odjezdu – ty se jen anonymizují. (Dřívější mazání STAV.md označoval za nerozhodnuté.)
--
-- Po nasazení: na Hetzneru smazat řádek `40 4 * * * /opt/vr-portal/purge-expired.sh`
--   z crontabu a soubor purge-expired.sh (anon klíč + starý secret v plaintextu) a
--   z /etc/hlidac/ulohy.conf odebrat úlohu vr-purge.
-- Kontrola:
--   select jobid, schedule, command, active from cron.job where jobname = 'vr-purge-expired';
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'vr-purge-expired')
--    order by start_time desc limit 5;
--   select count(*) filter (where anonymized_at is not null) as anonymizovano,
--          count(*) filter (where departure < current_date - 30 and anonymized_at is null) as ceka
--     from public.vr_bookings;
-- ═══════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.vr_purge_expired_cron()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anon    int := 0;
  v_del_old int := 0;
begin
  -- 1) retence 6 let vypršela → smazat úplně
  delete from public.vr_bookings b where b.departure < (current_date - interval '6 years');
  get diagnostics v_del_old = row_count;

  -- 2) 30+ dní po odjezdu → anonymizovat kontakt a volný text, znehodnotit token
  update public.vr_bookings b set
    phone         = null,
    email         = null,
    door_code     = null,
    notes         = null,
    cleaning_note = null,
    token_enc     = null,
    token_hash    = encode(extensions.gen_random_bytes(24), 'hex'),
    anonymized_at = now()
   where b.departure < (current_date - interval '30 days')
     and b.anonymized_at is null;
  get diagnostics v_anon = row_count;

  return json_build_object('deleted_after_6y', v_del_old, 'anonymized', v_anon, 'at', now());
end $$;

revoke all on function public.vr_purge_expired_cron() from public, anon, authenticated, service_role;

-- Job denně 04:40 UTC (stejný čas jako dřív na Hetzneru). Idempotentní: existující job se nahradí.
do $$
declare v_id bigint;
begin
  for v_id in select jobid from cron.job where jobname = 'vr-purge-expired' loop
    perform cron.unschedule(v_id);
  end loop;
  perform cron.schedule('vr-purge-expired', '40 4 * * *', 'select public.vr_purge_expired_cron();');
end $$;
