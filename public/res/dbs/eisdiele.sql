-- Create the "behaelter" table
CREATE TABLE IF NOT EXISTS behaelter (
    name TEXT PRIMARY KEY,
    preis INTEGER NOT NULL
);

-- Insert data into the "behaelter" table
INSERT INTO behaelter (name, preis)
VALUES
    ('Waffel', 50),
    ('Premiumwaffel', 70),
    ('Becher', 10);

-- Create the "sorte" table
CREATE TABLE IF NOT EXISTS sorte (
    name TEXT PRIMARY KEY,
    preis INTEGER NOT NULL
);

-- Insert data into the "sorte" table
INSERT INTO sorte (name, preis)
VALUES
    ('Cookie Dough', 110),
    ('Schokolade', 100),
    ('Vanille', 90);
