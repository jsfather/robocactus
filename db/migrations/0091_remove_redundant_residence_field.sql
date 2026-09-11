-- The profile form keeps one canonical location field: address. Historical
-- residence values remain stored, but they no longer block completion.
update public.participant_field_rules
set is_required = false, updated_at = now()
where field_key = 'residence';
