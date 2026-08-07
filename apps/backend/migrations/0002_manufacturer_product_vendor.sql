CREATE TABLE `manufacturer` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`notes` text,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `filament_product` ADD COLUMN `manufacturer_id` text REFERENCES `manufacturer`(`id`);
--> statement-breakpoint
INSERT INTO `manufacturer` (`id`, `name`, `archived`)
SELECT lower(hex(randomblob(16))), TRIM(`manufacturer`), 0
FROM (
	SELECT DISTINCT TRIM(`manufacturer`) AS `manufacturer`
	FROM `filament_product`
	WHERE `manufacturer` IS NOT NULL AND TRIM(`manufacturer`) != ''
);
--> statement-breakpoint
UPDATE `filament_product`
SET `manufacturer_id` = (
	SELECT `m`.`id` FROM `manufacturer` `m` WHERE `m`.`name` = TRIM(`filament_product`.`manufacturer`)
)
WHERE `manufacturer` IS NOT NULL AND TRIM(`manufacturer`) != '';
--> statement-breakpoint
CREATE TABLE `product_vendor` (
	`product_id` text NOT NULL REFERENCES `filament_product`(`id`),
	`vendor_id` text NOT NULL REFERENCES `vendor`(`id`),
	PRIMARY KEY (`product_id`, `vendor_id`)
);
--> statement-breakpoint
INSERT INTO `product_vendor` (`product_id`, `vendor_id`)
SELECT `id`, `vendor_id` FROM `filament_product`;
