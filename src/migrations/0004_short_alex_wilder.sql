DROP TABLE publications;--> statement-breakpoint
CREATE TABLE publications (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`experiment` integer NOT NULL,
	`author` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`reference` text NOT NULL,
	FOREIGN KEY (`experiment`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `publications_experiment_reference_unique` ON `publications` (`experiment`,`reference`);
