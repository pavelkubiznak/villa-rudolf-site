-- Villa Rudolf — žádosti z webu: čtení v /sprava/ + stavy
-- ============================================================================
-- Formulář na homepage zapisuje do public.vr_requests přes SECURITY DEFINER
-- funkci public.vr_request. Zápis fungoval od začátku, ALE tabulku nikdy nikdo
-- nečetl — žádné admin RPC, žádná sekce v /sprava/, žádné n8n workflow.
-- Žádost od Leny Rohrberg (9. 8. 2026) tak ležela devět dní bez povšimnutí,
-- než se hosté ozvali podruhé přes platformu. Tahle migrace dodává cestu ven.
--
-- `status` a `notified_at` jsou SCHVÁLNĚ na sobě nezávislé:
--   status      — co s žádostí udělal majitel: new → done (přepíná /sprava/)
--                 ('open' je povolený mezistav pro „rozpracováno", zatím nikdo
--                  nenastavuje automaticky)
--   notified_at — kdy o ní odešel e-mail (zapisuje n8n VrWebRequest)
-- Kdyby n8n přepisoval i status, přepsal by majiteli jeho vlastní změnu při
-- souběhu. Takhle si každý sahá na svoje a doručenka nikdy nepřepíše rozhodnutí.
-- n8n bere výhradně řádky, kde je notified_at NULL — to je pojistka proti
-- dvojímu odeslání.

-- ---------- 1) sloupec pro doručenku + index pro polling ----------
alter table public.vr_requests add column if not exists notified_at timestamptz;

-- n8n se ptá každých 5 minut na `status='new' and notified_at is null`;
-- bez indexu by to byl seq scan při každém dotazu.
create index if not exists vr_requests_pending_idx
  on public.vr_requests (created_at)
  where notified_at is null;

-- Seznam v /sprava/ řadí od nejnovější.
create index if not exists vr_requests_created_idx
  on public.vr_requests (created_at desc);

-- Stavový check zavádíme až teď, aby překlep v n8n nebo v /sprava/ neuložil
-- nesmysl. `not valid` schválně: existující řádky se nekontrolují (nemá je co
-- porušit, ale migrace tím nespadne, kdyby v ostrých datech byl starý stav).
alter table public.vr_requests drop constraint if exists vr_requests_status_chk;
alter table public.vr_requests add constraint vr_requests_status_chk
  check (status in ('new', 'open', 'done')) not valid;


-- ---------- 2) ADMIN: seznam žádostí z webu ----------
-- Stejný model jako vr_admin_list_bookings — gated hashem admin klíče,
-- rate-limit řeší _vr_admin_auth.
create or replace function public.vr_admin_list_requests(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
  perform public._vr_admin_auth(p_admin_key);

  select coalesce(json_agg(row order by created_at desc), '[]'::json) into v_rows
  from (
    select json_build_object(
      'id', r.id,
      'created_at', r.created_at,
      'name', r.name,
      'email', r.email,
      'phone', r.phone,
      'lang', r.lang,
      'arrival', r.arrival,
      'departure', r.departure,
      'adults', r.adults,
      'children', r.children,
      'pets', r.pets,
      'total', r.total,
      'breakdown', r.breakdown,
      'message', r.message,
      'status', r.status,
      'notified_at', r.notified_at
    ) as row, r.created_at
    from public.vr_requests r
  ) s;

  return json_build_object('ok', true, 'requests', v_rows);
end
$function$;


-- ---------- 3) ADMIN: přepnutí stavu žádosti ----------
-- Používá /sprava/ pro „Vyřízeno" a zpět. Na 'new' se vracet nedá — tím by se
-- žádost znovu poslala e-mailem; návrat z 'done' vede na 'open'.
create or replace function public.vr_admin_set_request_status(
  p_admin_key text,
  p_id        uuid,
  p_status    text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._vr_admin_auth(p_admin_key);

  if p_status not in ('open', 'done') then
    return json_build_object('ok', false, 'error', 'status_invalid');
  end if;

  update public.vr_requests set status = p_status where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  return json_build_object('ok', true);
end
$function$;


-- ---------- 4) granty ----------
-- anon smí funkce volat, ale bez správného admin klíče z nich nic nedostane.
grant execute on function public.vr_admin_list_requests(text) to anon, authenticated;
grant execute on function public.vr_admin_set_request_status(text, uuid, text) to anon, authenticated;
