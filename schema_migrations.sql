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
