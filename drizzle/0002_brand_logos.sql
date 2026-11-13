ALTER TABLE brands ADD COLUMN logo TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
INSERT INTO brands (name_key,name) VALUES ('fastdrama','FastDrama'),('yemek market','Yemek Market'),('amore','Amore') ON CONFLICT(name_key) DO NOTHING;
