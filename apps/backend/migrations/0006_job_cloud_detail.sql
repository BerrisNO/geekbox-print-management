ALTER TABLE print_job ADD COLUMN total_length_mm REAL;
--> statement-breakpoint
ALTER TABLE print_job ADD COLUMN bed_type TEXT;
--> statement-breakpoint
ALTER TABLE print_job ADD COLUMN plate_index INTEGER;
--> statement-breakpoint
ALTER TABLE filament_usage ADD COLUMN filament_id TEXT;
