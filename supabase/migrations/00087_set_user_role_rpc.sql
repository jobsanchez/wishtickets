-- RPC to set user role with hierarchical permissions:
-- Super Admin: can assign any role (user, admin, admissions_staff, usher)
-- Admin: can only set user -> admissions_staff or usher (cannot set admin, super_admin)
-- Admissions Staff / Usher: cannot set any role

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_new_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
  v_valid_roles text[] := ARRAY['user', 'admin', 'admissions_staff', 'usher', 'super_admin'];
BEGIN
  IF p_new_role IS NULL OR p_new_role = '' OR NOT (p_new_role = ANY(v_valid_roles)) THEN
    RETURN false;
  END IF;

  v_actor_role := COALESCE(public.get_my_role(), '');
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  v_target_role := COALESCE(v_target_role, 'user');

  -- Super Admin: can assign any role
  IF v_actor_role = 'super_admin' THEN
    UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;
    RETURN true;
  END IF;

  -- Admin: can only set user -> admissions_staff or usher
  IF v_actor_role = 'admin' THEN
    IF v_target_role <> 'user' THEN
      RETURN false;  -- Can only change users, not admin/admissions_staff/usher/super_admin
    END IF;
    IF p_new_role NOT IN ('admissions_staff', 'usher') THEN
      RETURN false;  -- Cannot set to admin or super_admin
    END IF;
    UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;
    RETURN true;
  END IF;

  -- Admissions Staff, Usher, User: cannot set any role
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;
