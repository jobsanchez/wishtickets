-- Add super_admin role to app_role enum only.
-- Policy updates must be in 00008 (cannot use new enum value in same transaction).
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';
