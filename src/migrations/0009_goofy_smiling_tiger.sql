CREATE TABLE `token_usages` (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`experiment` integer NOT NULL,
	`agent` integer NOT NULL,
	`message` integer NOT NULL,
	`total` integer NOT NULL,
	`input` integer NOT NULL,
	`output` integer NOT NULL,
	`cached` integer NOT NULL,
	`thinking` integer NOT NULL,
	FOREIGN KEY (`experiment`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `token_usages_idx_experiment_agent` ON `token_usages` (`experiment`,`agent`);