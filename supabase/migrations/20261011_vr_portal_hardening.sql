-- ═══════════════════════════════════════════════════════════════════════════════
-- Villa Rudolf — zpevnění DB po auditu portálu (11. 10. 2026)
-- Audit: villa-rudolf-portal, větev claude/audit-2026-10 (nálezy db-01, db-03, db-05, db-10, db-04).
-- Vše je vratné (grant zpět / create or replace), nic nemaže data.
-- Nasazení: konektor Supabase (apply_migration) nebo
--   supabase db query --linked --file supabase/migrations/20261011_vr_portal_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1) vr_create_booking: mrtvá cesta (n8n webhook „VR – nový host" nikdy neběžel, 0 volání v logu),
--    ale anon ji smí volat a její ingest secret je literál v těle funkce, jehož hodnota je
--    v historii veřejného repa. S veřejným anon klíčem tak šlo zakládat/přepisovat rezervace
--    a vyrobit si platný token hosta. Volat ji smí už jen vlastník DB.
revoke execute on function public.vr_create_booking(
  text, text, text, text, text, text, date, date, integer, integer[], timestamp with time zone)
  from public, anon, authenticated;

-- 2) Tabulkové granty: Supabase dává novým tabulkám anon/authenticated ALL. RLS bez policy
--    sice všechno blokuje, ale jediná budoucí omylem přidaná policy „using (true)" by zveřejnila
--    30 rezervací s telefony. SECURITY DEFINER RPC (vr_verify_token, vr_update_party, vr_request,
--    vr_album_*) běží s právy vlastníka, takže jim odebrání grantů nevadí – stejně jako dnes
--    funguje vr_persons_* nad vr_persons bez grantů pro anon.
revoke all on table public.vr_bookings, public.vr_requests, public.vr_album_photos
  from public, anon, authenticated;

-- 3) vr_verify_token: hostovi se posílala i interní poznámka majitele (notes). Žádný klient
--    ji nezobrazuje (portál ani /pruvodce/), ale portál ji ukládal do localStorage. Minimalizace:
--    vracet jen to, co se zobrazuje.
create or replace function public.vr_verify_token(p_token text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'name', json_build_object('first', b.first_name, 'last', b.last_name),
    'lang', b.lang,
    'arrival', b.arrival,
    'departure', b.departure,
    'party', json_build_object('adults', b.adults, 'children', b.children,
                               'interests', coalesce(b.interests, '{}'))
  )
  from public.vr_bookings b
  where b.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and b.anonymized_at is null
    and (b.expires_at is null or b.expires_at > now())
  limit 1;
$$;

-- 4) Tříparametrová vr_update_party zůstávala kvůli hostům se starou verzí portálu v service
--    workeru. Portál od 11. 10. 2026 hosty s tokenem přesměrovává na villarudolf.com/pruvodce/
--    (ten party do DB nezapisuje), čtyřparametrová varianta zůstává pro budoucí použití.
drop function if exists public.vr_update_party(text, integer, integer[]);

-- 5) Sdílený projekt se SINTERA: tři views běžely s právy vlastníka (security_invoker=off)
--    a anon je směl číst → veřejný anon klíč z portálu četl CRM kontakty SINTERA
--    (Supabase advisor: ERROR security_definer_view; ověřeno 11. 10. 2026, jediná volání
--    v logu za 24 h byla sonda auditu). Podkladové tabulky mají RLS bez policy, takže
--    s security_invoker=on vrací views pro anon prázdno; service_role a postgres fungují dál.
alter view public.crm_open_actions   set (security_invoker = on);
alter view public.urgence_pipeline   set (security_invoker = on);
alter view public.hook_training_data set (security_invoker = on);
revoke all on public.crm_open_actions, public.urgence_pipeline, public.hook_training_data
  from public, anon, authenticated;

notify pgrst, 'reload schema';
