-- ====================================================================
-- LeaseAlign AI Migration 003: Audit Transaction Idempotency Fix
-- ====================================================================

-- 1. Create Audit Transactions Table to track billed API requests
CREATE TABLE IF NOT EXISTS public.audit_transactions (
    transaction_id UUID PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Update the RPC to accept an optional transaction_id to prevent double billing
CREATE OR REPLACE FUNCTION public.deduct_user_credits(target_user_id UUID, pages_to_deduct INTEGER, plan_mode TEXT, p_transaction_id UUID DEFAULT NULL)
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
    
    -- Idempotency check: if transaction_id exists, we already deducted for this audit run, so allow it for free
    IF p_transaction_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.audit_transactions WHERE transaction_id = p_transaction_id) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- Deduct 'pages_to_deduct' (which is just '1' audit credit in the new model)
    SELECT audit_credits INTO current_bal FROM public.teams WHERE id = user_team_id FOR UPDATE;
    IF current_bal >= pages_to_deduct THEN
      UPDATE public.teams
      SET audit_credits = audit_credits - pages_to_deduct
      WHERE id = user_team_id;
      
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
