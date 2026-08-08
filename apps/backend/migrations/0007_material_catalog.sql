CREATE TABLE `material` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`density_g_cm3` real NOT NULL,
	`notes` text,
	`archived` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `material_density_ck` CHECK(`density_g_cm3` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_name_uq` ON `material` (`name`);
--> statement-breakpoint
INSERT INTO `material` (`id`, `name`, `density_g_cm3`) VALUES
	(lower(hex(randomblob(16))), 'PLA', 1.24),
	(lower(hex(randomblob(16))), 'PETG', 1.27),
	(lower(hex(randomblob(16))), 'ABS', 1.04),
	(lower(hex(randomblob(16))), 'TPU', 1.21),
	(lower(hex(randomblob(16))), 'ASA', 1.07),
	(lower(hex(randomblob(16))), 'PC', 1.2),
	(lower(hex(randomblob(16))), 'PA', 1.14),
	(lower(hex(randomblob(16))), 'SUPPORT', 1.2),
	(lower(hex(randomblob(16))), 'OTHER', 1.2);
--> statement-breakpoint
INSERT INTO `material` (`id`, `name`, `density_g_cm3`)
SELECT lower(hex(randomblob(16))), `m`.`material`, 1.2
FROM (
	SELECT DISTINCT `material` FROM `filament_product`
	WHERE `material` NOT IN (SELECT `name` FROM `material`)
) `m`;
--> statement-breakpoint
CREATE TABLE `filament_product_new` (
	`id` text PRIMARY KEY NOT NULL,
	`material` text NOT NULL,
	`manufacturer` text,
	`manufacturer_id` text,
	`name` text,
	`category` text,
	`spool_type` text DEFAULT 'plastic' NOT NULL,
	`color_name` text NOT NULL,
	`color_hex` text,
	`vendor_id` text NOT NULL,
	`diameter_mm` real DEFAULT 1.75 NOT NULL,
	`nominal_net_weight_g` integer NOT NULL,
	`default_price_minor` integer DEFAULT 0 NOT NULL,
	`density_g_cm3` real NOT NULL,
	`low_stock_threshold_g` integer,
	`low_stock_min_spools` integer,
	`sku` text,
	`notes` text,
	`archived` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendor`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturer`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `filament_product_diameter_ck` CHECK(`diameter_mm` IN (1.75, 2.85)),
	CONSTRAINT `filament_product_nom_weight_ck` CHECK(`nominal_net_weight_g` > 0),
	CONSTRAINT `filament_product_default_price_ck` CHECK(`default_price_minor` >= 0),
	CONSTRAINT `filament_product_spool_type_ck` CHECK(`spool_type` IN ('plastic','cardboard','refill','reusable'))
);
--> statement-breakpoint
INSERT INTO `filament_product_new` (
	`id`, `material`, `manufacturer`, `manufacturer_id`, `name`, `category`,
	`spool_type`, `color_name`, `color_hex`, `vendor_id`, `diameter_mm`,
	`nominal_net_weight_g`, `default_price_minor`, `density_g_cm3`,
	`low_stock_threshold_g`, `low_stock_min_spools`, `sku`, `notes`, `archived`
)
SELECT
	`id`, `material`, `manufacturer`, `manufacturer_id`, `name`, `category`,
	`spool_type`, `color_name`, `color_hex`, `vendor_id`, `diameter_mm`,
	`nominal_net_weight_g`, `default_price_minor`, `density_g_cm3`,
	`low_stock_threshold_g`, `low_stock_min_spools`, `sku`, `notes`, `archived`
FROM `filament_product`;
--> statement-breakpoint
DROP TABLE `filament_product`;
--> statement-breakpoint
ALTER TABLE `filament_product_new` RENAME TO `filament_product`;
