-- Fix: column "role" is of type app_role but expression is of type text
-- Explicitly cast p_new_role (text) to app_role when updating profiles.role

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_new_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
  v_valid_roles text[] := ARRAY['user', 'admin', 'admissions_staff', 'super_admin'];
BEGIN
  IF p_new_role IS NULL OR p_new_role = '' OR NOT (p_new_role = ANY(v_valid_roles)) THEN
    RETURN false;
  END IF;

  v_actor_role := COALESCE(public.get_my_role(), '');
  SELECT role::text INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  v_target_role := COALESCE(v_target_role, 'user');

  -- Super Admin: can assign any role
  IF v_actor_role = 'super_admin' THEN
    UPDATE public.profiles SET role = p_new_role::app_role WHERE id = p_user_id;
    RETURN true;
  END IF;

  -- Admin: can only set user -> admissions_staff
  IF v_actor_role = 'admin' THEN
    IF v_target_role <> 'user' THEN
      RETURN false;
    END IF;
    IF p_new_role <> 'admissions_staff' THEN
      RETURN false;
    END IF;
    UPDATE public.profiles SET role = p_new_role::app_role WHERE id = p_user_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
