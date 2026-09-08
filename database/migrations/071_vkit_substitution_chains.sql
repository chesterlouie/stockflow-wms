ALTER TABLE vkit_backorder_substitution_intents
  ADD COLUMN target_item_id uuid,
  ADD COLUMN path_relationship_ids uuid[],
  ADD COLUMN path_depth integer,
  ADD COLUMN conversion_ratio numeric(18,6);

UPDATE vkit_backorder_substitution_intents v
SET target_item_id=r.target_item_id,
    path_relationship_ids=ARRAY[r.id],
    path_depth=1,
    conversion_ratio=r.conversion_ratio
FROM item_relationships r
WHERE r.company_id=v.company_id AND r.id=v.relationship_id;

ALTER TABLE vkit_backorder_substitution_intents
  ALTER COLUMN target_item_id SET NOT NULL,
  ALTER COLUMN path_relationship_ids SET NOT NULL,
  ALTER COLUMN path_depth SET NOT NULL,
  ALTER COLUMN conversion_ratio SET NOT NULL,
  ADD CONSTRAINT vkit_substitution_intent_target_fk FOREIGN KEY(company_id,target_item_id) REFERENCES items(company_id,id),
  ADD CONSTRAINT vkit_substitution_intent_path_depth_check CHECK(path_depth BETWEEN 1 AND 8),
  ADD CONSTRAINT vkit_substitution_intent_ratio_check CHECK(conversion_ratio>0);

CREATE OR REPLACE FUNCTION notify_vkit_backorder_substitution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o sales_orders%ROWTYPE; component_sku text; substitute_sku text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
 SELECT * INTO o FROM sales_orders WHERE company_id=NEW.company_id AND id=NEW.order_id;
 SELECT s.sku,t.sku INTO component_sku,substitute_sku FROM items s JOIN items t ON t.company_id=s.company_id WHERE s.company_id=NEW.company_id AND s.id=NEW.component_item_id AND t.id=NEW.target_item_id;
 IF NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM vkit_backorder_shortages b LEFT JOIN vkit_backorder_substitution_intents v ON v.company_id=b.company_id AND v.order_id=b.order_id AND v.component_item_id=b.component_item_id LEFT JOIN LATERAL(SELECT sum(a.available_to_promise) available FROM inventory_availability a WHERE a.company_id=b.company_id AND a.warehouse_id=b.warehouse_id AND a.item_id=v.target_item_id AND a.stock_status='available')stock ON true WHERE b.company_id=NEW.company_id AND b.order_id=NEW.order_id AND b.shortage_quantity>0 AND (v.id IS NULL OR v.status<>'approved' OR coalesce(stock.available,0)<v.substitute_quantity)) THEN UPDATE sales_orders SET backorder_status='ready' WHERE company_id=NEW.company_id AND id=NEW.order_id AND status='new'; END IF;
 INSERT INTO warehouse_notifications(company_id,warehouse_id,user_id,event_key,title,message,order_id) SELECT NEW.company_id,o.warehouse_id,m.user_id,'backorder-substitute:'||NEW.id||':'||NEW.status,'VKIT substitute '||NEW.status,o.order_no||': '||component_sku||' → '||substitute_sku||' ('||NEW.substitute_quantity||').',o.id FROM company_members m WHERE m.company_id=NEW.company_id AND m.role IN('owner','admin','manager') AND (m.role='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=NEW.company_id AND a.user_id=m.user_id AND a.warehouse_id=o.warehouse_id)) ON CONFLICT DO NOTHING;
 IF o.store_id IS NOT NULL THEN INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id) SELECT NEW.company_id,u.user_id,o.store_id,'backorder-substitute:'||NEW.id||':'||NEW.status,CASE NEW.status WHEN 'rejected' THEN 'rejected' WHEN 'pending' THEN 'approval_requested' ELSE 'approved' END,'VKIT substitute '||NEW.status,o.order_no||': '||component_sku||' → '||substitute_sku||'.','sales_order',o.id FROM (SELECT o.created_by user_id UNION SELECT a.user_id FROM store_user_assignments a WHERE a.company_id=NEW.company_id AND a.store_id=o.store_id AND a.store_role='store_manager')u ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;

CREATE VIEW vkit_backorder_substitution_options WITH (security_invoker=true) AS
WITH RECURSIVE active_edges AS (
  SELECT r.company_id,r.id relationship_id,r.source_item_id,r.target_item_id,r.conversion_ratio,r.priority,r.approval_required
  FROM item_relationships r
  WHERE r.active AND r.relationship_type IN('substitute','reciprocal_substitute','superseded_by')
    AND (r.effective_from IS NULL OR r.effective_from<=current_date)
    AND (r.effective_to IS NULL OR r.effective_to>=current_date)
  UNION ALL
  SELECT r.company_id,r.id,r.target_item_id,r.source_item_id,1/r.conversion_ratio,r.priority,r.approval_required
  FROM item_relationships r
  WHERE r.active AND r.relationship_type='reciprocal_substitute'
    AND (r.effective_from IS NULL OR r.effective_from<=current_date)
    AND (r.effective_to IS NULL OR r.effective_to>=current_date)
), paths AS (
  SELECT b.company_id,b.order_id,b.component_item_id,e.target_item_id,
         e.conversion_ratio::numeric(18,6) conversion_ratio,e.priority priority_score,
         e.approval_required,ARRAY[e.relationship_id] path_relationship_ids,
         ARRAY[b.component_item_id,e.target_item_id] path_item_ids,1 path_depth
  FROM vkit_backorder_shortages b
  JOIN active_edges e ON e.company_id=b.company_id AND e.source_item_id=b.component_item_id
  WHERE b.shortage_quantity>0
  UNION ALL
  SELECT p.company_id,p.order_id,p.component_item_id,e.target_item_id,
         (p.conversion_ratio*e.conversion_ratio)::numeric(18,6),p.priority_score+e.priority,
         p.approval_required OR e.approval_required,p.path_relationship_ids||e.relationship_id,
         p.path_item_ids||e.target_item_id,p.path_depth+1
  FROM paths p JOIN active_edges e ON e.company_id=p.company_id AND e.source_item_id=p.target_item_id
  WHERE p.path_depth<8 AND NOT e.target_item_id=ANY(p.path_item_ids)
), candidates AS (
  SELECT p.*,i.sku target_sku,i.description target_description,i.base_uom target_uom,
         coalesce(stock.available,0)::numeric(18,6) available_quantity,
         (b.shortage_quantity*p.conversion_ratio)::numeric(18,6) required_substitute_quantity,
         b.shortage_quantity,b.warehouse_id,b.overdue
  FROM paths p
  JOIN vkit_backorder_shortages b ON b.company_id=p.company_id AND b.order_id=p.order_id AND b.component_item_id=p.component_item_id
  JOIN items i ON i.company_id=p.company_id AND i.id=p.target_item_id AND i.status='active'
  LEFT JOIN LATERAL(SELECT sum(a.available_to_promise) available FROM inventory_availability a WHERE a.company_id=p.company_id AND a.warehouse_id=b.warehouse_id AND a.item_id=p.target_item_id AND a.stock_status='available')stock ON true
), ranked AS (
  SELECT c.*,row_number() OVER(PARTITION BY c.company_id,c.order_id,c.component_item_id ORDER BY (c.available_quantity>=c.required_substitute_quantity) DESC,c.path_depth,c.priority_score,c.target_sku,c.path_relationship_ids::text) option_rank
  FROM candidates c
)
SELECT company_id,order_id,component_item_id,target_item_id,target_sku,target_description,target_uom,
       conversion_ratio,priority_score,approval_required,path_relationship_ids,path_depth,
       available_quantity,required_substitute_quantity,shortage_quantity,warehouse_id,overdue,option_rank,
       (available_quantity>=required_substitute_quantity) sufficient
FROM ranked;

GRANT SELECT ON vkit_backorder_substitution_options TO stockflow_app;

CREATE INDEX item_relationships_target_reciprocal_idx ON item_relationships(company_id,target_item_id,priority)
WHERE active AND relationship_type='reciprocal_substitute';
