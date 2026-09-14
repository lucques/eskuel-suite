-- eskuel:system=sqlite
-- eskuel:systemMinVersion=3.0.0
CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
INSERT INTO students (name) VALUES ('Ada'), ('Grace');
