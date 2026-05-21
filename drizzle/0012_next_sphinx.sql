ALTER TABLE `researchConfig` ADD `documentType` varchar(50) DEFAULT 'resume' NOT NULL;--> statement-breakpoint
ALTER TABLE `researchConfig` ADD `documentFileName` varchar(255);--> statement-breakpoint
ALTER TABLE `researchConfig` ADD `lastDocumentParsed` json;