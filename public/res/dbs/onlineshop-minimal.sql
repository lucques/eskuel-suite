BEGIN TRANSACTION;

-- Tabelle "kunde" erstellen
CREATE TABLE kunde (
    kundennr INT PRIMARY KEY,
    vorname VARCHAR(50),
    nachname VARCHAR(50),
    gebdatum DATE
);

-- Tabelle "buch" erstellen
CREATE TABLE buch (
    isbn VARCHAR(13) PRIMARY KEY,
    titel VARCHAR(100),
    autor VARCHAR(100),
    preis DECIMAL(10, 2),
    genre VARCHAR(100)
);

-- Tabelle "warenkorb" erstellen
CREATE TABLE warenkorb (
    kundennr INT,
    isbn VARCHAR(13),
    anzahl INT,
    PRIMARY KEY (kundennr, isbn),
    FOREIGN KEY (kundennr) REFERENCES kunde(kundennr),
    FOREIGN KEY (isbn) REFERENCES buch(isbn)
);

-- Beispieldaten einfügen: Kunden
INSERT INTO kunde (kundennr, vorname, nachname, gebdatum)
VALUES
    (1, 'Max', 'Mustermann', '1990-01-15'),
    (2, 'Anna', 'Schmidt', '1985-06-22'),
    (3, 'Meike', 'Musterfrau', '2000-02-12');

-- Beispieldaten einfügen: Bücher
INSERT INTO buch (isbn, titel, autor, preis, genre)
VALUES
    ('978-3-86680-192-9', 'Der Alchimist', 'Paulo Coelho', 12.99, 'Fiktion'),
    ('978-3-462-04513-1', 'Harry Potter und der Stein der Weisen', 'J.K. Rowling', 15.50, 'Fantasy');

-- Beispieldaten einfügen: Warenkorb-Zuordnungen
INSERT INTO warenkorb (kundennr, isbn, anzahl)
VALUES
    (1, '978-3-86680-192-9', 2),
    (1, '978-3-462-04513-1', 1),
    (2, '978-3-86680-192-9', 3),
    (3, '978-3-86680-192-9', 1);


COMMIT;
