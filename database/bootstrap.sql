DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stockflow_app') THEN
    CREATE ROLE stockflow_app LOGIN PASSWORD 'stockflow_app_local';
  END IF;
END $$;
