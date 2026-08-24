-- Realtime for live results boards (idempotent)

do $$
begin
  begin
    alter publication supabase_realtime add table results;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table leagues;
  exception
    when duplicate_object then null;
  end;
end $$;
