# Villa Rudolf – web a provozní systém

Statický web **villarudolf.com** (GitHub Pages, bez build kroku) plus provozní moduly:
`/sprava/` (admin majitele), `/registrace/` a `/checkin/` (hosté), `/album/`, `/vylety/`,
`/info/`, `/podminky/`. Schéma databáze v `supabase/migrations/`, Edge Function
`supabase/functions/album/`, exporty n8n v `n8n/`.

- Orientace v repu: [`CLAUDE.md`](CLAUDE.md)
- Kde co běží (víc repozitářů): [`MAPA-SYSTEMU.md`](MAPA-SYSTEMU.md)
- Co je rozdělané: [`STAV.md`](STAV.md)

Data výletů a počasí: repo `villa-rudolf-portal` (jediný zdroj pravdy).
Design: Claude Design handoff 07/2026 (dark, Newsreader+Archivo, ember akcent).
Testy: `node tools/test-telefon.mjs`, `node tools/test-echalupy.mjs`.
