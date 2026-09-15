-- Villa Rudolf — úklid: nadbytečný index vr_msglog_booking_idx
-- ============================================================
-- Audit 8. 9. 2026 (nález F084): `unique (booking_id, msg_key)` v
-- 20260724_vr_admin.sql:58 vytváří B-tree index s booking_id jako prvním
-- sloupcem; dotazy `where booking_id = …` (vr_admin_list_bookings,
-- vr_admin_msg_log, CASCADE při mazání pobytu) ho použijí. Samostatný index
-- z ř. 60 je tedy druhý index nad stejným prefixem — jen stojí zápis a místo.
-- Bez vlivu na chování. Aplikovaná migrace se needituje, proto drop tady.
drop index if exists public.vr_msglog_booking_idx;
