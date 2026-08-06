CREATE TABLE `room_invites` (
	`code` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`expires_at` integer,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `room_members` (
	`room_id` text NOT NULL,
	`account_id` text NOT NULL,
	`joined_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	PRIMARY KEY(`room_id`, `account_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `banned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `burns_at` integer;--> statement-breakpoint
CREATE INDEX `idx_messages_burns_at` ON `messages` (`burns_at`);