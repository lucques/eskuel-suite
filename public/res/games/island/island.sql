CREATE TABLE IF NOT EXISTS gegenstand (
    gegenstand	TEXT,
    besitzer	INTEGER,
    PRIMARY KEY(gegenstand)
);
INSERT INTO gegenstand VALUES ('Teekanne',NULL);
INSERT INTO gegenstand VALUES ('Spazierstock',5);
INSERT INTO gegenstand VALUES ('Hammer',2);
INSERT INTO gegenstand VALUES ('Ring',NULL);
INSERT INTO gegenstand VALUES ('Kaffeetasse',NULL);
INSERT INTO gegenstand VALUES ('Eimer',NULL);
INSERT INTO gegenstand VALUES ('Seil',17);
INSERT INTO gegenstand VALUES ('Pappkarton',NULL);
INSERT INTO gegenstand VALUES ('Gluehbirne',NULL);
CREATE TABLE IF NOT EXISTS dorf (
    dorfnr	INTEGER,
    name	TEXT,
    haeuptling	INTEGER,
    PRIMARY KEY(dorfnr)
);
INSERT INTO dorf VALUES (1,'Affenstadt',1);
INSERT INTO dorf VALUES (2,'Gurkendorf',6);
INSERT INTO dorf VALUES (3,'Zwiebelhausen',13);
CREATE TABLE IF NOT EXISTS bewohner (
    bewohnernr	INTEGER,
    name	TEXT,
    dorfnr	INTEGER,
    geschlecht	TEXT,
    beruf	TEXT,
    gold	INTEGER,
    status	TEXT,
    PRIMARY KEY(bewohnernr)
);
INSERT INTO bewohner VALUES (1,'Paul Backmann',1,'m','Baecker',850,'friedlich');
INSERT INTO bewohner VALUES (2,'Ernst Peng',3,'m','Waffenschmied',280,'friedlich');
INSERT INTO bewohner VALUES (3,'Rita Ochse',1,'w','Baecker',350,'friedlich');
INSERT INTO bewohner VALUES (4,'Carl Ochse',1,'m','Kaufmann',250,'friedlich');
INSERT INTO bewohner VALUES (5,'Dirty Dieter',3,'m','Schmied',650,'boese');
INSERT INTO bewohner VALUES (6,'Gerd Schlachter',2,'m','Metzger',4850,'boese');
INSERT INTO bewohner VALUES (7,'Peter Schlachter',3,'m','Metzger',3250,'boese');
INSERT INTO bewohner VALUES (8,'Arthur Schneiderpaule',2,'m','Pilot',490,'gefangen');
INSERT INTO bewohner VALUES (9,'Tanja Trommler',1,'w','Baecker',550,'boese');
INSERT INTO bewohner VALUES (10,'Peter Trommler',1,'m','Schmied',600,'friedlich');
INSERT INTO bewohner VALUES (11,'Dirty Doerthe',3,'w','Erntehelfer',10,'boese');
INSERT INTO bewohner VALUES (12,'Otto Armleuchter',2,'m','Haendler',680,'friedlich');
INSERT INTO bewohner VALUES (13,'Fritz Dichter',3,'m','Hoerbuchautor',420,'friedlich');
INSERT INTO bewohner VALUES (14,'Enrico Zimmermann',3,'m','Waffenschmied',510,'boese');
INSERT INTO bewohner VALUES (15,'Helga Rasenkopf',2,'w','Haendler',680,'friedlich');
INSERT INTO bewohner VALUES (16,'Irene Hutmacher',1,'w','Haendler',770,'boese');
INSERT INTO bewohner VALUES (17,'Erich Rasenkopf',3,'m','Metzger',990,'friedlich');
INSERT INTO bewohner VALUES (18,'Rudolf Gaul',3,'m','Hufschmied',390,'friedlich');
INSERT INTO bewohner VALUES (19,'Anny Flysh',2,'w','Metzger',2280,'friedlich');