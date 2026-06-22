-- ====================================================================
-- LeaseAlign AI: Unified Database Setup, Migrations & Idempotency Fix
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Teams Table Initialization
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  stripe_subscription_id TEXT,
  plan_tier TEXT,
  audit_credits INTEGER NOT NULL DEFAULT 0 CONSTRAINT audit_credits_non_negative CHECK (audit_credits >= 0),
  seat_limit INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS pruned_members_count INTEGER DEFAULT 0;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_owner_id_key;
ALTER TABLE public.teams ADD CONSTRAINT teams_owner_id_key UNIQUE (owner_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view their team" ON public.teams;
CREATE POLICY "Allow users to view their team" 
  ON public.teams FOR SELECT 
  USING (
    id IN (SELECT team_id FROM public.profiles WHERE profiles.id = auth.uid()) 
    OR owner_id = auth.uid()
    OR id IN (SELECT team_id FROM public.team_invitations WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Allow owner to update team" ON public.teams;
CREATE POLICY "Allow owner to update team" 
  ON public.teams FOR UPDATE 
  USING (owner_id = auth.uid());

-- --------------------------------------------------------------------
-- 2. Profiles Table Initialization & Upgrades
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CONSTRAINT credits_non_negative CHECK (credits >= 0),
  first_name TEXT,
  last_name TEXT,
  phone TEXT UNIQUE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  plan_tier TEXT,
  free_credit_granted BOOLEAN DEFAULT FALSE,
  active_session_id TEXT,
  last_active_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure profile is cascading deleted if the auth user is deleted
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_session_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_tier TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_credit_granted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS unique_profiles_phone;
ALTER TABLE public.profiles ADD CONSTRAINT unique_profiles_phone UNIQUE (phone);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS credits_non_negative;
ALTER TABLE public.profiles ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view their own profiles" ON public.profiles;
CREATE POLICY "Allow users to view their own profiles" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow users to update their own profiles" ON public.profiles;
CREATE POLICY "Allow users to update their own profiles" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- --------------------------------------------------------------------
-- 3. Audits Table Initialization & Upgrades
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_name TEXT NOT NULL,
  lease_file TEXT NOT NULL,
  estoppel_file TEXT NOT NULL,
  match_score INTEGER NOT NULL,
  red_flags INTEGER NOT NULL,
  monthly_rent TEXT,
  premises_sf TEXT,
  expiry_date TEXT,
  records JSONB NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view their own audits" ON public.audits;
CREATE POLICY "Allow users to view their own audits" ON public.audits FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert their own audits" ON public.audits;
CREATE POLICY "Allow users to insert their own audits" ON public.audits FOR INSERT WITH CHECK (auth.uid() = user_id);

-- --------------------------------------------------------------------
-- 3b. Audit Jobs Table (For Asynchronous Processing state tracking)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- pending, processing, completed, failed
    progress VARCHAR(255) DEFAULT 'Starting audit...' NOT NULL,
    error TEXT,
    result_audit_id UUID REFERENCES public.audits(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.audit_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view their own audit jobs" ON public.audit_jobs;
CREATE POLICY "Allow users to view their own audit jobs" ON public.audit_jobs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert/update their own audit jobs" ON public.audit_jobs;
DROP POLICY IF EXISTS "Allow users to insert their own audit jobs" ON public.audit_jobs;
DROP POLICY IF EXISTS "Allow users to update their own audit jobs" ON public.audit_jobs;
DROP POLICY IF EXISTS "Allow users to delete their own audit jobs" ON public.audit_jobs;

CREATE POLICY "Allow users to insert their own audit jobs" ON public.audit_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to update their own audit jobs" ON public.audit_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Allow users to delete their own audit jobs" ON public.audit_jobs FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own audits" ON public.audits;
CREATE POLICY "Allow users to delete their own audits" ON public.audits FOR DELETE USING (auth.uid() = user_id);

-- --------------------------------------------------------------------
-- 4. Processed Payments Table (Stripe Webhook Idempotency)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processed_payments (
  session_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to view their own payments" ON public.processed_payments;
CREATE POLICY "Allow users to view their own payments" ON public.processed_payments FOR SELECT USING (auth.uid() = user_id);

-- --------------------------------------------------------------------
-- 4.5 Verified Phones Table (Sybil prevention ledger)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verified_phones (
  phone TEXT PRIMARY KEY,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.verified_phones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct access" ON public.verified_phones;
CREATE POLICY "No direct access" ON public.verified_phones FOR ALL USING (false);

CREATE TABLE IF NOT EXISTS public.phone_use_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS phone_use_history_phone_uid_idx ON public.phone_use_history(phone, user_id);

ALTER TABLE public.phone_use_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct access" ON public.phone_use_history;
CREATE POLICY "No direct access" ON public.phone_use_history FOR ALL USING (false);

-- --------------------------------------------------------------------
-- 5. User Signup Trigger (Auto-Profile & Team Creation) & Twilio Welcome Gift
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_welcome_credit(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_team_id UUID;
  v_already_granted BOOLEAN;
  v_phone TEXT;
BEGIN
  -- Check if already granted
  SELECT free_credit_granted, team_id, phone INTO v_already_granted, v_team_id, v_phone
  FROM public.profiles
  WHERE id = p_user_id;

  -- Sybil check: verify phone has not been historically used by another account
  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.phone_use_history
    WHERE phone = v_phone AND user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'This phone number has already been used to claim a welcome credit on another account.';
  END IF;

  IF v_team_id IS NOT NULL AND (v_already_granted IS NULL OR v_already_granted = FALSE) THEN
    -- Log the phone usage historically if phone is set
    IF v_phone IS NOT NULL THEN
      INSERT INTO public.phone_use_history (phone, user_id)
      VALUES (v_phone, p_user_id)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Grant 1 audit credit (never expiring)
    INSERT INTO public.team_credit_grants (team_id, amount_granted, amount_remaining, expires_at)
    VALUES (v_team_id, 1, 1, NULL);

    -- Recalculate team balance
    PERFORM public.recalculate_team_credits(v_team_id);

    -- Mark as granted
    UPDATE public.profiles
    SET free_credit_granted = TRUE
    WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_team_id UUID;
BEGIN
  -- No auto-joining on signup: always create a new personal team.
  -- This allows the user to accept or decline pending invitations via the dashboard banner.
  INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
  VALUES (COALESCE(new.raw_user_meta_data->>'first_name', 'Personal') || '''s Team', new.id, 0, 1)
  RETURNING id INTO new_team_id;

  INSERT INTO public.profiles (id, email, credits, first_name, last_name, team_id, phone)
  VALUES (
    new.id, new.email, 0,
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    new_team_id,
    new.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE 
  SET email = EXCLUDED.email,
      first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      team_id = COALESCE(profiles.team_id, EXCLUDED.team_id);

  -- Grant welcome credit if both email and phone are verified immediately on insertion (or if it is a Google OAuth user)
  BEGIN
    IF new.email_confirmed_at IS NOT NULL THEN
      IF (new.raw_app_meta_data->>'provider' = 'google') OR (new.raw_user_meta_data IS NOT NULL AND EXISTS (SELECT 1 FROM public.verified_phones WHERE phone = new.raw_user_meta_data->>'phone')) THEN
        PERFORM public.grant_welcome_credit(new.id);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error granting welcome credit in handle_new_user: %', SQLERRM;
  END;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to watch for user updates (for email confirmation transitions)
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS trigger AS $$
BEGIN
  BEGIN
    IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
      IF (NEW.raw_app_meta_data->>'provider' = 'google') OR (NEW.raw_user_meta_data IS NOT NULL AND EXISTS (SELECT 1 FROM public.verified_phones WHERE phone = NEW.raw_user_meta_data->>'phone')) THEN
        PERFORM public.grant_welcome_credit(NEW.id);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_user_update trigger: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_update();

-- --------------------------------------------------------------------
-- 6. Legacy Data Migration (Fix Missing Teams & 1:1 Credit Conversion)
-- --------------------------------------------------------------------
DO $$
DECLARE
  prof RECORD;
  new_team_id UUID;
  converted_audits INTEGER;
BEGIN
  FOR prof IN SELECT id, first_name, credits FROM public.profiles WHERE team_id IS NULL LOOP
    IF prof.credits > 0 THEN
      converted_audits := prof.credits;
    ELSE
      converted_audits := 2;
    END IF;

    INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
    VALUES (COALESCE(prof.first_name, 'Personal') || '''s Team', prof.id, converted_audits, 1)
    RETURNING id INTO new_team_id;

    UPDATE public.profiles SET team_id = new_team_id WHERE id = prof.id;
  END LOOP;
END;
$$;

-- --------------------------------------------------------------------
-- --------------------------------------------------------------------
-- 7. Audit Transactions Table (Stops double-billing on single audits)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_transactions (
    transaction_id UUID PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    credits_deducted INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.audit_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.audit_transactions ADD COLUMN IF NOT EXISTS credits_deducted INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.audit_transactions ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 8. Ledger: Team Credit Grants Table
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_credit_grants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    amount_granted INTEGER NOT NULL,
    amount_remaining INTEGER NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_subscription_grant_expiry CHECK (
      (amount_granted NOT IN (5, 75, 150, 500, 60, 900, 1800, 6000)) 
      OR (expires_at IS NOT NULL)
    )
);

ALTER TABLE public.team_credit_grants ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_team_credit_grants_expires ON public.team_credit_grants (team_id, expires_at);

-- --------------------------------------------------------------------
-- 9. RPC: Recalculate Team Credits (Syncs ledger with UI cache)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_team_credits(p_team_id UUID)
RETURNS VOID AS $$
DECLARE
  active_balance INTEGER;
BEGIN
  -- Zero out any expired grants
  UPDATE public.team_credit_grants 
  SET amount_remaining = 0 
  WHERE team_id = p_team_id AND expires_at <= NOW() AND amount_remaining > 0;
  
  -- Calculate sum of all unexpired, remaining credits (including those that never expire)
  SELECT COALESCE(SUM(amount_remaining), 0) INTO active_balance 
  FROM public.team_credit_grants 
  WHERE team_id = p_team_id AND (expires_at > NOW() OR expires_at IS NULL);
  
  -- Update the cached value on teams table for UI/real-time
  UPDATE public.teams SET audit_credits = active_balance WHERE id = p_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------------------
-- 10. Final Secure Credit Deduction RPC (FIFO Expiration & Idempotency)
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.deduct_user_credits(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.deduct_user_credits(UUID, INTEGER, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.deduct_user_credits(target_user_id UUID, credits_to_deduct INTEGER, plan_mode TEXT, p_transaction_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  active_balance INTEGER;
  user_team_id UUID;
  remaining_to_deduct INTEGER := credits_to_deduct;
  grant_record RECORD;
  row_locked BOOLEAN;
BEGIN
  IF plan_mode = 'hosted' THEN
    SELECT team_id INTO user_team_id FROM public.profiles WHERE id = target_user_id;
    IF user_team_id IS NULL THEN RETURN FALSE; END IF;
    
    IF p_transaction_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.audit_transactions WHERE transaction_id = p_transaction_id) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- Clean expired grants inline to reduce locking overhead
    UPDATE public.team_credit_grants 
    SET amount_remaining = 0 
    WHERE team_id = user_team_id AND expires_at <= NOW() AND amount_remaining > 0;

    -- Lock team row to serialize concurrent deductions securely
    SELECT audit_credits INTO active_balance FROM public.teams WHERE id = user_team_id FOR UPDATE;

    -- Calculate active balance directly from unexpired active grants
    SELECT COALESCE(SUM(amount_remaining), 0) INTO active_balance 
    FROM public.team_credit_grants 
    WHERE team_id = user_team_id AND (expires_at > NOW() OR expires_at IS NULL);

    IF active_balance >= credits_to_deduct THEN
      -- FIFO Deduction from soonest-expiring grants (non-expiring credits NULLS LAST)
      FOR grant_record IN 
          SELECT id, amount_remaining 
          FROM public.team_credit_grants 
          WHERE team_id = user_team_id AND (expires_at > NOW() OR expires_at IS NULL) AND amount_remaining > 0 
          ORDER BY expires_at ASC NULLS LAST
          FOR UPDATE 
      LOOP
          IF remaining_to_deduct = 0 THEN EXIT; END IF;
          
          IF grant_record.amount_remaining >= remaining_to_deduct THEN
             UPDATE public.team_credit_grants SET amount_remaining = amount_remaining - remaining_to_deduct WHERE id = grant_record.id;
             remaining_to_deduct := 0;
          ELSE
             UPDATE public.team_credit_grants SET amount_remaining = 0 WHERE id = grant_record.id;
             remaining_to_deduct := remaining_to_deduct - grant_record.amount_remaining;
          END IF;
      END LOOP;
      
      IF p_transaction_id IS NOT NULL THEN
          INSERT INTO public.audit_transactions (transaction_id, team_id, user_id, credits_deducted)
          VALUES (p_transaction_id, user_team_id, target_user_id, credits_to_deduct);
      END IF;
      
      -- Recalculate cache AFTER deduction exactly once
      PERFORM public.recalculate_team_credits(user_team_id);
      
      RETURN TRUE;
    ELSE
      PERFORM public.recalculate_team_credits(user_team_id);
      RETURN FALSE;
    END IF;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------------------------
-- 11. Refund and Team Invite RPCs
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.refund_user_credits(UUID, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION public.refund_user_credits(target_user_id UUID, credits_to_refund INTEGER, plan_mode TEXT)
RETURNS VOID AS $$
DECLARE
  user_team_id UUID;
BEGIN
  IF plan_mode = 'hosted' THEN
    SELECT team_id INTO user_team_id FROM public.profiles WHERE id = target_user_id;
    IF user_team_id IS NOT NULL THEN
      -- Refund as a non-expiring credit grant
      INSERT INTO public.team_credit_grants (team_id, amount_granted, amount_remaining, expires_at)
      VALUES (user_team_id, credits_to_refund, credits_to_refund, NULL);
      
      -- Sync UI
      PERFORM public.recalculate_team_credits(user_team_id);
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS public.team_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    invited_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(team_id, email)
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow team members to view invitations" ON public.team_invitations;
CREATE POLICY "Allow team members to view invitations" ON public.team_invitations
    FOR SELECT USING (
        team_id IN (SELECT team_id FROM public.profiles WHERE profiles.id = auth.uid())
        OR invited_by = auth.uid()
        OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
    );

DROP POLICY IF EXISTS "Allow recipient to decline invitations" ON public.team_invitations;
CREATE POLICY "Allow recipient to decline invitations" ON public.team_invitations
    FOR DELETE USING (
        LOWER(email) = LOWER(auth.jwt() ->> 'email')
    );

DROP POLICY IF EXISTS "Allow team owner to manage invitations" ON public.team_invitations;
CREATE POLICY "Allow team owner to insert invitations" ON public.team_invitations
    FOR INSERT WITH CHECK (
        team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
    );

CREATE POLICY "Allow team owner to delete invitations" ON public.team_invitations
    FOR DELETE USING (
        team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
    );

CREATE OR REPLACE FUNCTION public.invite_user_to_team(target_email TEXT, inviter_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  inviter_team_id UUID;
  current_seat_limit INTEGER;
  current_member_count INTEGER;
BEGIN
  -- Security check to prevent IDOR privilege escalation
  IF auth.uid() IS NULL OR auth.uid() != inviter_id THEN
    RAISE EXCEPTION 'Unauthorized: Inviter ID must match the authenticated user.';
  END IF;

  SELECT id, seat_limit INTO inviter_team_id, current_seat_limit FROM public.teams WHERE owner_id = inviter_id;
  IF inviter_team_id IS NULL THEN RETURN FALSE; END IF;

  -- Count active members plus pending invitations
  SELECT (
    (SELECT COUNT(*) FROM public.profiles WHERE team_id = inviter_team_id) +
    (SELECT COUNT(*) FROM public.team_invitations WHERE team_id = inviter_team_id)
  ) INTO current_member_count;

  IF current_seat_limit < 9999 AND current_member_count >= current_seat_limit THEN
    RAISE EXCEPTION 'Seat limit reached for this team.';
  END IF;

  -- Always store in team_invitations (existing users must manually accept or decline)
  INSERT INTO public.team_invitations (team_id, email, invited_by)
  VALUES (inviter_team_id, LOWER(target_email), inviter_id)
  ON CONFLICT (team_id, email) DO NOTHING;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_invitation_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_team_id UUID;
  v_email TEXT;
  v_target_user_id UUID;
  v_old_team_id UUID;
  v_seat_limit INTEGER;
  v_member_count INTEGER;
  v_auth_email TEXT;
  v_raw_meta JSONB;
BEGIN
  -- 1. Get the invitation details
  SELECT team_id, LOWER(email) INTO v_team_id, v_email 
  FROM public.team_invitations 
  WHERE id = p_invitation_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  -- 2. Verify that the current authenticated user's email matches the invitation
  SELECT email, raw_user_meta_data INTO v_auth_email, v_raw_meta
  FROM auth.users
  WHERE id = auth.uid();

  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User not found in auth system.';
  END IF;

  IF LOWER(v_auth_email) != v_email THEN
    RAISE EXCEPTION 'Unauthorized: You are not the recipient of this invitation.';
  END IF;

  -- 3. Check if the profile exists in public.profiles. If not, auto-create it.
  SELECT id, team_id INTO v_target_user_id, v_old_team_id 
  FROM public.profiles 
  WHERE id = auth.uid();

  IF v_target_user_id IS NULL THEN
    -- Auto-create the profile (mirroring the handle_new_user trigger logic)
    INSERT INTO public.profiles (id, email, credits, first_name, last_name, team_id, phone)
    VALUES (
      auth.uid(),
      v_auth_email,
      0,
      COALESCE(v_raw_meta->>'first_name', ''),
      COALESCE(v_raw_meta->>'last_name', ''),
      NULL, -- will be updated to the invited team next
      v_raw_meta->>'phone'
    )
    RETURNING id INTO v_target_user_id;
  END IF;

  -- 4. Enforce team seat limit
  SELECT seat_limit INTO v_seat_limit FROM public.teams WHERE id = v_team_id;
  SELECT COUNT(*) INTO v_member_count FROM public.profiles WHERE team_id = v_team_id;
  
  IF v_seat_limit IS NOT NULL AND v_seat_limit < 9999 AND v_member_count >= v_seat_limit THEN
    RAISE EXCEPTION 'Seat limit reached for this team. Cannot accept invitation.';
  END IF;

  -- 5. Update the user's team ID
  UPDATE public.profiles 
  SET team_id = v_team_id 
  WHERE id = v_target_user_id;

  -- 6. Delete the invitation after acceptance
  DELETE FROM public.team_invitations WHERE id = p_invitation_id;

  -- 7. Recalculate team credits for both old and new teams
  IF v_old_team_id IS NOT NULL THEN
    PERFORM public.recalculate_team_credits(v_old_team_id);
    
    -- Clean up old team if the user was the owner and there are no other members left
    IF EXISTS (SELECT 1 FROM public.teams WHERE id = v_old_team_id AND owner_id = v_target_user_id) THEN
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE team_id = v_old_team_id AND id != v_target_user_id) THEN
        DELETE FROM public.teams WHERE id = v_old_team_id;
      END IF;
    END IF;
  END IF;
  PERFORM public.recalculate_team_credits(v_team_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decline_team_invitation(p_invitation_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
  v_target_user_id UUID;
BEGIN
  -- Get the invitation details
  SELECT LOWER(email) INTO v_email 
  FROM public.team_invitations 
  WHERE id = p_invitation_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  -- Ensure the authenticated user is the recipient of the invitation
  SELECT id INTO v_target_user_id 
  FROM public.profiles 
  WHERE id = auth.uid() AND LOWER(email) = v_email;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: You are not the recipient of this invitation.';
  END IF;

  -- Delete/decline the invitation
  DELETE FROM public.team_invitations WHERE id = p_invitation_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------------------------
-- 12. Register Active Session RPC
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_active_session(p_session_id TEXT);
DROP FUNCTION IF EXISTS public.register_active_session(TEXT);

CREATE OR REPLACE FUNCTION public.register_active_session(p_session_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_active_session TEXT;
  current_last_active TIMESTAMP WITH TIME ZONE;
  v_seat_limit INTEGER;
BEGIN
  -- Get existing session info and seat_limit
  SELECT p.active_session_id, p.last_active_at, t.seat_limit 
  INTO current_active_session, current_last_active, v_seat_limit 
  FROM public.profiles p
  LEFT JOIN public.teams t ON p.team_id = t.id
  WHERE p.id = auth.uid();

  -- If seat_limit = 1, reject the takeover if active within last 30 seconds
  IF v_seat_limit IS NOT NULL AND v_seat_limit = 1 THEN
    IF current_active_session IS NOT NULL 
       AND current_active_session != p_session_id 
       AND current_last_active IS NOT NULL 
       AND current_last_active > (NOW() - INTERVAL '30 seconds') THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Otherwise, set the new active session and update the active timestamp
  UPDATE public.profiles 
  SET active_session_id = p_session_id,
      last_active_at = NOW()
  WHERE id = auth.uid();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------------------------
-- 13. Atomic Credit Refund RPC
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.refund_transaction_credits(p_transaction_id UUID, p_user_id UUID, p_plan_mode TEXT);
DROP FUNCTION IF EXISTS public.refund_transaction_credits(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.refund_transaction_credits(p_transaction_id UUID, p_user_id UUID, p_plan_mode TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_credits_deducted INTEGER;
  v_user_team_id UUID;
BEGIN
  -- Atomic check and delete of the transaction record to prevent double refunds
  DELETE FROM public.audit_transactions 
  WHERE transaction_id = p_transaction_id AND user_id = p_user_id
  RETURNING credits_deducted INTO v_credits_deducted;

  -- If no transaction was found (already refunded or doesn't exist), return FALSE
  IF v_credits_deducted IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Proceed with refund
  IF p_plan_mode = 'hosted' THEN
    SELECT team_id INTO v_user_team_id FROM public.profiles WHERE id = p_user_id;
    IF v_user_team_id IS NOT NULL THEN
      INSERT INTO public.team_credit_grants (team_id, amount_granted, amount_remaining, expires_at)
      VALUES (v_user_team_id, v_credits_deducted, v_credits_deducted, NULL);
      PERFORM public.recalculate_team_credits(v_user_team_id);
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------------------
-- 14. SECURE RPC: Get Team Members (Bypasses per-user profiles RLS safely)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_team_members(p_team_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT
) AS $$
BEGIN
  -- Security check: Verify that the caller belongs to this team
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE public.profiles.id = auth.uid() AND public.profiles.team_id = p_team_id
  ) THEN
    RETURN QUERY 
    SELECT p.id, p.email, p.first_name, p.last_name 
    FROM public.profiles p 
    WHERE p.team_id = p_team_id;
  ELSE
    RAISE EXCEPTION 'Access denied. You are not a member of this team.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Check Email Confirmed Status (Supports cross-device polling)
CREATE OR REPLACE FUNCTION public.check_email_confirmed(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_confirmed TIMESTAMP;
BEGIN
  SELECT email_confirmed_at INTO v_confirmed
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;
  
  RETURN v_confirmed IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Remove Team Member
CREATE OR REPLACE FUNCTION public.remove_team_member(target_member_id UUID, inviter_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_team_id UUID;
  v_member_team_id UUID;
  v_new_team_id UUID;
  v_member_email TEXT;
BEGIN
  -- Security check: Verify that the caller is the inviter and matches auth.uid()
  IF auth.uid() IS NULL OR auth.uid() != inviter_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get the team ID owned by the inviter
  SELECT id INTO v_team_id FROM public.teams WHERE owner_id = inviter_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'You do not own a team.';
  END IF;

  -- Get the team ID and email of the member to be removed
  SELECT team_id, email INTO v_member_team_id, v_member_email FROM public.profiles WHERE id = target_member_id;
  
  -- Verify the target user is actually on the owner's team
  IF v_member_team_id IS NULL OR v_member_team_id != v_team_id THEN
    RAISE EXCEPTION 'User is not a member of your team.';
  END IF;

  -- Prevent the owner from removing themselves
  IF target_member_id = inviter_id THEN
    RAISE EXCEPTION 'You cannot remove yourself from your own team.';
  END IF;

  -- Create a new personal team for the removed member
  INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
  VALUES (COALESCE(v_member_email, 'Personal') || '''s Team', target_member_id, 0, 1)
  RETURNING id INTO v_new_team_id;

  -- Assign the removed user to their new personal team
  UPDATE public.profiles 
  SET team_id = v_new_team_id 
  WHERE id = target_member_id;

  -- Recalculate team credits for the original team
  PERFORM public.recalculate_team_credits(v_team_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------------------
-- 9b. Auto Prune Team Members Trigger on Seat Limit Decrease
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_prune_team_members_on_seat_decrease()
RETURNS TRIGGER AS $$
DECLARE
  v_current_count INT;
  v_to_remove INT;
  v_member RECORD;
  v_new_team_id UUID;
  v_removed_count INT := 0;
BEGIN
  -- Only execute if the seat limit has decreased
  IF NEW.seat_limit < OLD.seat_limit THEN
    -- Count current members (including owner)
    SELECT COUNT(*) INTO v_current_count FROM public.profiles WHERE team_id = NEW.id;
    
    -- Calculate how many need to be removed
    v_to_remove := v_current_count - NEW.seat_limit;
    
    IF v_to_remove > 0 THEN
      -- Fetch the members to remove (newest registered first, excluding the owner)
      FOR v_member IN 
        SELECT p.id, p.email 
        FROM public.profiles p
        JOIN auth.users u ON p.id = u.id
        WHERE p.team_id = NEW.id AND p.id != NEW.owner_id
        ORDER BY u.created_at DESC
        LIMIT v_to_remove
      LOOP
        -- Create a new personal team for the removed member
        INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
        VALUES (COALESCE(v_member.email, 'Personal') || '''s Team', v_member.id, 0, 1)
        RETURNING id INTO v_new_team_id;

        -- Move the member to their new personal team
        UPDATE public.profiles 
        SET team_id = v_new_team_id 
        WHERE id = v_member.id;

        v_removed_count := v_removed_count + 1;
      END LOOP;

      -- Recalculate team credits if we removed anyone
      IF v_removed_count > 0 THEN
        -- Zero out any expired grants
        UPDATE public.team_credit_grants 
        SET amount_remaining = 0 
        WHERE team_id = NEW.id AND expires_at <= NOW() AND amount_remaining > 0;
        
        -- Calculate sum of all unexpired, remaining credits
        SELECT COALESCE(SUM(amount_remaining), 0) INTO NEW.audit_credits
        FROM public.team_credit_grants 
        WHERE team_id = NEW.id AND (expires_at > NOW() OR expires_at IS NULL);

        NEW.pruned_members_count := COALESCE(OLD.pruned_members_count, 0) + v_removed_count;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prune_team_members_on_seat_decrease ON public.teams;
CREATE TRIGGER prune_team_members_on_seat_decrease
  BEFORE UPDATE OF seat_limit ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prune_team_members_on_seat_decrease();


-- --------------------------------------------------------------------
-- 10. SQL Backfill Trigger: Retroactively Grant Welcome Credits
-- --------------------------------------------------------------------
DO $$
DECLARE
  prof RECORD;
BEGIN
  FOR prof IN 
    SELECT id FROM public.profiles 
    WHERE free_credit_granted = FALSE 
      AND phone IS NOT NULL 
      AND phone IN (SELECT phone FROM public.verified_phones)
  LOOP
    BEGIN
      PERFORM public.grant_welcome_credit(prof.id);
      RAISE NOTICE 'Granted welcome credit to user %', prof.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to grant welcome credit to user %: %', prof.id, SQLERRM;
    END;
  END LOOP;
END $$;


