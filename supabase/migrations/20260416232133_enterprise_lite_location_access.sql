-- Enterprise Lite users must be treated as enterprise users by location RLS.
-- Invited Lite users get their role from lite_profiles first, while the older
-- locations policies still checked only public.profiles.role.

DROP POLICY IF EXISTS "Users can view own location" ON public.locations;
CREATE POLICY "Users can view own location"
  ON public.locations
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT p.location_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.location_id IS NOT NULL
    )
    OR id::text IN (
      SELECT public.get_my_lite_location_ids()
    )
    OR slug IN (
      SELECT public.get_my_lite_location_ids()
    )
  );

DROP POLICY IF EXISTS "Enterprise admins can view all locations" ON public.locations;
CREATE POLICY "Enterprise admins can view all locations"
  ON public.locations
  FOR SELECT
  TO authenticated
  USING (
    public.is_lite_owner_or_enterprise()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'owner',
          'role_owner',
          'developer',
          'enterprise_admin',
          'role_enterprise_admin'
        )
    )
  );

DROP POLICY IF EXISTS "Users can update own location" ON public.locations;
CREATE POLICY "Users can update own location"
  ON public.locations
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT p.location_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.location_id IS NOT NULL
    )
    OR id::text IN (
      SELECT public.get_my_lite_location_ids()
    )
    OR slug IN (
      SELECT public.get_my_lite_location_ids()
    )
  )
  WITH CHECK (
    id IN (
      SELECT p.location_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.location_id IS NOT NULL
    )
    OR id::text IN (
      SELECT public.get_my_lite_location_ids()
    )
    OR slug IN (
      SELECT public.get_my_lite_location_ids()
    )
  );

DROP POLICY IF EXISTS "Enterprise admins can update all locations" ON public.locations;
CREATE POLICY "Enterprise admins can update all locations"
  ON public.locations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_lite_owner_or_enterprise()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'owner',
          'role_owner',
          'developer',
          'enterprise_admin',
          'role_enterprise_admin'
        )
    )
  )
  WITH CHECK (
    public.is_lite_owner_or_enterprise()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'owner',
          'role_owner',
          'developer',
          'enterprise_admin',
          'role_enterprise_admin'
        )
    )
  );

DROP POLICY IF EXISTS "Owners can insert locations" ON public.locations;
CREATE POLICY "Owners can insert locations"
  ON public.locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_lite_owner_or_enterprise()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'owner',
          'role_owner',
          'developer',
          'enterprise_admin',
          'role_enterprise_admin'
        )
    )
  );

DROP POLICY IF EXISTS "Owners can delete locations" ON public.locations;
CREATE POLICY "Owners can delete locations"
  ON public.locations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'role_owner', 'developer')
    )
  );
