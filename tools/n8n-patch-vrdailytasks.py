#!/usr/bin/env python3
"""Villa Rudolf — nasazení VrDailyTasks do živého n8n bez ručního editování JSONu.

Vezme export živého workflow (n8n export:workflow), do Code node „Spočítat úkoly"
vloží aktuální VrDailyTasks.code.js (bez úvodního blokového komentáře) a před
„Načíst pobyty (service-role)" zapojí uzly „Načíst konfiguraci (service-role)"
(heslo Wi-Fi z vr_admin_config) a „Načíst hlášení cizinců (service-role)"
(RPC vr_ubyport_due — lhůty UbyPort), pokud tam ještě nejsou. Nic jiného nemění:
credentials, ostatní uzly, active — všechno zůstává z živého exportu.

Použití na serveru (sintera-velin), viz __jak_nasadit__ v VrDailyTasks.workflow.json:
  docker exec n8n n8n export:workflow --id=VrDailyTasks001 --output=/tmp/bak.json
  docker cp n8n:/tmp/bak.json /tmp/bak.json
  python3 tools/n8n-patch-vrdailytasks.py /tmp/bak.json /tmp/patched.json
  docker cp /tmp/patched.json n8n:/tmp/patched.json
  docker exec n8n n8n import:workflow --input=/tmp/patched.json
  docker exec n8n n8n publish:workflow --id=VrDailyTasks001   # import deaktivuje
  docker restart n8n                                           # jinak jede starý kód z paměti

Bez argumentů se spustí samokontrola nad exportem v repu (n8n/VrDailyTasks/).
"""
import json, sys, os, copy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CODE_JS = os.path.join(REPO, 'n8n', 'VrDailyTasks', 'VrDailyTasks.code.js')
REF_JSON = os.path.join(REPO, 'n8n', 'VrDailyTasks', 'VrDailyTasks.workflow.json')

CODE_NODE = 'Spočítat úkoly'
BOOKINGS_NODE = 'Načíst pobyty (service-role)'
CONFIG_NODE = 'Načíst konfiguraci (service-role)'
UBY_NODE = 'Načíst hlášení cizinců (service-role)'
HOLDS_NODE = 'Načíst předrezervace (service-role)'


def load_workflow(obj):
    """Export n8n bývá pole workflow, samotný workflow, nebo náš stub pod klíčem 'workflow'."""
    if isinstance(obj, list):
        if len(obj) != 1:
            sys.exit(f'export obsahuje {len(obj)} workflow, čekám 1')
        return obj[0], (lambda w: [w])
    if 'nodes' in obj:
        return obj, (lambda w: w)
    if 'workflow' in obj:
        outer = obj
        return obj['workflow'], (lambda w: {**outer, 'workflow': w})
    sys.exit('nepoznávám tvar exportu (chybí nodes / workflow)')


def code_without_header(src):
    """Návod v exportu: vložit kód od řádku `const SUPA = ` dál (úvodní komentář pryč)."""
    lines = src.split('\n')
    for i, l in enumerate(lines):
        if l.startswith('const SUPA = '):
            return '\n'.join(lines[i:])
    sys.exit('v VrDailyTasks.code.js chybí řádek `const SUPA = `')


def patch(w):
    w = copy.deepcopy(w)
    nodes = w['nodes']
    by_name = {n['name']: n for n in nodes}
    for req in (CODE_NODE, BOOKINGS_NODE):
        if req not in by_name:
            sys.exit(f'v exportu chybí uzel „{req}"')

    # 1) kód
    with open(CODE_JS, encoding='utf-8') as f:
        by_name[CODE_NODE]['parameters']['jsCode'] = code_without_header(f.read())

    # 2) uzel s konfigurací — zrcadlí „Načíst pobyty" (stejné credentials, hlavičky)
    conns = w.setdefault('connections', {})
    if CONFIG_NODE not in by_name:
        src = by_name[BOOKINGS_NODE]
        cfg = {
            'parameters': {
                'url': 'https://fpknbrzbqpalguajskut.supabase.co/rest/v1/vr_admin_config',
                'authentication': src['parameters'].get('authentication', 'genericCredentialType'),
                'genericAuthType': src['parameters'].get('genericAuthType', 'httpHeaderAuth'),
                'sendQuery': True,
                'queryParameters': {'parameters': [
                    {'name': 'select', 'value': 'k,v'},
                    {'name': 'k', 'value': 'eq.wifi_password'},
                ]},
                'sendHeaders': src['parameters'].get('sendHeaders', True),
                'headerParameters': copy.deepcopy(src['parameters'].get('headerParameters', {'parameters': []})),
                'options': {'response': {'response': {'responseFormat': 'json'}}},
            },
            'id': 'a1000000-0000-4000-8000-000000000005',
            'name': CONFIG_NODE,
            'type': 'n8n-nodes-base.httpRequest',
            'typeVersion': src.get('typeVersion', 4.2),
            'position': [src['position'][0] - 220, src['position'][1]],
            # BEZ alwaysOutputData by prázdná odpověď (klíč nevyplněný) zastavila celý řetěz.
            'alwaysOutputData': True,
            'notes': 'Heslo Wi-Fi (wifi_password) z vr_admin_config — čte ho „Spočítat úkoly" jménem uzlu.',
        }
        if 'credentials' in src:
            cfg['credentials'] = copy.deepcopy(src['credentials'])
        nodes.insert(nodes.index(src), cfg)

        # přesměrovat vše, co dnes vede do „Načíst pobyty", na nový uzel
        redirected = 0
        for from_name, outs in conns.items():
            for branch in outs.get('main', []):
                for link in branch:
                    if link.get('node') == BOOKINGS_NODE:
                        link['node'] = CONFIG_NODE
                        redirected += 1
        if redirected == 0:
            sys.exit(f'do „{BOOKINGS_NODE}" nevede žádné spojení — nečekaný tvar workflow')
        conns[CONFIG_NODE] = {'main': [[{'node': BOOKINGS_NODE, 'type': 'main', 'index': 0}]]}
    else:
        by_name[CONFIG_NODE]['alwaysOutputData'] = True

    # 3) lhůty hlášení cizinců — RPC vr_ubyport_due() (grant jen service_role).
    #    Zapojí se těsně před „Načíst pobyty", stejně jako konfigurace.
    if UBY_NODE not in by_name:
        src = by_name[BOOKINGS_NODE]
        uby = {
            'parameters': {
                'method': 'POST',
                'url': 'https://fpknbrzbqpalguajskut.supabase.co/rest/v1/rpc/vr_ubyport_due',
                'authentication': src['parameters'].get('authentication', 'genericCredentialType'),
                'genericAuthType': src['parameters'].get('genericAuthType', 'httpHeaderAuth'),
                'sendHeaders': src['parameters'].get('sendHeaders', True),
                'headerParameters': copy.deepcopy(src['parameters'].get('headerParameters', {'parameters': []})),
                'sendBody': True,
                'specifyBody': 'json',
                'jsonBody': '{}',
                'options': {'response': {'response': {'responseFormat': 'json'}}},
            },
            'id': 'a1000000-0000-4000-8000-000000000006',
            'name': UBY_NODE,
            'type': 'n8n-nodes-base.httpRequest',
            'typeVersion': src.get('typeVersion', 4.2),
            'position': [src['position'][0] - 110, src['position'][1] + 160],
            # Chyba (např. migrace ještě není v DB) nesmí zastavit denní e-mail.
            'alwaysOutputData': True,
            'onError': 'continueRegularOutput',
            'notes': 'Lhůty UbyPort (vr_ubyport_due) — čte je „Spočítat úkoly" jménem uzlu.',
        }
        if 'credentials' in src:
            uby['credentials'] = copy.deepcopy(src['credentials'])
        nodes.insert(nodes.index(src), uby)
        redirected = 0
        for from_name, outs in conns.items():
            for branch in outs.get('main', []):
                for link in branch:
                    if link.get('node') == BOOKINGS_NODE:
                        link['node'] = UBY_NODE
                        redirected += 1
        if redirected == 0:
            sys.exit(f'do „{BOOKINGS_NODE}" nevede žádné spojení — nečekaný tvar workflow')
        conns[UBY_NODE] = {'main': [[{'node': BOOKINGS_NODE, 'type': 'main', 'index': 0}]]}
    else:
        by_name[UBY_NODE]['alwaysOutputData'] = True

    # 4) předrezervace — bez nich se přímý prodej (v kalendáři pod uidh předrezervace)
    #    nespáruje s hostem a jde v e-mailu dvakrát. Ze vr_holds jen termín, stav a vazba
    #    na pobyt; uidh si kód dopočítá z id. Zapojí se těsně před „Načíst pobyty".
    if HOLDS_NODE not in by_name:
        src = by_name[BOOKINGS_NODE]
        hn = {
            'parameters': {
                'url': 'https://fpknbrzbqpalguajskut.supabase.co/rest/v1/vr_holds',
                'authentication': src['parameters'].get('authentication', 'genericCredentialType'),
                'genericAuthType': src['parameters'].get('genericAuthType', 'httpHeaderAuth'),
                'sendQuery': True,
                'queryParameters': {'parameters': [
                    {'name': 'select', 'value': 'id,arrival,departure,status,hold_until,booking_id'},
                ]},
                'sendHeaders': src['parameters'].get('sendHeaders', True),
                'headerParameters': copy.deepcopy(src['parameters'].get('headerParameters', {'parameters': []})),
                'options': {'response': {'response': {'responseFormat': 'json'}}},
            },
            'id': 'a1000000-0000-4000-8000-000000000007',
            'name': HOLDS_NODE,
            'type': 'n8n-nodes-base.httpRequest',
            'typeVersion': src.get('typeVersion', 4.2),
            'position': [src['position'][0] - 110, src['position'][1] - 160],
            # Prázdná tabulka ani chyba nesmí zastavit denní e-mail — kód pak páruje jako dřív.
            'alwaysOutputData': True,
            'onError': 'continueRegularOutput',
            'notes': 'Předrezervace (vr_holds) — čte je „Spočítat úkoly" jménem uzlu.',
        }
        if 'credentials' in src:
            hn['credentials'] = copy.deepcopy(src['credentials'])
        nodes.insert(nodes.index(src), hn)
        redirected = 0
        for from_name, outs in conns.items():
            for branch in outs.get('main', []):
                for link in branch:
                    if link.get('node') == BOOKINGS_NODE:
                        link['node'] = HOLDS_NODE
                        redirected += 1
        if redirected == 0:
            sys.exit(f'do „{BOOKINGS_NODE}" nevede žádné spojení — nečekaný tvar workflow')
        conns[HOLDS_NODE] = {'main': [[{'node': BOOKINGS_NODE, 'type': 'main', 'index': 0}]]}
    else:
        by_name[HOLDS_NODE]['alwaysOutputData'] = True

    # 5) Execute Once na uzlech za „Načíst žádosti“: ten vrací pole a n8n ho rozseká
    #    na položky — bez tohohle by konfigurace, hlášení i pobyty běžely jednou za
    #    každou otevřenou žádost a úkoly v e-mailu by se zdvojovaly.
    by_name = {n['name']: n for n in nodes}
    for name in (CONFIG_NODE, UBY_NODE, HOLDS_NODE, BOOKINGS_NODE):
        by_name[name]['executeOnce'] = True
    return w


def chain(w):
    """Řetěz od triggeru pro kontrolu očima."""
    conns = w.get('connections', {})
    start = next((n['name'] for n in w['nodes'] if n['type'].endswith('scheduleTrigger')), None)
    out, cur, seen = [], start, set()
    while cur and cur not in seen:
        out.append(cur); seen.add(cur)
        nxt = conns.get(cur, {}).get('main', [[]])
        cur = nxt[0][0]['node'] if nxt and nxt[0] else None
    return ' → '.join(out)


def main():
    if len(sys.argv) == 1:
        src, dst = REF_JSON, None
    elif len(sys.argv) == 3:
        src, dst = sys.argv[1], sys.argv[2]
    else:
        sys.exit(__doc__)
    with open(src, encoding='utf-8') as f:
        raw = json.load(f)
    w, wrap = load_workflow(raw)
    before = chain(w)
    w2 = patch(w)
    after = chain(w2)
    code = next(n for n in w2['nodes'] if n['name'] == CODE_NODE)['parameters']['jsCode']
    print(f'řetěz před:  {before}')
    print(f'řetěz po:    {after}')
    print(f'jsCode: {len(code)} znaků, začíná: {code[:40]!r}')
    if CONFIG_NODE not in after or after.index(CONFIG_NODE) > after.index(BOOKINGS_NODE):
        sys.exit('KONTROLA SELHALA: konfigurace není před „Načíst pobyty"')
    if UBY_NODE not in after or after.index(UBY_NODE) > after.index(BOOKINGS_NODE):
        sys.exit('KONTROLA SELHALA: hlášení cizinců není před „Načíst pobyty"')
    if HOLDS_NODE not in after or after.index(HOLDS_NODE) > after.index(BOOKINGS_NODE):
        sys.exit('KONTROLA SELHALA: předrezervace nejsou před „Načíst pobyty"')
    if dst:
        with open(dst, 'w', encoding='utf-8') as f:
            json.dump(wrap(w2), f, ensure_ascii=False, indent=2)
        print(f'zapsáno: {dst}')
    else:
        print('(samokontrola nad exportem v repu — bez zápisu; pro ostrý běh: <export.json> <patched.json>)')


if __name__ == '__main__':
    main()
