CREATE TABLE `tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`agent` integer NOT NULL,
	`message` integer NOT NULL,
	`count` integer NOT NULL,
	`input` integer NOT NULL,
	`output` integer NOT NULL,
	`cached` integer,
	`thinking` integer,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
