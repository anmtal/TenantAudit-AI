-- Migration: Add session tracking for single-seat enforcement
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS active_session_id TEXT;

-- Refresh schema cache if needed
COMMENT ON COLUMN public.profiles.active_session_id IS 'Current active unique session token to prevent login sharing';
