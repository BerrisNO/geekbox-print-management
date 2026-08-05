CREATE TABLE `user_account` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_account_username_unique` ON `user_account` (`username`);
--> statement-breakpoint
CREATE TABLE `session` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vendor` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`notes` text,
	`lead_time_days` integer,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `filament_product` (
	`id` text PRIMARY KEY NOT NULL,
	`material` text NOT NULL,
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
	CONSTRAINT `filament_product_material_ck` CHECK(`filament_product`.`material` IN ('PLA','PETG','ABS','TPU','ASA','PC','PA','SUPPORT','OTHER')),
	CONSTRAINT `filament_product_diameter_ck` CHECK(`filament_product`.`diameter_mm` IN (1.75, 2.85)),
	CONSTRAINT `filament_product_nom_weight_ck` CHECK(`filament_product`.`nominal_net_weight_g` > 0),
	CONSTRAINT `filament_product_default_price_ck` CHECK(`filament_product`.`default_price_minor` >= 0)
);
--> statement-breakpoint
CREATE TABLE `spool` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`product_id` text NOT NULL,
	`initial_net_weight_g` integer NOT NULL,
	`remaining_net_weight_g` real NOT NULL,
	`tare_weight_g` integer,
	`purchase_price_minor` integer,
	`source` text NOT NULL,
	`goods_receipt_line_id` text,
	`status` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`product_id`) REFERENCES `filament_product`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `spool_initial_weight_ck` CHECK(`spool`.`initial_net_weight_g` > 0 AND `spool`.`initial_net_weight_g` <= 20000),
	CONSTRAINT `spool_remaining_ck` CHECK(`spool`.`remaining_net_weight_g` >= 0),
	CONSTRAINT `spool_source_ck` CHECK(`spool`.`source` IN ('goods_reception','manual')),
	CONSTRAINT `spool_status_ck` CHECK(`spool`.`status` IN ('in_stock','in_use','depleted','archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spool_label_unique` ON `spool` (`label`);
--> statement-breakpoint
CREATE INDEX `spool_product_status_idx` ON `spool` (`product_id`,`status`);
--> statement-breakpoint
CREATE TABLE `spool_ledger_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`spool_id` text NOT NULL,
	`type` text NOT NULL,
	`delta_g` real NOT NULL,
	`applied_delta_g` real DEFAULT 0 NOT NULL,
	`balance_after_g` real NOT NULL,
	`job_id` text,
	`slot_ref` text,
	`reverses_entry_id` text,
	`estimated` integer DEFAULT 0 NOT NULL,
	`over_consumption` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`spool_id`) REFERENCES `spool`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `ledger_type_ck` CHECK(`spool_ledger_entry`.`type` IN ('initial','consumption','manual_adjustment','reversal')),
	CONSTRAINT `ledger_balance_ck` CHECK(`spool_ledger_entry`.`balance_after_g` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_reverses_uq` ON `spool_ledger_entry` (`reverses_entry_id`) WHERE `spool_ledger_entry`.`reverses_entry_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `ledger_spool_created_idx` ON `spool_ledger_entry` (`spool_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TABLE `ams_slot_mapping` (
	`id` text PRIMARY KEY NOT NULL,
	`printer_id` text NOT NULL,
	`unit_index` integer NOT NULL,
	`slot_index` integer NOT NULL,
	`spool_id` text NOT NULL,
	`mapped_at` integer NOT NULL,
	`verify_flag` integer DEFAULT 0 NOT NULL,
	`verify_reason` text,
	FOREIGN KEY (`spool_id`) REFERENCES `spool`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `ams_unit_ck` CHECK((`ams_slot_mapping`.`unit_index` BETWEEN 0 AND 3) OR `ams_slot_mapping`.`unit_index` = 254),
	CONSTRAINT `ams_slot_ck` CHECK((`ams_slot_mapping`.`slot_index` BETWEEN 0 AND 3) AND (`ams_slot_mapping`.`unit_index` != 254 OR `ams_slot_mapping`.`slot_index` = 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ams_slot_uq` ON `ams_slot_mapping` (`printer_id`,`unit_index`,`slot_index`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ams_spool_uq` ON `ams_slot_mapping` (`spool_id`);
--> statement-breakpoint
CREATE TABLE `purchase_order` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`status` text NOT NULL,
	`order_date` integer NOT NULL,
	`expected_arrival` integer,
	`external_ref` text,
	`notes` text,
	`shipping_cost_minor` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendor`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `po_status_ck` CHECK(`purchase_order`.`status` IN ('draft','ordered','partially_received','received','cancelled')),
	CONSTRAINT `po_shipping_ck` CHECK(`purchase_order`.`shipping_cost_minor` IS NULL OR `purchase_order`.`shipping_cost_minor` >= 0)
);
--> statement-breakpoint
CREATE INDEX `po_status_eta_idx` ON `purchase_order` (`status`,`expected_arrival`);
--> statement-breakpoint
CREATE TABLE `po_status_event` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_order_line` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity_ordered` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`expected_weight_override_g` integer,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `filament_product`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `pol_qty_ck` CHECK(`purchase_order_line`.`quantity_ordered` > 0),
	CONSTRAINT `pol_price_ck` CHECK(`purchase_order_line`.`unit_price_minor` >= 0),
	CONSTRAINT `pol_weight_ck` CHECK(`purchase_order_line`.`expected_weight_override_g` IS NULL OR `purchase_order_line`.`expected_weight_override_g` > 0)
);
--> statement-breakpoint
CREATE TABLE `goods_receipt` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`received_at` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `goods_receipt_line` (
	`id` text PRIMARY KEY NOT NULL,
	`goods_receipt_id` text NOT NULL,
	`po_line_id` text NOT NULL,
	`quantity_received` integer NOT NULL,
	`quantity_damaged` integer DEFAULT 0 NOT NULL,
	`actual_unit_price_minor` integer,
	`over_delivery` integer DEFAULT 0 NOT NULL,
	`discrepancy_note` text,
	FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipt`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_line_id`) REFERENCES `purchase_order_line`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `grl_qty_ck` CHECK(`goods_receipt_line`.`quantity_received` > 0),
	CONSTRAINT `grl_damaged_ck` CHECK(`goods_receipt_line`.`quantity_damaged` >= 0 AND `goods_receipt_line`.`quantity_damaged` <= `goods_receipt_line`.`quantity_received`)
);
--> statement-breakpoint
CREATE INDEX `grl_po_line_idx` ON `goods_receipt_line` (`po_line_id`);
--> statement-breakpoint
CREATE TABLE `cloud_link` (
	`id` text PRIMARY KEY NOT NULL,
	`bambu_uid` text,
	`access_token_enc` blob,
	`refresh_token_enc` blob,
	`state` text DEFAULT 'unlinked' NOT NULL,
	`auth_mode` text DEFAULT 'password' NOT NULL,
	`mqtt_region` text DEFAULT 'us' NOT NULL,
	`integration_enabled` integer DEFAULT 1 NOT NULL,
	`task_sync_interval_min` integer DEFAULT 30 NOT NULL,
	`linked_at` integer,
	`token_issued_at` integer,
	`last_rest_success_at` integer,
	`mqtt_connected_since` integer,
	`last_mqtt_message_at` integer,
	`last_error_class` text,
	CONSTRAINT `cloud_link_state_ck` CHECK(`cloud_link`.`state` IN ('unlinked','linked','reauth_required')),
	CONSTRAINT `cloud_link_authmode_ck` CHECK(`cloud_link`.`auth_mode` IN ('password','manual_token'))
);
--> statement-breakpoint
CREATE TABLE `printer` (
	`id` text PRIMARY KEY NOT NULL,
	`serial` text NOT NULL,
	`name` text NOT NULL,
	`model` text,
	`registration` text NOT NULL,
	`tracked` integer DEFAULT 1 NOT NULL,
	`online_flag` integer DEFAULT 0 NOT NULL,
	`last_seen_at` integer,
	CONSTRAINT `printer_registration_ck` CHECK(`printer`.`registration` IN ('discovered','manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printer_serial_unique` ON `printer` (`serial`);
--> statement-breakpoint
CREATE TABLE `telemetry_snapshot` (
	`printer_id` text PRIMARY KEY NOT NULL,
	`captured_at` integer NOT NULL,
	`printer_state` text NOT NULL,
	`task_name` text,
	`progress_pct` real,
	`current_layer` integer,
	`total_layers` integer,
	`remaining_time_min` real,
	`nozzle_temp_c` real,
	`bed_temp_c` real,
	`chamber_temp_c` real,
	`ams_json` text,
	FOREIGN KEY (`printer_id`) REFERENCES `printer`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `telemetry_state_ck` CHECK(`telemetry_snapshot`.`printer_state` IN ('idle','printing','paused','error','offline','unknown'))
);
--> statement-breakpoint
CREATE TABLE `print_job` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`bambu_task_id` text,
	`printer_id` text,
	`job_name` text DEFAULT '' NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`duration_min` real,
	`outcome` text DEFAULT 'unknown' NOT NULL,
	`usage_status` text DEFAULT 'unknown' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printer`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `job_source_ck` CHECK(`print_job`.`source` IN ('task_sync','telemetry','manual')),
	CONSTRAINT `job_outcome_ck` CHECK(`print_job`.`outcome` IN ('success','failed','cancelled','unknown')),
	CONSTRAINT `job_usage_status_ck` CHECK(`print_job`.`usage_status` IN ('reported','estimated','unknown','manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `print_job_bambu_task_id_unique` ON `print_job` (`bambu_task_id`);
--> statement-breakpoint
CREATE INDEX `job_printer_started_idx` ON `print_job` (`printer_id`,`started_at` DESC);
--> statement-breakpoint
CREATE INDEX `job_outcome_idx` ON `print_job` (`outcome`);
--> statement-breakpoint
CREATE TABLE `filament_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`slot_ref` text NOT NULL,
	`spool_id` text,
	`used_g` real,
	`used_mm` real,
	`estimated` integer DEFAULT 0 NOT NULL,
	`attributed` integer DEFAULT 0 NOT NULL,
	`ledger_entry_id` text,
	FOREIGN KEY (`job_id`) REFERENCES `print_job`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`spool_id`) REFERENCES `spool`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `spool_ledger_entry`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `usage_used_g_ck` CHECK(`filament_usage`.`used_g` IS NULL OR `filament_usage`.`used_g` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `filament_usage_ledger_entry_id_unique` ON `filament_usage` (`ledger_entry_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_job_slot_uq` ON `filament_usage` (`job_id`,`slot_ref`);
--> statement-breakpoint
CREATE INDEX `usage_job_idx` ON `filament_usage` (`job_id`);
--> statement-breakpoint
CREATE INDEX `usage_spool_idx` ON `filament_usage` (`spool_id`);
--> statement-breakpoint
CREATE TABLE `cost_rate_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`energy_price_per_kwh_minor` integer,
	`machine_rate_per_hour_minor` integer,
	`currency_code` text DEFAULT 'NOK' NOT NULL,
	CONSTRAINT `crs_energy_ck` CHECK(`cost_rate_settings`.`energy_price_per_kwh_minor` IS NULL OR `cost_rate_settings`.`energy_price_per_kwh_minor` >= 0),
	CONSTRAINT `crs_machine_ck` CHECK(`cost_rate_settings`.`machine_rate_per_hour_minor` IS NULL OR `cost_rate_settings`.`machine_rate_per_hour_minor` >= 0)
);
--> statement-breakpoint
CREATE TABLE `printer_power_draw` (
	`printer_id` text PRIMARY KEY NOT NULL,
	`watts` real NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printer`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `ppd_watts_ck` CHECK(`printer_power_draw`.`watts` > 0)
);
--> statement-breakpoint
CREATE TABLE `cost_calculation` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`calculated_at` integer NOT NULL,
	`filament_cost_minor` integer NOT NULL,
	`energy_cost_minor` integer,
	`machine_cost_minor` integer,
	`total_cost_minor` integer NOT NULL,
	`incomplete` integer DEFAULT 0 NOT NULL,
	`inputs_snapshot_json` text NOT NULL,
	`superseded` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `print_job`(`id`) ON UPDATE no action ON DELETE no action
);
