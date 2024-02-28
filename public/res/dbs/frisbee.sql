-- Create the 'team' table
CREATE TABLE IF NOT EXISTS team (
    team_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    gruendungsjahr INTEGER,
    ort TEXT,
    bundesland TEXT
);

-- Create the 'nimmt_teil_an' table
CREATE TABLE IF NOT EXISTS nimmt_teil_an (
    team_id INTEGER,
    turnier_nr INTEGER,
    FOREIGN KEY (team_id) REFERENCES team (team_id),
    FOREIGN KEY (turnier_nr) REFERENCES turnier (turnier_nr)
);

-- Create the 'turnier' table
CREATE TABLE IF NOT EXISTS turnier (
    turnier_nr INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    ort TEXT,
    datum DATE
);

-- Insert into the 'team' table
INSERT INTO team (team_id, name, gruendungsjahr, ort, bundesland)
VALUES
    (111, 'Frisbee-Club Schönberg', 1999, 'Schönberg', 'MV'),
    (67, '1. FC Gadebusch', 1980, 'Gadebusch', 'MV');


-- Insert into the 'nimmt_teil_an' table
INSERT INTO nimmt_teil_an (team_id, turnier_nr)
VALUES
    (111, 743),
    (111, 544),
    (67,  544);

-- Insert into the 'turnier' table
INSERT INTO turnier (turnier_nr, name, ort, datum)
VALUES
    (743, 'Nordd. Meisterschaft 2023', 'Hamburg', '2023-04-14'),
    (544, 'MV-Cup 2022', 'Schwerin', '2022-07-01');

