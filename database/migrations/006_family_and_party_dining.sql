-- Real, independently managed tables for the supplied restaurant floor plan.
-- Re-running this migration preserves every existing table and its live state.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('dining-layout:a0000000-0000-0000-0000-000000000001'));

INSERT INTO restaurant_pos.tables (table_id, restaurant_id, table_number, capacity, status, qr_identifier)
SELECT layout.table_id::uuid,
       'a0000000-0000-0000-0000-000000000001'::uuid,
       layout.table_number,
       layout.capacity,
       'AVAILABLE',
       'DINING_a0000000000000000000000000000001_' || layout.qr_suffix
FROM (VALUES
    ('c1000000-0000-0000-0000-000000000001', 101, 14, 'FAMILY_C1'),
    ('c1000000-0000-0000-0000-000000000002', 102, 14, 'FAMILY_C2'),
    ('c1000000-0000-0000-0000-000000000003', 103, 16, 'FAMILY_C3'),
    ('c1000000-0000-0000-0000-000000000004', 104, 16, 'FAMILY_C4'),
    ('c2000000-0000-0000-0000-000000000001', 201, 70, 'PARTY_HALL')
) AS layout(table_id, table_number, capacity, qr_suffix)
WHERE EXISTS (SELECT 1 FROM restaurant_pos.restaurants WHERE restaurant_id = 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

COMMIT;
