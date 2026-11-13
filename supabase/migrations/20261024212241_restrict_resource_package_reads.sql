-- Keep owner uploads readable, and require explicit review for shared packages.
-- Server-side checks alone cannot protect direct authenticated Storage requests.
DROP POLICY IF EXISTS resource_packages_authenticated_read ON storage.objects;
CREATE POLICY resource_packages_authenticated_read
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'resource-packages'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.resources AS resource
      WHERE resource.package_path = storage.objects.name
        AND resource.published = true
        AND resource.verified = true
        AND jsonb_typeof(resource.installation_config) = 'object'
        AND resource.installation_config ->> 'review_state' = 'approved'
    )
  )
);
