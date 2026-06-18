CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_team_id UUID;
BEGIN
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
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
