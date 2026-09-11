ALTER TABLE carrier_sla_notifications ADD COLUMN entity_type text,ADD COLUMN entity_id uuid,ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('normal','high','critical'));
CREATE INDEX carrier_sla_notification_entity_idx ON carrier_sla_notifications(company_id,entity_type,entity_id);
CREATE VIEW carrier_sla_inbox_summary WITH(security_invoker=true) AS SELECT company_id,user_id,count(*) FILTER(WHERE read_at IS NULL) unread_count,count(*) FILTER(WHERE read_at IS NULL AND priority IN('high','critical')) urgent_count,max(created_at) latest_at FROM carrier_sla_notifications GROUP BY company_id,user_id;
GRANT SELECT ON carrier_sla_inbox_summary TO stockflow_app;
