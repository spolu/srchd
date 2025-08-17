CREATE TABLE `evolutions` (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`experiment` integer NOT NULL,
	`agent` integer NOT NULL,
	`system` text NOT NULL,
	FOREIGN KEY (`experiment`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evolutions_idx_experiment_agent_created` ON `evolutions` (`experiment`,`agent`,`created`);--> statement-breakpoint
ALTER TABLE `agents` DROP COLUMN `system`;