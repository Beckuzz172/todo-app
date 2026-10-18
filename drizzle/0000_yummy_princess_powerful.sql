CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "cards_status_check" CHECK("cards"."status" IN ('todo', 'doing', 'done')),
	CONSTRAINT "cards_priority_check" CHECK("cards"."priority" IN ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE INDEX `cards_board_created_idx` ON `cards` (`board_id`,`created_at`);