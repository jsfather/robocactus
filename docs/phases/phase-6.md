# RoboCactus — Phase 6 Acceptance

## Delivered

- Supabase Realtime on `ticket_messages` / `tickets` / `ticket_reads`
- Live chat in `TicketInbox` (messages appear without page refresh)
- Unread tracking via `ticket_reads` + `count_unread_tickets` / `list_unread_ticket_ids`
- Unread badges: header inbox link, Staff tab, League Admin tickets tab, per-ticket dots
- Migration: `supabase/migrations/0007_phase6_realtime_tickets.sql`

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| Captain message appears live on Staff/League Admin | Open Staff inbox + team ticket side-by-side → send from team → message shows without refresh |

## Setup

1. Run `0007_phase6_realtime_tickets.sql`
2. In Supabase Dashboard → Database → Replication: confirm `ticket_messages`, `tickets`, `ticket_reads` are in `supabase_realtime`
3. Ensure RLS is enabled (Realtime respects RLS)

## Notes

- Selecting a ticket calls `mark_ticket_read` so the badge clears.
- Unread = messages from others after `last_read_at` (epoch if never opened).
