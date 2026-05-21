CREATE TABLE `researchConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`targetRoles` text NOT NULL DEFAULT ('Enterprise Account Manager,Account Executive,Sales Manager'),
	`targetCategories` text NOT NULL DEFAULT ('SaaS,Revenue Intelligence,Sales Enablement'),
	`rolesPerDay` int NOT NULL DEFAULT 30,
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `researchConfig_id` PRIMARY KEY(`id`)
);
