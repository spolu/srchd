CREATE TABLE `messages` (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`experiment` integer NOT NULL,
	`agent` integer NOT NULL,
	`position` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`experiment`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_experiment_agent_position_unique` ON `messages` (`experiment`,`agent`,`position`);--> statement-breakpoint
DROP TABLE `memories`;--> statement-breakpoint
ALTER TABLE `publications` ADD `abstract` text NOT NULL;