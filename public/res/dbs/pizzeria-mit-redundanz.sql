-- Tabelle 'pizza' mit den Attributen 'pizza_id', 'name', 'im_sortiment_seit', 'preis'
CREATE TABLE pizza (
    pizza_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    im_sortiment_seit DATE,
    preis REAL
);

-- Tabelle 'zutat' mit den Attributen 'zutat_nr', 'name', 'ist_vegetarisch', 'ist_vegan'
CREATE TABLE zutat (
    zutat_nr INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    ist_vegetarisch BOOLEAN,
    ist_vegan BOOLEAN
);

-- Tabelle 'ist_belegt_mit' mit den Attributen 'pizza_id', 'pizza_name', 'zutat_nr'
CREATE TABLE ist_belegt_mit (
    pizza_id INTEGER,
    zutat_nr INTEGER,
    zutat_name TEXT,
    FOREIGN KEY (pizza_id) REFERENCES pizza(pizza_id),
    FOREIGN KEY (zutat_nr) REFERENCES zutat(zutat_nr)
);

-- Beispieldaten für die Tabelle 'pizza'
INSERT INTO pizza (pizza_id, name, im_sortiment_seit, preis) VALUES
    (1, 'Margherita', '1999-05-01', 8.99),
    (7, 'Calzone', '2001-06-30', 10.99);

-- Beispieldaten für die Tabelle 'zutat'
INSERT INTO zutat (zutat_nr, name, ist_vegetarisch, ist_vegan) VALUES
    (7, 'Mozzarella', 1, 0),
    (11, 'Kochschinken', 0, 0);

INSERT INTO ist_belegt_mit (pizza_id, zutat_nr, zutat_name) VALUES
    (1, 7, 'Mozzarella'),
    (7, 7, 'Mozzarella'),
    (7, 11, 'Kochschinken');