-- Erstelle die Tabelle "fahrlehrer"
CREATE TABLE IF NOT EXISTS fahrlehrer (
    kuerzel VARCHAR(10) PRIMARY KEY,
    vorname VARCHAR(50),
    nachname VARCHAR(50),
    telefonnr VARCHAR(15)
);

-- Erstelle die Tabelle "fahrschueler"
CREATE TABLE IF NOT EXISTS fahrschueler (
    nr INTEGER PRIMARY KEY AUTOINCREMENT,
    vorname VARCHAR(50),
    nachname VARCHAR(50),
    gebdatum DATE,
    theorie_bestanden BOOLEAN,
    anz_fahrstunden INT,
    fl_kuerzel VARCHAR(10),
    FOREIGN KEY (fl_kuerzel) REFERENCES fahrlehrer(kuerzel)
);

-- Füge 10 Fahrlehrer hinzu
INSERT INTO fahrlehrer (kuerzel, vorname, nachname, telefonnr)
VALUES
    ('Mus', 'Max', 'Mustermann', '123-456-7890'),
    ('Mu', 'Maria', 'Musterfrau', '987-654-3210'),
    ('Pet', 'Peter', 'Petersen', '555-123-4567'),
    ('Schm', 'Elaine', 'Schmidt', '111-222-3333');

INSERT INTO fahrschueler (vorname, nachname, gebdatum, theorie_bestanden, anz_fahrstunden, fl_kuerzel)
VALUES
    ('Hans', 'Schmidt', '2000-01-01', FALSE, 10, 'Mus'),
    ('Lisa', 'Terhoog', '2002-02-02', TRUE, 15, 'Mu'),
    ('Karl', 'Scholz', '2004-03-03', FALSE, 12, 'Pet'),
    ('Marie', 'Korting', '2006-04-04', TRUE, 20, 'Schm'),
    ('Fritz', 'Feidel', '2008-05-05', FALSE, 8, 'Mus'),
    ('Marie', 'Hermes', '2001-12-02', TRUE, 17, 'Mus'),
    ('Jana', 'Bisslich', '2010-06-06', TRUE, 18, 'Mus');