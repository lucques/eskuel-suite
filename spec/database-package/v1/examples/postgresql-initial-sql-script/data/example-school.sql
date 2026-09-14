-- eskuel:system=postgresql
-- eskuel:systemMinVersion=14.0.0
CREATE TABLE students (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL
);
INSERT INTO students (name) VALUES ('Ada'), ('Grace');
