-- ==========================================
-- FINAL CONSOLIDATED FIX SCRIPT
-- Run this entire block in Supabase SQL Editor
-- ==========================================

-- 1. Ensure all missing teams are created and legacy credits are converted 1:1
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

-- 2. Create the Audit Transactions tracking table (fixes the backend crash)
CREATE TABLE IF NOT EXISTS public.audit_transactions (
    transaction_id UUID PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Update the deduction RPC to properly accept the transaction ID and deduct correctly
CREATE OR REPLACE FUNCTION public.deduct_user_credits(target_user_id UUID, pages_to_deduct INTEGER, plan_mode TEXT, p_transaction_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  current_bal INTEGER;
  user_team_id UUID;
BEGIN
  IF plan_mode = 'hosted' THEN
    -- Get user's team
    SELECT team_id INTO user_team_id FROM public.profiles WHERE id = target_user_id;
    IF user_team_id IS NULL THEN RETURN FALSE; END IF;
    
    -- Idempotency check: if transaction_id exists, we already deducted for this audit run, so allow it for free
    IF p_transaction_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.audit_transactions WHERE transaction_id = p_transaction_id) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- Deduct 1 audit credit
    SELECT audit_credits INTO current_bal FROM public.teams WHERE id = user_team_id FOR UPDATE;
    IF current_bal >= pages_to_deduct THEN
      UPDATE public.teams SET audit_credits = audit_credits - pages_to_deduct WHERE id = user_team_id;
      
      -- Log the transaction to prevent future deductions for this exact same audit run
      IF p_transaction_id IS NOT NULL THEN
          INSERT INTO public.audit_transactions (transaction_id, team_id) VALUES (p_transaction_id, user_team_id);
      END IF;
      
      RETURN TRUE;
    ELSE
      RETURN FALSE;
    END IF;
  ELSIF plan_mode = 'byok' THEN
    SELECT byok_credits INTO current_bal FROM public.profiles WHERE id = target_user_id FOR UPDATE;
    IF current_bal >= pages_to_deduct OR current_bal >= 900000 THEN
      IF current_bal < 900000 THEN
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
