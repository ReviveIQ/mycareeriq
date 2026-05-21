CREATE TABLE `userProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`resumeKey` varchar(512),
	`resumeText` text,
	`targetRoles` text,
	`targetIndustries` text,
	`onboardingComplete` boolean DEFAULT false,
	`pipelineGenerated` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `userProfiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `companies` DROP INDEX `companies_companyId_unique`;--> statement-breakpoint
ALTER TABLE `applications` ADD `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `userId` int NOT NULL;