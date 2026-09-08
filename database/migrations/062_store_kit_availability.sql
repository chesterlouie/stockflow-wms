CREATE VIEW store_kit_availability WITH (security_invoker=true) AS
SELECT
  k.company_id,
  s.id AS store_id,
  k.kit_item_id,
  floor(min(greatest(coalesce(b.available,0),0)/k.quantity))::numeric(18,6) AS available_kits
FROM item_kit_components k
JOIN items kit
  ON kit.company_id=k.company_id
 AND kit.id=k.kit_item_id
 AND kit.item_type='virtual_kit'
 AND kit.status='active'
JOIN requesting_stores s
  ON s.company_id=k.company_id
 AND s.status='active'
LEFT JOIN LATERAL (
  SELECT sum(l.quantity) AS available
  FROM store_inventory_ledger l
  WHERE l.company_id=k.company_id
    AND l.store_id=s.id
    AND l.item_id=k.component_item_id
) b ON true
WHERE k.active AND NOT k.optional
GROUP BY k.company_id,s.id,k.kit_item_id;

GRANT SELECT ON store_kit_availability TO stockflow_app;
