ALTER TABLE user_invitations
  ADD COLUMN store_id uuid,
  ADD COLUMN store_role text,
  ADD CONSTRAINT user_invitations_company_store_fk
    FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id),
  ADD CONSTRAINT user_invitations_store_role_check CHECK(
    (store_id IS NULL AND store_role IS NULL) OR
    (store_id IS NOT NULL AND store_role IN('store_viewer','store_operator','store_manager'))
  );

DROP FUNCTION resolve_user_invitation(text);
CREATE FUNCTION resolve_user_invitation(p_token_hash text)
RETURNS TABLE(id uuid,company_id uuid,email text,display_name text,role text,store_id uuid,store_role text,store_name text,company text)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT i.id,i.company_id,i.email,i.display_name,i.role,i.store_id,i.store_role,s.name,c.name
  FROM user_invitations i
  JOIN companies c ON c.id=i.company_id
  LEFT JOIN requesting_stores s ON s.company_id=i.company_id AND s.id=i.store_id
  WHERE i.token_hash=p_token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
$$;
REVOKE ALL ON FUNCTION resolve_user_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_user_invitation(text) TO stockflow_app;
