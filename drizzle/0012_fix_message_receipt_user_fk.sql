DROP TABLE IF EXISTS `message_receipt_deliveries`;--> statement-breakpoint
DROP TABLE IF EXISTS `message_receipts`;--> statement-breakpoint
CREATE TABLE `message_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_name` text NOT NULL,
	`request_body` text NOT NULL,
	`status` text NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `message_receipts_user_id_idx` ON `message_receipts` (`user_id`);--> statement-breakpoint
CREATE INDEX `message_receipts_source_type_idx` ON `message_receipts` (`source_type`);--> statement-breakpoint
CREATE INDEX `message_receipts_source_id_idx` ON `message_receipts` (`source_id`);--> statement-breakpoint
CREATE INDEX `message_receipts_created_at_idx` ON `message_receipts` (`created_at`);--> statement-breakpoint
CREATE TABLE `message_receipt_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text DEFAULT 'endpoint' NOT NULL,
	`target_id` text NOT NULL,
	`target_name` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text NOT NULL,
	`channel_type` text NOT NULL,
	`status` text NOT NULL,
	`rendered_message` text NOT NULL,
	`final_payload` text NOT NULL,
	`response_summary` text,
	`error_message` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `message_receipts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `message_receipt_deliveries_receipt_id_idx` ON `message_receipt_deliveries` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `message_receipt_deliveries_user_id_idx` ON `message_receipt_deliveries` (`user_id`);--> statement-breakpoint
CREATE INDEX `message_receipt_deliveries_target_id_idx` ON `message_receipt_deliveries` (`target_id`);--> statement-breakpoint
CREATE INDEX `message_receipt_deliveries_created_at_idx` ON `message_receipt_deliveries` (`created_at`);
