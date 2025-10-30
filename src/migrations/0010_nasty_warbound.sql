ALTER TABLE `tokens` ADD `input` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `tokens` ADD `output` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `tokens` ADD `cached` integer;--> statement-breakpoint
ALTER TABLE `tokens` ADD `reasoning` integer;