-- Create the "obst" table
CREATE TABLE obst (
    name VARCHAR(255) PRIMARY KEY NOT NULL,
    kilopreis DECIMAL(10, 2) NOT NULL,
    herkunft VARCHAR(255) NOT NULL
);

-- Insert sample data into the "obst" table
INSERT INTO obst (name, kilopreis, herkunft)
VALUES
    ('Apfel', 2.99, 'Deutschland'),
    ('Banane', 1.49, 'Costa Rica'),
    ('Erdbeere', 4.50, 'Spanien'),
    ('Traube', 3.75, 'Italien'),
    ('Kirsche', 5.20, 'Deutschland');

-- Create the "gemuese" table
CREATE TABLE gemuese (
    name VARCHAR(255) PRIMARY KEY NOT NULL,
    kilopreis DECIMAL(10, 2) NOT NULL,
    herkunft VARCHAR(255) NOT NULL
);

-- Insert sample data into the "gemuese" table
INSERT INTO gemuese (name, kilopreis, herkunft)
VALUES
    ('Tomate', 1.99, 'Niederlande'),
    ('Gurke', 1.25, 'Spanien'),
    ('Karotte', 1.75, 'Deutschland'),
    ('Zucchini', 2.20, 'Frankreich'),
    ('Brokkoli', 2.99, 'Deutschland');
