-- Villa Rudolf — heslo Wi-Fi ven z repa (vr_admin_config, klíč wifi_password)
-- ============================================================================
-- Stav před touto migrací: heslo k síti „Rudolf Wi-Fi" bylo napsané natvrdo ve
-- veřejném repu — v sprava/sprava.js (konstanta WIFI) i v n8n/VrDailyTasks
-- (VrDailyTasks.code.js). Audit 8. 9. 2026, položka „Heslo Wi-Fi natvrdo".
--
-- Oprava: heslo se ukládá do vr_admin_config pod klíč `wifi_password` a čte se
--   * v /sprava/ přes vr_admin_get_config (whitelist rozšířen z `ubyport_*`
--     na `ubyport_*` + `wifi_*`), zapisuje přes vr_admin_set_config (Nastavení),
--   * v n8n VrDailyTasks service-role klíčem přímo z tabulky
--     (GET /rest/v1/vr_admin_config?select=k,v&k=eq.wifi_password).
-- admin_key_sha256 ani purge_secret_sha256 přes RPC dál nejdou číst ani přepsat
-- (regex je nepustí) — model z 20260724_vr_admin_config.sql se nemění.
--
-- POSTUP NASAZENÍ (ručně, majitel):
--   a) aplikovat tuhle migraci (SQL editor Supabase nebo `supabase db query --linked --file`),
--   b) v /sprava/ → Nastavení vyplnit „Heslo Wi-Fi" a uložit,
--   c) staré heslo je v git historii veřejného repa → na routeru ho ZMĚNIT a do
--      Nastavení zapsat už to nové (do té doby zná heslo k domácí síti kdokoli,
--      kdo si přečte historii repa),
--   d) v n8n do workflow VrDailyTasks přidat uzel „Načíst konfiguraci (service-role)"
--      podle n8n/VrDailyTasks/VrDailyTasks.workflow.json a nahrát nový kód
--      (bez toho zůstane v denním e-mailu viditelně `{WIFI_HESLO}` — nic se nerozbije,
--      jen to připomene, že krok chybí),
--   e) v STAV.md přepnout řádek „Heslo Wi-Fi" na ✅.

-- ---------- GET: ubyport_* + wifi_* (NE admin_key_sha256, NE purge_secret_sha256) ----------
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
  where k ~ '^(ubyport|wifi)_';   -- whitelist: jen konfigurace ubytovatele
  return json_build_object('ok', true, 'config', v);
end
$function$;

-- ---------- SET: upsert jednoho whitelistovaného klíče (ubyport_* nebo wifi_*) ----------
-- Prázdná hodnota => klíč se smaže. Hashe klíčů nelze zapsat (regex je nepustí).
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
  if v_key !~ '^(ubyport|wifi)_[a-z0-9_]+$' then
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
