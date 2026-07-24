-- Villa Rudolf — HLÍDAČ KALENDÁŘNÍCH KONFLIKTŮ (double-booking / storno watch)
-- ===========================================================================
-- Motivace: 3.–10. 7. 2027 se ručně odhalila dvojitá rezervace Airbnb×Booking.
-- Systém to má napříště najít sám do hodiny (n8n VrConflictWatch001), ne za rok.
--
-- Co detekujeme:
--   * OVERLAP  — dva pobyty se překrývají (intervaly [start,end); den odjezdu =
--     den příjezdu NENÍ konflikt). ESKALUJE (e-mail + červený banner) jen když
--     jde o REÁLNÉ riziko: různé platformy (kanály se nesynchronizují a každý
--     může prodat stejný termín — přesně případ z července) NEBO oba pobyty mají
--     spárovaného hosta ve vr_bookings. Překryv na STEJNÉ platformě bez hosta je
--     artefakt kalendáře (blok / úprava / duplicitní iCal VEVENT) — jedna
--     platforma svůj vlastní inventář dvakrát neprodá — a do vr_conflicts se
--     NEzapisuje (v /sprava/ se ukáže jen tlumeně, klientská detekce).
--   * VANISHED — pobyt s uidh, který zmizel z feedu = pravděpodobné STORNO na
--     platformě. Hlídá se jen pro arrival do 12 měsíců (feed má 13měsíční cutoff
--     dopředu → vzdálenější pobyty můžou chybět legitimně, žádný false poplach).
--
-- Bezpečnostní model:
--   * vr_conflicts: RLS ON, ŽÁDNÁ anon/authenticated policy → čte/píše jen
--     service_role (z n8n, obchází RLS) a admin RPC (SECURITY DEFINER, key-gated).
--   * vr_apply_conflicts(jsonb): zápis stavu — grant JEN service_role (n8n).
--   * vr_admin_conflicts(text): čtení pro banner /sprava/ — key-gated jako
--     ostatní admin RPC (hash admin klíče v vr_admin_config, rate-limit).

-- ---------- 1) TABULKA STAVU HLÍDAČE ----------
create table if not exists public.vr_conflicts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('overlap','vanished')),
  key         text not null unique,                 -- deterministický klíč (viz níže)
  detail      jsonb not null default '{}'::jsonb,   -- termíny, platformy, jména, uidh…
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  resolved_at timestamptz,                          -- vyplněno, když zmizel z detekce
  notified_at timestamptz                           -- vyplněno po odeslání 1. e-mailu
);
-- deterministické klíče (stabilní napříč hodinovými běhy):
--   overlap  : 'overlap:'||uidhLo||'|'||uidhHi||'|'||loStart||'_'||loEnd||'|'||hiStart||'_'||hiEnd
--   vanished : 'vanished:'||uidh
-- detail.resolved_notified = true  → potvrzovací („✅ vyřešen") e-mail už odešel.
-- detail.known = true              → známý konflikt (majitel ho už řeší; acknowledged-ready).

create index if not exists vr_conflicts_open_idx  on public.vr_conflicts(resolved_at) where resolved_at is null;
create index if not exists vr_conflicts_kind_idx  on public.vr_conflicts(kind);

alter table public.vr_conflicts enable row level security;
revoke all on public.vr_conflicts from anon, authenticated;
-- (žádná policy → anon/authenticated nevidí nic; service_role obchází RLS)


-- ---------- 2) ZÁPIS STAVU (jen service_role z n8n) ----------
-- Vstup p_conflicts = pole AKTUÁLNĚ detekovaných eskalovatelných konfliktů:
--   [{ "kind":"overlap|vanished", "key":"…", "detail":{…} }, …]
-- Atomicky:
--   a) upsert desired (nové vloží, existující obnoví last_seen+detail; pokud byl
--      dřív resolved a znovu se objevil → reopen: resolved_at=null, notified_at=null),
--   b) resolve: aktivní řádky, které v desired nejsou → resolved_at=now(),
--   c) vrátí to_notify_new (aktivní dosud neoznámené — a rovnou je označí notified),
--      a to_notify_resolved (vyřešené, jimž ještě neodešel potvrzovací e-mail —
--      rovnou označí detail.resolved_notified=true).
-- Pozn.: notified_at se nastaví v RÁMCI tohoto volání (před odesláním e-mailu).
--   Vědomý kompromis: hodinový cron + banner tvoří redundanci, a idempotence
--   (žádné duplicitní e-maily na dalších bězích) je důležitější než ojedinělý
--   případ „e-mail selhal, ale řádek už je notified" (konflikt zůstane v banneru).
create or replace function public.vr_apply_conflicts(p_conflicts jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_keys text[];
  v_new  jsonb;
  v_res  jsonb;
begin
  select coalesce(array_agg(x->>'key'), '{}'::text[]) into v_keys
    from jsonb_array_elements(coalesce(p_conflicts, '[]'::jsonb)) x;

  -- a) upsert desired
  insert into public.vr_conflicts (kind, key, detail, first_seen, last_seen)
  select x->>'kind', x->>'key', coalesce(x->'detail', '{}'::jsonb), now(), now()
    from jsonb_array_elements(coalesce(p_conflicts, '[]'::jsonb)) x
  on conflict (key) do update set
    last_seen   = now(),
    detail      = excluded.detail,
    resolved_at = null,
    notified_at = case when public.vr_conflicts.resolved_at is not null
                       then null else public.vr_conflicts.notified_at end;

  -- b) resolve: aktivní, které už v desired nejsou
  update public.vr_conflicts
     set resolved_at = now()
   where resolved_at is null
     and not (key = any(v_keys));

  -- c1) vyřešené bez potvrzovacího e-mailu → vrátit + označit resolved_notified
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'detail', detail)), '[]'::jsonb)
    into v_res
    from public.vr_conflicts
   where resolved_at is not null
     and coalesce((detail->>'resolved_notified')::boolean, false) = false;

  update public.vr_conflicts
     set detail = jsonb_set(detail, '{resolved_notified}', 'true'::jsonb, true)
   where resolved_at is not null
     and coalesce((detail->>'resolved_notified')::boolean, false) = false;

  -- c2) nové aktivní bez e-mailu → označit notified + vrátit k odeslání
  with n as (
    update public.vr_conflicts
       set notified_at = now()
     where resolved_at is null and notified_at is null
    returning kind, key, detail
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'detail', detail)), '[]'::jsonb)
    into v_new from n;

  return jsonb_build_object('ok', true, 'to_notify_new', v_new, 'to_notify_resolved', v_res);
end
$function$;


-- ---------- 3) ČTENÍ PRO BANNER /sprava/ (key-gated admin RPC) ----------
-- Vrací aktivní konflikty + nedávno vyřešené (7 dní), aby banner mohl ukázat
-- i „✅ vyřešeno". Stejný auth model jako ostatní admin RPC.
create or replace function public.vr_admin_conflicts(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v json;
begin
  perform public._vr_admin_auth(p_admin_key);
  select coalesce(json_agg(row order by is_open desc, srt desc), '[]'::json) into v
  from (
    select json_build_object(
      'id', id, 'kind', kind, 'key', key, 'detail', detail,
      'first_seen', first_seen, 'last_seen', last_seen,
      'resolved_at', resolved_at, 'notified_at', notified_at
    ) as row,
    (resolved_at is null) as is_open,
    coalesce(resolved_at, last_seen) as srt
    from public.vr_conflicts
    where resolved_at is null
       or resolved_at > now() - interval '7 days'
  ) s;
  return json_build_object('ok', true, 'conflicts', v);
end
$function$;


-- ---------- GRANTy ----------
revoke all on function public.vr_apply_conflicts(jsonb) from public, anon, authenticated;
grant  execute on function public.vr_apply_conflicts(jsonb) to service_role;
grant  execute on function public.vr_admin_conflicts(text)  to anon, authenticated;
