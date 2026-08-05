ALTER TABLE `filament_product` ADD COLUMN `manufacturer` text;
--> statement-breakpoint
ALTER TABLE `filament_product` ADD COLUMN `name` text;
--> statement-breakpoint
ALTER TABLE `filament_product` ADD COLUMN `category` text;
--> statement-breakpoint
ALTER TABLE `filament_product` ADD COLUMN `spool_type` text DEFAULT 'plastic' NOT NULL CHECK(`spool_type` IN ('plastic','cardboard','refill','reusable'));
