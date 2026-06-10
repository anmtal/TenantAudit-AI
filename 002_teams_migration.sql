-- ====================================================================
-- LeaseAlign AI Migration: Per-Audit & Multi-Seat Teams
-- ====================================================================

-- 1. Create Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  plan_tier TEXT,
  audit_credits INTEGER NOT NULL DEFAULT 0 CONSTRAINT audit_credits_non_negative CHECK (audit_credits >= 0),
  seat_limit INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view their team" ON public.teams;
CREATE POLICY "Allow users to view their team" 
  ON public.teams FOR SELECT 
  USING (
    id IN (SELECT team_id FROM public.profiles WHERE profiles.id = auth.uid()) 
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "Allow owner to update team" ON public.teams;
CREATE POLICY "Allow owner to update team" 
  ON public.teams FOR UPDATE 
  USING (owner_id = auth.uid());

-- 2. Modify Profiles Table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- 3. Automatic Team Creation & Legacy Credit Migration Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_team_id UUID;
BEGIN
  -- Create a personal team for the user
  INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
  VALUES (COALESCE(new.raw_user_meta_data->>'first_name', 'Personal') || '''s Team', new.id, 2, 1)
  RETURNING id INTO new_team_id;

  -- Create profile linked to the team
  INSERT INTO public.profiles (id, email, credits, byok_credits, first_name, last_name, company_name, team_id)
  VALUES (
    new.id,
    new.email,
    0, -- legacy page credits set to 0
    0, -- Default BYOK credits
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'company_name', ''),
    new_team_id
  )
  ON CONFLICT (id) DO UPDATE 
  SET email = EXCLUDED.email,
      first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
      company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
      team_id = COALESCE(profiles.team_id, EXCLUDED.team_id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Migrate Existing Users
DO $$
DECLARE
  prof RECORD;
  new_team_id UUID;
  converted_audits INTEGER;
BEGIN
  FOR prof IN SELECT id, first_name, credits, team_id FROM public.profiles WHERE team_id IS NULL LOOP
    -- Convert every 100 page credits to 10 audits (roughly 10 pages per audit), min 1 audit if they had > 0 credits
    IF prof.credits > 0 THEN
      converted_audits := GREATEST(1, prof.credits / 10);
    ELSE
      converted_audits := 0;
    END IF;

    INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
    VALUES (COALESCE(prof.first_name, 'Personal') || '''s Team', prof.id, converted_audits, 1)
    RETURNING id INTO new_team_id;

    UPDATE public.profiles SET team_id = new_team_id WHERE id = prof.id;
  END LOOP;
END;
$$;

-- 5. Safe Credit Deduction RPC Helper
CREATE OR REPLACE FUNCTION public.deduct_user_credits(target_user_id UUID, pages_to_deduct INTEGER, plan_mode TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_bal INTEGER;
  user_team_id UUID;
BEGIN
  IF plan_mode = 'hosted' THEN
    -- Get user's team
    SELECT team_id INTO user_team_id FROM public.profiles WHERE id = target_user_id;
    IF user_team_id IS NULL THEN
      RETURN FALSE;
    END IF;
    
    -- In the new model, 'pages_to_deduct' is just '1' audit credit
    SELECT audit_credits INTO current_bal FROM public.teams WHERE id = user_team_id FOR UPDATE;
    IF current_bal >= pages_to_deduct THEN
      UPDATE public.teams
      SET audit_credits = audit_credits - pages_to_deduct
      WHERE id = user_team_id;
      RETURN TRUE;
    ELSE
      RETURN FALSE;
    END IF;
  ELSIF plan_mode = 'byok' THEN
    SELECT byok_credits INTO current_bal FROM public.profiles WHERE id = target_user_id FOR UPDATE;
    IF current_bal >= pages_to_deduct OR current_bal >= 900000 THEN
      IF current_bal < 900000 THEN
        UPDATE public.profiles
        SET byok_credits = byok_credits - pages_to_deduct
        WHERE id = target_user_id;
      END IF;
      RETURN TRUE;
    ELSE
      RETURN FALSE;
    END IF;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.refund_user_credits(target_user_id UUID, pages_to_refund INTEGER, plan_mode TEXT)
RETURNS VOID AS $$
DECLARE
  user_team_id UUID;
BEGIN
  IF plan_mode = 'hosted' THEN
    SELECT team_id INTO user_team_id FROM public.profiles WHERE id = target_user_id;
    IF user_team_id IS NOT NULL THEN
      UPDATE public.teams
      SET audit_credits = audit_credits + pages_to_refund
      WHERE id = user_team_id;
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

-- 6. Team Membership RPC (for inviting users)
CREATE OR REPLACE FUNCTION public.invite_user_to_team(target_email TEXT, inviter_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  inviter_team_id UUID;
  current_seat_limit INTEGER;
  current_member_count INTEGER;
  target_user_id UUID;
BEGIN
  -- Get inviter's team and seat limit
  SELECT id, seat_limit INTO inviter_team_id, current_seat_limit 
  FROM public.teams 
  WHERE owner_id = inviter_id;

  IF inviter_team_id IS NULL THEN
    RETURN FALSE; -- Only owners can invite
  END IF;

  -- Count current members
  SELECT COUNT(*) INTO current_member_count 
  FROM public.profiles 
  WHERE team_id = inviter_team_id;

  -- Unlimited seats or under limit
  IF current_seat_limit < 9999 AND current_member_count >= current_seat_limit THEN
    RAISE EXCEPTION 'Seat limit reached for this team.';
  END IF;

  -- Find target user
  SELECT id INTO target_user_id FROM public.profiles WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with this email not found. They must sign up first.';
  END IF;

  -- Add to team
  UPDATE public.profiles SET team_id = inviter_team_id WHERE id = target_user_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
