-- Fix Missing Teams & Convert Legacy Credits 1:1
DO $$
DECLARE
  prof RECORD;
  new_team_id UUID;
  converted_audits INTEGER;
BEGIN
  -- Find all users who are missing a team
  FOR prof IN SELECT id, first_name, credits FROM public.profiles WHERE team_id IS NULL LOOP
    
    -- Convert their legacy page credits directly to Audit Credits (1:1)
    IF prof.credits > 0 THEN
      converted_audits := prof.credits;
    ELSE
      converted_audits := 2; -- Default free starting credits
    END IF;

    -- Create their team
    INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
    VALUES (COALESCE(prof.first_name, 'Personal') || '''s Team', prof.id, converted_audits, 1)
    RETURNING id INTO new_team_id;

    -- Link their profile to the new team
    UPDATE public.profiles SET team_id = new_team_id WHERE id = prof.id;
    
  END LOOP;
END;
$$;
