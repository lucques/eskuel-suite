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
    (3, 'David', 'Maier', '1995-09-10'),
    (4, 'Sarah', 'Müller', '1988-03-18'),
    (5, 'Michael', 'Schulz', '1992-07-01'),
    (6, 'Laura', 'Becker', '1987-11-25'),
    (7, 'Felix', 'Wagner', '1998-04-09'),
    (8, 'Sophie', 'Hofmann', '2000-09-03'),
    (9, 'Julian', 'Bauer', '1993-02-14'),
    (10, 'Lea', 'Keller', '1989-12-30'),
    (11, 'Luca', 'Peters', '1997-05-08'),
    (12, 'Emma', 'Hermann', '1994-08-17'),
    (13, 'Tim', 'Graf', '2001-03-21'),
    (14, 'Lena', 'Schmitt', '1986-10-11'),
    (15, 'Nico', 'Köhler', '1996-06-27'),
    (16, 'Mia', 'Lange', '1999-07-13'),
    (17, 'Paul', 'Krüger', '1991-04-02'),
    (18, 'Melina', 'Wolf', '1992-11-19'),
    (19, 'Jonas', 'Schröder', '1988-08-05'),
    (20, 'Emilia', 'Fuchs', '2002-01-24');

-- Beispieldaten einfügen: Bücher
INSERT INTO buch (isbn, titel, autor, preis, genre)
VALUES
    ('978-3-86680-192-9', 'Der Alchimist', 'Paulo Coelho', 12.99, 'Fiktion'),
    ('978-3-462-04513-1', 'Harry Potter und der Stein der Weisen', 'J.K. Rowling', 15.50, 'Fantasy'),
    ('978-3-547-91235-3', 'Die Verborgene', 'Sarah Weiss', 9.99, 'Thriller'),
    ('978-3-7897-1234-5', 'Die Kathedrale des Meeres', 'Ildefonso Falcones', 20.00, 'Historische Fiktion'),
    ('978-3-455-65012-3', 'Stadt der Diebe', 'David Benioff', 8.95, 'Historische Fiktion'),
    ('978-3-423-23034-7', 'Das Lied von Eis und Feuer', 'George R.R. Martin', 25.00, 'Fantasy'),
    ('978-3-86541-859-0', '1984', 'George Orwell', 10.50, 'Science Fiction'),
    ('978-3-442-54702-3', 'Der Herr der Ringe', 'J.R.R. Tolkien', 22.75, 'Fantasy'),
    ('978-3-492-26431-2', 'Der Medicus', 'Noah Gordon', 18.95, 'Historische Fiktion'),
    ('978-3-7857-2177-2', 'Momo', 'Michael Ende', 14.80, 'Kinderliteratur'),
    ('978-3-499-25821-5', 'Per Anhalter durch die Galaxis', 'Douglas Adams', 9.50, 'Science Fiction'),
    ('978-3-423-12314-1', 'Der kleine Prinz', 'Antoine de Saint-Exupéry', 7.99, 'Philosophie'),
    ('978-3-596-18048-7', 'Der Hobbit', 'J.R.R. Tolkien', 16.25, 'Fantasy'),
    ('978-3-453-17817-3', 'Der Name des Windes', 'Patrick Rothfuss', 19.95, 'Fantasy'),
    ('978-3-404-15431-1', 'Die Zwerge', 'Markus Heitz', 13.50, 'Fantasy'),
    ('978-3-499-26602-0', 'Der Schwarm', 'Frank Schätzing', 21.00, 'Thriller'),
    ('978-3-453-43570-8', 'Eragon', 'Christopher Paolini', 11.75, 'Fantasy'),
    ('978-3-442-46630-0', 'Der Zauberer', 'Wolfgang Hohlbein', 14.25, 'Fantasy'),
    ('978-3-10-397083-5', 'Der Fänger im Roggen', 'J.D. Salinger', 9.95, 'Fiktion'),
    ('978-3-596-52008-3', 'Die Säulen der Erde', 'Ken Follett', 17.00, 'Historische Fiktion');

-- Beispieldaten einfügen: Warenkorb-Zuordnungen
INSERT INTO warenkorb (kundennr, isbn, anzahl)
VALUES
    (1, '978-3-86680-192-9', 2),
    (1, '978-3-462-04513-1', 1),
    (2, '978-3-86680-192-9', 3),
    (3, '978-3-547-91235-3', 1),
    (4, '978-3-7897-1234-5', 2),
    (5, '978-3-455-65012-3', 1),
    (6, '978-3-423-23034-7', 1),
    (7, '978-3-86541-859-0', 2),
    (8, '978-3-442-54702-3', 1),
    (9, '978-3-492-26431-2', 1),
    (10, '978-3-7857-2177-2', 1),
    (11, '978-3-499-25821-5', 3),
    (12, '978-3-423-12314-1', 1),
    (13, '978-3-596-18048-7', 2),
    (14, '978-3-453-17817-3', 1),
    (15, '978-3-404-15431-1', 1),
    (16, '978-3-499-26602-0', 2),
    (17, '978-3-453-43570-8', 1),
    (18, '978-3-442-46630-0', 1),
    (19, '978-3-10-397083-5', 1),
    (20, '978-3-596-52008-3', 2),
    -- Some more people have bought random books:
    (1, '978-3-423-23034-7', 1),
    (4, '978-3-596-52008-3', 1),
    (7, '978-3-442-46630-0', 1),
    (10, '978-3-453-43570-8', 1),
    (13, '978-3-453-17817-3', 1),
    (16, '978-3-596-18048-7', 1),
    (19, '978-3-499-26602-0', 1),
    (2, '978-3-453-17817-3', 1),
    (5, '978-3-86541-859-0', 1),
    (8, '978-3-453-43570-8', 1),
    (11, '978-3-596-52008-3', 1),
    (14, '978-3-442-46630-0', 1),
    (17, '978-3-423-23034-7', 1),
    (20, '978-3-442-54702-3', 1),
    (3, '978-3-596-52008-3', 1),
    (6, '978-3-453-43570-8', 1),
    (9, '978-3-86541-859-0', 1),
    (12, '978-3-596-18048-7', 1),
    (15, '978-3-442-46630-0', 1),
    (18, '978-3-423-23034-7', 1);

COMMIT;
