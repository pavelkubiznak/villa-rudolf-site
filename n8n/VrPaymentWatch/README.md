# VrPaymentWatch — párování plateb z Fia

**Stav: připraveno, NENASAZENO.** Čeká na tři read-only tokeny Fia a na spuštění migrace
`supabase/migrations/20260910_vr_payments.sql`.

Tahle složka **není importovatelné workflow** (na rozdíl od `VrEchalupyInquiry`). Je to
referenční kód do Code node plus popis, jak workflow poskládat — stejná konvence jako
`VrDailyTasks`. Poskládat ho ručně je bezpečnější než importovat JSON, který nikdo nespustil.

## Řetěz uzlů

| # | Uzel | Nastavení |
|---|---|---|
| 1 | **Schedule Trigger** | každou hodinu (Fio má limit 1 dotaz / 30 s na token, tohle je hluboko pod ním) |
| 2 | **Code** — „Načíst pohyby z Fia" | obsah `VrPaymentWatch.code.js` **bez úvodního blokového komentáře** |
| 3 | **HTTP Request** — „Ingest do Supabase" | `POST {SUPABASE_URL}/rest/v1/rpc/vr_ingest_payments`, tělo = `{{ $json.ingestBody }}`, credential se **service-role** klíčem (stejný jako `VrConflictWatch` používá pro `vr_apply_conflicts`) |
| 4 | **IF** + **Send Email** | pošli souhrn majiteli, když `new > 0` nebo když je v `summary.ucty` slovo „nedostupná" |

## Co je potřeba nastavit

**Tři read-only tokeny Fia** do prostředí n8n instance (ne do repa — je veřejné):

```
FIO_TOKEN_VR_CZK · FIO_TOKEN_VR_EUR · FIO_TOKEN_SINTERA
```

Token se zakládá v internetbankingu Fia, vždy **pouze ke čtení** a **k jednomu účtu**.
Plný token umí i posílat platby a do automatu nepatří. Nenastavený token = účet se přeskočí
a napíše se to do souhrnu; když nechybí jen jeden, ale všechny, běh skončí chybou (prázdná
dávka vypadá stejně jako „nikdo nic neposlal", a to je horší než hlášená chyba).

**Proč se čte i hlavní účet Sintery:** zálohová faktura se dá omylem vystavit na něj. Kdyby
se sledovaly jen villové účty, taková platba by se ztratila a předrezervace by propadla,
přestože host zaplatil. Párování jde podle variabilního symbolu bez ohledu na účet; že je
potřeba přeúčtovat, pak řekne `paid_mismatch` v `/sprava/`.

## ⚠️ První běhy nech read-only

V `VrPaymentWatch.code.js` je `AUTOCONFIRM = false`. Znamená to, že se nic nepotvrdí samo —
platby se jen uloží a spárují jako **návrhy**, které se odklepnou v `/sprava/` v sekci
„Platby k vyřízení". Pravidla jsou postavená proti dokumentaci Fia, ne proti skutečnému
výpisu tohohle účtu; první dávku je potřeba přečíst. Teprve až bude sedět, přepni na `true`.

Přepnutí **nepůsobí zpětně**: pohyb už jednou uložený se podruhé nezpracovává (unikátní
index na `(source, account, tx_id)`), takže staré návrhy zůstanou k odklepnutí. To je záměr.

## Proč ne endpoint `last`

Fio u něj drží ukazatel na své straně a při každém stažení ho posune. Kdyby n8n spadlo po
stažení a před zápisem, ty pohyby už nikdy znovu nedostaneš. Proto se čte klouzavé okno
posledních 30 dní a odduplikovává se podle ID pohybu — idempotentní, přežije to výpadek.

## Testy

```bash
node n8n/VrPaymentWatch/test_VrPaymentWatch.mjs
```

Bez sítě a bez závislostí. Code node se načte jako text a spustí v podvržené obálce, takže
se testuje přesně ten kód, který se vkládá do n8n. Hlídá se čtení sloupců **podle jména**
(Fio číslování se po internetu dohledává s rozpory, hlavně u VS/KS/SS), odfiltrování
odchozích plateb, nečitelné pohyby, výpadek jednoho účtu, chybějící tokeny a to, že
`AUTOCONFIRM` je ve verzi v repu vypnutý.

Párování samotné se testuje na straně databáze: `supabase/tests/test_vr_payments.sql`.
