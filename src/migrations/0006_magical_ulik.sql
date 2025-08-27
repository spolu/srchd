CREATE TABLE `solutions` (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`experiment` integer NOT NULL,
	`publication` integer,
	`agent` integer NOT NULL,
	`reason` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`experiment`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`publication`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `solutions_idx_experiment_agent_created` ON `solutions` (`experiment`,`agent`,`created`);