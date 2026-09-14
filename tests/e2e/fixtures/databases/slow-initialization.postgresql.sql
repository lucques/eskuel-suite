-- eskuel:system=postgresql
-- eskuel:systemMinVersion=14.0.0
CREATE TABLE marker (value INTEGER NOT NULL);
INSERT INTO marker VALUES (1);

WITH RECURSIVE counter(value) AS (
    SELECT 0
    UNION ALL
    SELECT value + 1
    FROM counter
    WHERE value < 10000000
)
SELECT SUM(value)
FROM counter;
