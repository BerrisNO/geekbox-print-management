ALTER TABLE print_job ADD COLUMN cover_url TEXT;
--> statement-breakpoint
ALTER TABLE print_job ADD COLUMN cover_cached INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE print_job ADD COLUMN total_weight_g REAL;
--> statement-breakpoint
ALTER TABLE filament_usage ADD COLUMN tray_type TEXT;
--> statement-breakpoint
ALTER TABLE filament_usage ADD COLUMN color_hex TEXT;
