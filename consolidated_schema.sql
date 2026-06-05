-- ====================================================================
-- LeaseAlign AI Consolidated Database Setup & Migration Script
-- ====================================================================
-- This script safely initializes and updates the database schema,
-- including profiles, audits, processed payments, triggers, RLS policies,
-- and RPC helper functions.
--
-- Running instructions:
-- 1. Open your Supabase Dashboard.
-- 2. Go to the SQL Editor.
-- 3. Click "+ New" to create a new query.
-- 4. Paste this entire script and click "Run".
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Profiles Table Initialization & Upgrades
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CONSTRAINT credits_non_negative CHECK (credits >= 0),
  byok_credits INTEGER NOT NULL DEFAULT 0 CONSTRAINT byok_credits_non_negative CHECK (byok_credits >= 0),
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure all columns exist on profiles table (for upgrading existing tables)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS byok_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_session_id TEXT;

-- Safely add constraints to profiles if they are missing
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS credits_non_negative;
ALTER TABLE public.profiles ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS byok_credits_non_negative;
ALTER TABLE public.profiles ADD CONSTRAINT byok_credits_non_negative CHECK (byok_credits >= 0);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies for profiles
DROP POLICY IF EXISTS "Allow users to view their own profiles" ON public.profiles;
CREATE POLICY "Allow users to view their own profiles" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow users to update their own profiles" ON public.profiles;
CREATE POLICY "Allow users to update their own profiles" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- --------------------------------------------------------------------
-- 2. Audits Table Initialization & Upgrades
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure user_id column exists (enables data isolation per user)
ALTER TABLE public.audits 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE CASCADE DEFAULT auth.uid();

-- Enable RLS on audits
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies for audits
DROP POLICY IF EXISTS "Allow users to view their own audits" ON public.audits;
CREATE POLICY "Allow users to view their own audits" 
  ON public.audits FOR SELECT 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert their own audits" ON public.audits;
CREATE POLICY "Allow users to insert their own audits" 
  ON public.audits FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own audits" ON public.audits;
CREATE POLICY "Allow users to delete their own audits" 
  ON public.audits FOR DELETE 
  USING (auth.uid() = user_id);

-- --------------------------------------------------------------------
-- 3. Processed Payments Table (Stripe Webhook Idempotency)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processed_payments (
  session_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on processed_payments
ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies for payments
DROP POLICY IF EXISTS "Allow users to view their own payments" ON public.processed_payments;
CREATE POLICY "Allow users to view their own payments" 
  ON public.processed_payments FOR SELECT 
  USING (auth.uid() = user_id);

-- --------------------------------------------------------------------
-- 4. User Signup Trigger (Auto-Profile Creation)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credits, byok_credits, first_name, last_name, company_name)
  VALUES (
    new.id,
    new.email,
    100, -- Default Hosted SaaS credits awarded on signup
    0,   -- Default BYOK credits
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'company_name', '')
  )
  ON CONFLICT (id) DO UPDATE 
  SET email = EXCLUDED.email,
      first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
      company_name = COALESCE(EXCLUDED.company_name, profiles.company_name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger function to the auth.users signup event
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------------------
-- 5. Safe Credit Deduction RPC Helper
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_credits(pages_to_deduct INTEGER, plan_mode TEXT DEFAULT 'hosted')
RETURNS void AS $$
BEGIN
  IF plan_mode = 'hosted' THEN
    UPDATE public.profiles
    SET credits = credits - pages_to_deduct
    WHERE id = auth.uid();
  ELSIF plan_mode = 'byok' THEN
    UPDATE public.profiles
    SET byok_credits = byok_credits - pages_to_deduct
    WHERE id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------------------------
-- 5b. Server-Side Atomic Credits Deduction & Refund (Race-Condition Free)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_user_credits(target_user_id UUID, pages_to_deduct INTEGER, plan_mode TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_bal INTEGER;
BEGIN
  IF plan_mode = 'hosted' THEN
    SELECT credits INTO current_bal FROM public.profiles WHERE id = target_user_id FOR UPDATE;
    IF current_bal >= pages_to_deduct THEN
      UPDATE public.profiles
      SET credits = credits - pages_to_deduct
      WHERE id = target_user_id;
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
BEGIN
  IF plan_mode = 'hosted' THEN
    UPDATE public.profiles
    SET credits = credits + pages_to_refund
    WHERE id = target_user_id;
  ELSIF plan_mode = 'byok' THEN
    IF (SELECT byok_credits FROM public.profiles WHERE id = target_user_id) < 900000 THEN
      UPDATE public.profiles
      SET byok_credits = byok_credits + pages_to_refund
      WHERE id = target_user_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------------------------
-- 6. Optional Developer/Admin Testing Helper Queries
-- --------------------------------------------------------------------
-- These queries are commented out. Uncomment and run them individually 
-- in the Supabase SQL editor if you want to test BYOK or Hosted credit balances.

-- Set a user to BYOK mode by default:
-- UPDATE auth.users 
-- SET raw_user_meta_data = jsonb_set(
--   COALESCE(raw_user_meta_data, '{}'::jsonb),
--   '{plan_type}',
--   '"byok"'::jsonb
-- )
-- WHERE email = 'your-email@example.com';

-- Grant high/unlimited BYOK page credits for local testing:
-- UPDATE public.profiles
-- SET byok_credits = 999999
-- WHERE email = 'your-email@example.com';

-- Grant hosted SaaS page credits:
-- UPDATE public.profiles
-- SET credits = 500
-- WHERE email = 'your-email@example.com';
