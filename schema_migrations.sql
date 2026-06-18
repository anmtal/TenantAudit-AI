-- ====================================================================
-- LeaseAlign AI Database Schema Migrations
-- ====================================================================
-- INSTRUCTIONS: Run this entire script in your Supabase SQL Editor.
-- ====================================================================

-- 1. Create processed_payments table for Stripe idempotency
CREATE TABLE IF NOT EXISTS public.processed_payments (
    session_id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row-Level Security (RLS) on processed_payments
ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;

-- Create policy allowing users to read their own payments history
DROP POLICY IF EXISTS "Allow users to view their own payments" ON public.processed_payments;
CREATE POLICY "Allow users to view their own payments" ON public.processed_payments
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Add user_id column to audits table for data isolation
ALTER TABLE public.audits 
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- Enable RLS on audits table
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for audits isolation
DROP POLICY IF EXISTS "Allow users to view their own audits" ON public.audits;
CREATE POLICY "Allow users to view their own audits" ON public.audits 
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert their own audits" ON public.audits;
CREATE POLICY "Allow users to insert their own audits" ON public.audits 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own audits" ON public.audits;
CREATE POLICY "Allow users to delete their own audits" ON public.audits 
    FOR DELETE USING (auth.uid() = user_id);

-- 3. Profiles Phone and Verified Phones Table Setup
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS unique_profiles_phone;
ALTER TABLE public.profiles ADD CONSTRAINT unique_profiles_phone UNIQUE (phone);

CREATE TABLE IF NOT EXISTS public.verified_phones (
  phone TEXT PRIMARY KEY,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.verified_phones ENABLE ROW LEVEL SECURITY;

-- 4. Team Invitations Setup
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
CREATE POLICY "Allow team owner to manage invitations" ON public.team_invitations
    FOR ALL USING (
        team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
    );

-- 5. Team Invitation RPCs
CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_invitation_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_team_id UUID;
  v_email TEXT;
  v_target_user_id UUID;
  v_old_team_id UUID;
BEGIN
  SELECT team_id, LOWER(email) INTO v_team_id, v_email 
  FROM public.team_invitations 
  WHERE id = p_invitation_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  SELECT id, team_id INTO v_target_user_id, v_old_team_id 
  FROM public.profiles 
  WHERE id = auth.uid() AND LOWER(email) = v_email;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: You are not the recipient of this invitation.';
  END IF;

  UPDATE public.profiles 
  SET team_id = v_team_id 
  WHERE id = v_target_user_id;

  DELETE FROM public.team_invitations WHERE id = p_invitation_id;

  IF v_old_team_id IS NOT NULL THEN
    PERFORM public.recalculate_team_credits(v_old_team_id);
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
  SELECT LOWER(email) INTO v_email 
  FROM public.team_invitations 
  WHERE id = p_invitation_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  SELECT id INTO v_target_user_id 
  FROM public.profiles 
  WHERE id = auth.uid() AND LOWER(email) = v_email;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: You are not the recipient of this invitation.';
  END IF;

  DELETE FROM public.team_invitations WHERE id = p_invitation_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_team_members(p_team_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT
) AS $$
BEGIN
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

