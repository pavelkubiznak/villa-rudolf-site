-- Villa Rudolf — Storage bucket vr-album: limit velikosti a typů na straně serveru
-- ============================================================================
-- Audit 8. 9. 2026 (nález F005): Edge Function `album` kontrolovala velikost
-- souboru jen podle hodnoty `size`, kterou pošle klient (index.ts, MAX_BYTES).
-- Kdo volá funkci mimo prohlížeč, pošle size=1 a přes podepsanou upload URL
-- pak nahraje cokoli. Tahle migrace dává limit tam, kde ho obejít nejde — na
-- bucket: Storage odmítne PUT přes podepsanou URL, když objekt překročí
-- file_size_limit nebo má MIME typ mimo allowed_mime_types.
--
-- Bucket `vr-album` v migracích nikdy nebyl (založený ručně v dashboardu),
-- proto insert … on conflict: na živé DB jen doplní limity existujícímu
-- řádku, na čistém projektu bucket založí. Hodnoty odpovídají tomu, co Edge
-- Function beztak vyžaduje:
--   * 15 MB = MAX_BYTES v functions/album/index.ts i CFG.MAX_BYTES v album/album.js,
--   * MIME whitelist = EXT_BY_TYPE v index.ts (klient po kompresi posílá vždy
--     image/jpeg, viz compress() v album.js) — nic, co funkce podepíše, tedy
--     bucket neodmítne.
-- `public = false` se nastavuje jen při ZALOŽENÍ (čistý projekt): album je
-- soukromé a čte se výhradně přes signed URL z Edge Function. U existujícího
-- bucketu se příznak nemění — ověřit v dashboardu, že je private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vr-album',
  'vr-album',
  false,
  15 * 1024 * 1024,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp',
        'image/heic', 'image/heif', 'image/gif']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
