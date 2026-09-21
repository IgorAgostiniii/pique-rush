CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`blue` text NOT NULL,
	`red` text,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
