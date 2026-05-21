CREATE TABLE `jobResearchMonitoring` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`targetRoles` text NOT NULL,
	`targetCategories` text NOT NULL,
	`rolesPerDay` int NOT NULL,
	`jobsResearched` int NOT NULL,
	`jobsAdded` int NOT NULL,
	`topJobTitles` text,
	`success` boolean NOT NULL,
	`errorMessage` text,
	`executionTimeMs` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `jobResearchMonitoring_id` PRIMARY KEY(`id`)
);
