CREATE TABLE `customer` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `part` (
	`id` text PRIMARY KEY NOT NULL,
	`article_no` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`customer_id` text REFERENCES `customer`(`id`),
	`customer_article_no` text,
	`print_time_min` integer,
	`labor_time_min` integer,
	`power_draw_w` integer,
	`markup_pct` real,
	`sell_price_minor` integer,
	`notes` text,
	`archived` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `part_print_time_ck` CHECK (`print_time_min` IS NULL OR `print_time_min` >= 0),
	CONSTRAINT `part_labor_time_ck` CHECK (`labor_time_min` IS NULL OR `labor_time_min` >= 0),
	CONSTRAINT `part_power_draw_ck` CHECK (`power_draw_w` IS NULL OR `power_draw_w` >= 0),
	CONSTRAINT `part_markup_ck` CHECK (`markup_pct` IS NULL OR `markup_pct` >= 0),
	CONSTRAINT `part_sell_price_ck` CHECK (`sell_price_minor` IS NULL OR `sell_price_minor` >= 0)
);
--> statement-breakpoint
CREATE TABLE `part_material` (
	`part_id` text NOT NULL REFERENCES `part`(`id`),
	`filament_product_id` text NOT NULL REFERENCES `filament_product`(`id`),
	`grams` real NOT NULL,
	PRIMARY KEY (`part_id`, `filament_product_id`),
	CONSTRAINT `part_material_grams_ck` CHECK (`grams` > 0)
);
--> statement-breakpoint
ALTER TABLE `cost_rate_settings` ADD COLUMN `labor_rate_per_hour_minor` integer;
--> statement-breakpoint
ALTER TABLE `cost_rate_settings` ADD COLUMN `default_markup_pct` real;
--> statement-breakpoint
ALTER TABLE `cost_rate_settings` ADD COLUMN `default_power_draw_w` integer;
