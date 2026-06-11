-- ====================================================================
-- LeaseAlign AI: Unified Database Setup, Migrations & Idempotency Fix
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Teams Table Initialization
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 2. Profiles Table Initialization & Upgrades
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CONSTRAINT credits_non_negative CHECK (credits >= 0),
  byok_credits INTEGER NOT NULL DEFAULT 0 CONSTRAINT byok_credits_non_negative CHECK (byok_credits >= 0),
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS byok_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_session_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS credits_non_negative;
ALTER TABLE public.profiles ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS byok_credits_non_negative;
ALTER TABLE public.profiles ADD CONSTRAINT byok_credits_non_negative CHECK (byok_credits >= 0);

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
-- 5. User Signup Trigger (Auto-Profile & Team Creation)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_team_id UUID;
  pending_team_id UUID;
BEGIN
  -- Check if there is a pending invitation for this email
  SELECT team_id INTO pending_team_id 
  FROM public.team_invitations 
  WHERE LOWER(email) = LOWER(new.email)
  LIMIT 1;

  IF pending_team_id IS NOT NULL THEN
    -- Assign to the invited team, delete the invitation
    DELETE FROM public.team_invitations WHERE LOWER(email) = LOWER(new.email);
    
    INSERT INTO public.profiles (id, email, credits, byok_credits, first_name, last_name, company_name, team_id)
    VALUES (
      new.id, new.email, 0, 0,
      COALESCE(new.raw_user_meta_data->>'first_name', ''),
      COALESCE(new.raw_user_meta_data->>'last_name', ''),
      COALESCE(new.raw_user_meta_data->>'company_name', ''),
      pending_team_id
    )
    ON CONFLICT (id) DO UPDATE 
    SET email = EXCLUDED.email,
        first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
        company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
        team_id = pending_team_id;
  ELSE
    -- No pending invitation: create a new personal team
    INSERT INTO public.teams (name, owner_id, audit_credits, seat_limit)
    VALUES (COALESCE(new.raw_user_meta_data->>'first_name', 'Personal') || '''s Team', new.id, 0, 1)
    RETURNING id INTO new_team_id;

    INSERT INTO public.profiles (id, email, credits, byok_credits, first_name, last_name, company_name, team_id)
    VALUES (
      new.id, new.email, 0, 0,
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
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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

-- --------------------------------------------------------------------
-- 8. Ledger: Team Credit Grants Table
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_credit_grants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    amount_granted INTEGER NOT NULL,
    amount_remaining INTEGER NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
  
  -- Calculate sum of all unexpired, remaining credits
  SELECT COALESCE(SUM(amount_remaining), 0) INTO active_balance 
  FROM public.team_credit_grants 
  WHERE team_id = p_team_id AND expires_at > NOW();
  
  -- Update the cached value on teams table for UI/real-time
  UPDATE public.teams SET audit_credits = active_balance WHERE id = p_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- --------------------------------------------------------------------
-- 10. Final Secure Credit Deduction RPC (FIFO Expiration & Idempotency)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_user_credits(target_user_id UUID, pages_to_deduct INTEGER, plan_mode TEXT, p_transaction_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  active_balance INTEGER;
  user_team_id UUID;
  remaining_to_deduct INTEGER := pages_to_deduct;
  grant_record RECORD;
BEGIN
  IF plan_mode = 'hosted' THEN
    SELECT team_id INTO user_team_id FROM public.profiles WHERE id = target_user_id;
    IF user_team_id IS NULL THEN RETURN FALSE; END IF;
    
    IF p_transaction_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.audit_transactions WHERE transaction_id = p_transaction_id) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- Clean expired and calculate balance
    PERFORM public.recalculate_team_credits(user_team_id);
    SELECT audit_credits INTO active_balance FROM public.teams WHERE id = user_team_id FOR UPDATE;

    IF active_balance >= pages_to_deduct THEN
      -- FIFO Deduction from soonest-expiring grants
      FOR grant_record IN 
          SELECT id, amount_remaining 
          FROM public.team_credit_grants 
          WHERE team_id = user_team_id AND expires_at > NOW() AND amount_remaining > 0 
          ORDER BY expires_at ASC 
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
          VALUES (p_transaction_id, user_team_id, target_user_id, pages_to_deduct);
      END IF;
      
      -- Recalculate cache after deduction
      PERFORM public.recalculate_team_credits(user_team_id);
      
      RETURN TRUE;
    ELSE
      RETURN FALSE;
    END IF;
    
  ELSIF plan_mode = 'byok' THEN
    SELECT byok_credits INTO active_balance FROM public.profiles WHERE id = target_user_id FOR UPDATE;
    IF active_balance >= pages_to_deduct OR active_balance >= 900000 THEN
      IF active_balance < 900000 THEN
        UPDATE public.profiles SET byok_credits = byok_credits - pages_to_deduct WHERE id = target_user_id;
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

-- --------------------------------------------------------------------
-- 11. Refund and Team Invite RPCs
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_user_credits(target_user_id UUID, pages_to_refund INTEGER, plan_mode TEXT)
RETURNS VOID AS $$
DECLARE
  user_team_id UUID;
BEGIN
  IF plan_mode = 'hosted' THEN
    SELECT team_id INTO user_team_id FROM public.profiles WHERE id = target_user_id;
    IF user_team_id IS NOT NULL THEN
      -- Refund as a new 30-day micro-grant
      INSERT INTO public.team_credit_grants (team_id, amount_granted, amount_remaining, expires_at)
      VALUES (user_team_id, pages_to_refund, pages_to_refund, NOW() + INTERVAL '30 days');
      
      -- Sync UI
      PERFORM public.recalculate_team_credits(user_team_id);
    END IF;
  ELSIF plan_mode = 'byok' THEN
    IF (SELECT byok_credits FROM public.profiles WHERE id = target_user_id) < 900000 THEN
      UPDATE public.profiles SET byok_credits = byok_credits + pages_to_refund WHERE id = target_user_id;
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
    );

DROP POLICY IF EXISTS "Allow team owner to manage invitations" ON public.team_invitations;
CREATE POLICY "Allow team owner to manage invitations" ON public.team_invitations
    FOR ALL USING (
        team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
    );

CREATE OR REPLACE FUNCTION public.invite_user_to_team(target_email TEXT, inviter_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  inviter_team_id UUID;
  current_seat_limit INTEGER;
  current_member_count INTEGER;
  target_user_id UUID;
BEGIN
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

  SELECT id INTO target_user_id FROM public.profiles WHERE LOWER(email) = LOWER(target_email);
  IF target_user_id IS NULL THEN
    -- User not found: store a pending invitation
    INSERT INTO public.team_invitations (team_id, email, invited_by)
    VALUES (inviter_team_id, LOWER(target_email), inviter_id)
    ON CONFLICT (team_id, email) DO NOTHING;
    RETURN TRUE;
  END IF;

  UPDATE public.profiles SET team_id = inviter_team_id WHERE id = target_user_id;
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
BEGIN
  -- Get existing session info
  SELECT active_session_id, last_active_at 
  INTO current_active_session, current_last_active 
  FROM public.profiles 
  WHERE id = auth.uid();

  -- If there is another active session that was active within the last 30 seconds, reject the takeover
  IF current_active_session IS NOT NULL 
     AND current_active_session != p_session_id 
     AND current_last_active IS NOT NULL 
     AND current_last_active > (NOW() - INTERVAL '30 seconds') THEN
    RETURN FALSE;
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
      VALUES (v_user_team_id, v_credits_deducted, v_credits_deducted, NOW() + INTERVAL '30 days');
      PERFORM public.recalculate_team_credits(v_user_team_id);
    END IF;
  ELSIF p_plan_mode = 'byok' THEN
    IF (SELECT byok_credits FROM public.profiles WHERE id = p_user_id) < 900000 THEN
      UPDATE public.profiles 
      SET byok_credits = byok_credits + v_credits_deducted 
      WHERE id = p_user_id;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

