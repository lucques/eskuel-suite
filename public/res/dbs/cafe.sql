-- Tabelle "getraenke"
CREATE TABLE getraenke (
    name VARCHAR(255) PRIMARY KEY NOT NULL,
    preis DECIMAL(10, 2) NOT NULL,
    volumen INT NOT NULL -- Volumen in Millilitern (ml)
);

-- Beispieldatensätze für "getraenke"
INSERT INTO getraenke (name, preis, volumen) VALUES
    ('Kaffee', 2.50, 250),
    ('Tee', 2.00, 240),
    ('Cappuccino', 3.00, 300),
    ('Espresso', 2.50, 50),
    ('Heiße Schokolade', 3.50, 300);

-- Tabelle "kuchen"
CREATE TABLE kuchen (
    name VARCHAR(255) PRIMARY KEY NOT NULL,
    preis DECIMAL(10, 2) NOT NULL,
    ist_vegan BOOLEAN NOT NULL
);

-- Beispieldatensätze für "kuchen"
INSERT INTO kuchen (name, preis, ist_vegan) VALUES
    ('Schokoladenkuchen', 4.50, FALSE),
    ('Apfelkuchen', 3.50, TRUE),
    ('Karottenkuchen', 4.00, TRUE),
    ('Käsekuchen', 4.50, FALSE),
    ('Zitronenkuchen', 4.00, TRUE);
