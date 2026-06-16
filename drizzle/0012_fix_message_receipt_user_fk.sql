PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message_receipts` (
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
);
--> statement-breakpoint
INSERT INTO `__new_message_receipts`("id", "user_id", "source_type", "source_id", "source_name", "request_body", "status", "success_count", "failed_count", "created_at") SELECT "id", "user_id", "source_type", "source_id", "source_name", "request_body", "status", "success_count", "failed_count", "created_at" FROM `message_receipts`;--> statement-breakpoint
DROP TABLE `message_receipts`;--> statement-breakpoint
ALTER TABLE `__new_message_receipts` RENAME TO `message_receipts`;--> statement-breakpoint
CREATE INDEX `message_receipts_user_id_idx` ON `message_receipts` (`user_id`);--> statement-breakpoint
CREATE INDEX `message_receipts_source_type_idx` ON `message_receipts` (`source_type`);--> statement-breakpoint
CREATE INDEX `message_receipts_source_id_idx` ON `message_receipts` (`source_id`);--> statement-breakpoint
CREATE INDEX `message_receipts_created_at_idx` ON `message_receipts` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_message_receipt_deliveries` (
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
);
--> statement-breakpoint
INSERT INTO `__new_message_receipt_deliveries`("id", "receipt_id", "user_id", "target_type", "target_id", "target_name", "channel_id", "channel_name", "channel_type", "status", "rendered_message", "final_payload", "response_summary", "error_message", "created_at") SELECT "id", "receipt_id", "user_id", "target_type", "target_id", "target_name", "channel_id", "channel_name", "channel_type", "status", "rendered_message", "final_payload", "response_summary", "error_message", "created_at" FROM `message_receipt_deliveries`;--> statement-breakpoint
DROP TABLE `message_receipt_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_message_receipt_deliveries` RENAME TO `message_receipt_deliveries`;--> statement-breakpoint
CREATE INDEX `message_receipt_deliveries_receipt_id_idx` ON `message_receipt_deliveries` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `message_receipt_deliveries_user_id_idx` ON `message_receipt_deliveries` (`user_id`);--> statement-breakpoint
CREATE INDEX `message_receipt_deliveries_target_id_idx` ON `message_receipt_deliveries` (`target_id`);--> statement-breakpoint
CREATE INDEX `message_receipt_deliveries_created_at_idx` ON `message_receipt_deliveries` (`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
