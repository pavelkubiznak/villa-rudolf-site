-- Villa Rudolf — Systém C: konfigurace ubytovatele pro Ubyport (hlášení cizinců)
-- ============================================================================
-- Majitel si v /sprava/ → Nastavení uloží IDUB + název a adresu ubytovacího
-- zařízení (hlavička UNL souboru pro Ubyport). Ukládá se do vr_admin_config
-- pod klíče s prefixem `ubyport_` (nikdy se nepřepisuje admin_key_sha256).
-- Vše přes admin RPC gated hashem admin klíče (stejný model jako ostatní admin RPC).

-- ---------- GET: vrátí jen konfiguraci ubytovatele (NE admin_key_sha256) ----------
create or replace function public.vr_admin_get_config(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v json;
begin
  perform public._vr_admin_auth(p_admin_key);
  select coalesce(json_object_agg(k, v), '{}'::json) into v
  from public.vr_admin_config
  where k ~ '^ubyport_';          -- whitelist: jen ubyport_* klíče
  return json_build_object('ok', true, 'config', v);
end
$function$;

-- ---------- SET: upsert jednoho whitelistovaného klíče (jen ubyport_*) ----------
-- Prázdná hodnota => klíč se smaže. admin_key_sha256 nelze zapsat (regex ho nepustí).
create or replace function public.vr_admin_set_config(p_admin_key text, p_key text, p_value text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text := btrim(coalesce(p_key, ''));
  v_val text := btrim(coalesce(p_value, ''));
begin
  perform public._vr_admin_auth(p_admin_key);
  if v_key !~ '^ubyport_[a-z0-9_]+$' then
    return json_build_object('ok', false, 'error', 'key_not_allowed');
  end if;
  if char_length(v_key) > 40 or char_length(v_val) > 200 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;
  if v_val = '' then
    delete from public.vr_admin_config where k = v_key;
  else
    insert into public.vr_admin_config(k, v) values (v_key, v_val)
    on conflict (k) do update set v = excluded.v;
  end if;
  return json_build_object('ok', true);
end
$function$;

grant execute on function public.vr_admin_get_config(text) to anon, authenticated;
grant execute on function public.vr_admin_set_config(text, text, text) to anon, authenticated;
