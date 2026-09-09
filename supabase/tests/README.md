# Testy schématu — jak je pustit

Migrace se dají spustit proti **dočasnému lokálnímu Postgresu**, aniž by se sáhlo na ostrou
databázi. Ušetří to kolo „nasadím a uvidím": chyba v plpgsql se jinak pozná až tím, že
`/sprava/` přestane fungovat.

```bash
# 1) dočasný server (data v /tmp, po restartu stroje jsou pryč)
initdb -D /tmp/vrpg/data -U postgres --auth=trust
pg_ctl -D /tmp/vrpg/data -o '-k /tmp/vrpg -p 55432 -c listen_addresses=' -l /tmp/vrpg/log start
psql -h /tmp/vrpg -p 55432 -U postgres -c 'create database vrtest'

# 2) kulisa = to, co v ostré Supabase existuje, ale v repu není
#    (základní tabulky a role zakládá Supabase sama)
psql -h /tmp/vrpg -p 55432 -U postgres -d vrtest -v ON_ERROR_STOP=1 -f supabase/tests/_kulisa.sql

# 3) testovaná migrace + testy
psql -h /tmp/vrpg -p 55432 -U postgres -d vrtest -v ON_ERROR_STOP=1 -f supabase/migrations/20260909_vr_holds.sql
psql -h /tmp/vrpg -p 55432 -U postgres -d vrtest -f supabase/tests/test_vr_holds.sql
```

Postgres nejde spustit pod rootem — pokud jsi root, pusť to přes
`su postgres -s /bin/bash -c '…'` a dej `/tmp/vrpg` do vlastnictví uživatele `postgres`.

## Co `test_vr_holds.sql` ověřuje

Výstup se čte očima (žádný assert framework), ale každý blok má vytištěné očekávání
vedle skutečnosti:

1. bez správného admin klíče neprojde nic
2. `hold_until` se dopočítá ze splatnosti + 3 dny
3. bez splatnosti dnes + 14 dní
4. `uidh` je 16 lowercase hex a je deterministické
   (**ověřeno, že SQL, Python i JS dávají tentýž hash** — `sha256('vr-hold:'||id)[:16]`)
5. `vr_public_holds()` pouští ven jen termín — žádnou fakturu, částku ani jméno
6. propadlý hold se ven nepublikuje → termín se uvolní sám, bez cronu
7. potvrzení: `kind` se změní na `direct`, `hold_until` zmizí, platba se zapíše
8. pojistka měna ⇒ účet ve všech šesti kombinacích
9. validace vstupů (obrácené datum, neznámá měna / účet / stav)
10. `hold` bez `hold_until` neprojde ani přímým insertem (constraint)
11. admin výpis dopočítává `expired`, `account_mismatch` i `paid_mismatch`
12. `anon` na tabulku nedosáhne, ale veřejnou funkci zavolat smí

Migrace je **idempotentní** — pustit ji podruhé projde (jen `NOTICE: … already exists`).
