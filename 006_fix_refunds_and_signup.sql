-- ====================================================================
-- LeaseAlign AI Migration 006: Fix Refunds & Signup Trigger
-- ====================================================================

-- 1. Fix handle_new_user() to create a team automatically for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_team_id UUID;
BEGIN
  -- Create a default team for the user with 100 hosted credits
  INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
  VALUES ('My Team', new.id, 100, 1)
  RETURNING id INTO new_team_id;

  -- Insert the profile and link to the new team
  INSERT INTO public.profiles (id, email, team_id, credits, byok_credits, first_name, last_name, company_name)
  VALUES (
    new.id,
    new.email,
    new_team_id,
    0, -- Hosted SaaS credits are now driven by teams.audit_credits
    0,   -- Default BYOK credits
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'company_name', '')
  )
  ON CONFLICT (id) DO UPDATE 
  SET email = EXCLUDED.email,
      team_id = COALESCE(EXCLUDED.team_id, profiles.team_id),
      first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
      company_name = COALESCE(EXCLUDED.company_name, profiles.company_name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Fix refund_user_credits() to refund teams.audit_credits
CREATE OR REPLACE FUNCTION public.refund_user_credits(target_user_id UUID, pages_to_refund INTEGER, plan_mode TEXT)
RETURNS VOID AS $$
DECLARE
  v_team_id UUID;
BEGIN
  IF plan_mode = 'hosted' THEN
    -- Look up the team_id for the user
    SELECT team_id INTO v_team_id FROM public.profiles WHERE id = target_user_id;
    
    IF v_team_id IS NOT NULL THEN
      UPDATE public.teams
      SET audit_credits = audit_credits + pages_to_refund
      WHERE id = v_team_id;
    END IF;
  ELSIF plan_mode = 'byok' THEN
    IF (SELECT byok_credits FROM public.profiles WHERE id = target_user_id) < 900000 THEN
      UPDATE public.profiles
      SET byok_credits = byok_credits + pages_to_refund
      WHERE id = target_user_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
