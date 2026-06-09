-- Capabilities and Settings migration
-- Replaces role-based checks with capability-based permissions.
-- Keeps profiles.role for display; user_capabilities is source of truth.

-- User capabilities (granular permissions)
CREATE TABLE IF NOT EXISTS public.user_capabilities (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, capability),
  CONSTRAINT valid_capability CHECK (capability IN (
    'manage_seats', 'manage_events', 'manage_venues', 'manage_prices',
    'manage_reservations', 'manage_users', 'view_sales_analytics',
    'scan_tickets', 'manage_settings'
  ))
);

CREATE INDEX idx_user_capabilities_user ON public.user_capabilities(user_id);

-- App config (seat defaults, reservation TTL, etc.)
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default app config
INSERT INTO public.app_config (key, value) VALUES
  ('reservation', '{"ttl_minutes": 15, "warn_before_minutes": 1, "heartbeat_divisor": 2}'::jsonb),
  ('venue_defaults', '{"seat_types": ["standard", "vip"], "default_section_capacity": 100}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS for user_capabilities
ALTER TABLE public.user_capabilities ENABLE ROW LEVEL SECURITY;

-- Users can read own capabilities; users with manage_users can read all
CREATE POLICY "Users can read own capabilities" ON public.user_capabilities
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_users'
    )
  );

-- Only manage_users can insert/update/delete
CREATE POLICY "Manage users can write capabilities" ON public.user_capabilities
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_users'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_users'
    )
  );

-- RLS for app_config
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Only manage_settings can read/update app_config
-- Fallback: admin role can access (bootstrap before capabilities backfill)
CREATE POLICY "Settings managers can manage app_config" ON public.app_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_settings'
    )
  );

-- Allow users with manage_users to read all profiles (for capability matrix)
CREATE POLICY "Manage users can read all profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_users'
    )
  );

-- Migrate existing roles to capabilities
INSERT INTO public.user_capabilities (user_id, capability)
SELECT p.id, cap
FROM public.profiles p
CROSS JOIN (
  VALUES
    ('manage_seats'), ('manage_events'), ('manage_venues'), ('manage_prices'),
    ('manage_reservations'), ('manage_users'), ('view_sales_analytics'),
    ('scan_tickets'), ('manage_settings')
) AS t(cap)
WHERE p.role = 'admin'
ON CONFLICT (user_id, capability) DO NOTHING;

INSERT INTO public.user_capabilities (user_id, capability)
SELECT p.id, cap
FROM public.profiles p
CROSS JOIN (VALUES ('scan_tickets'), ('view_sales_analytics')) AS t(cap)
WHERE p.role IN ('admissions_staff', 'usher')
ON CONFLICT (user_id, capability) DO NOTHING;
