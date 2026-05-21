CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`stripeCustomerId` varchar(255),
	`stripeSubscriptionId` varchar(255),
	`plan` enum('free','pro','enterprise') NOT NULL DEFAULT 'free',
	`status` enum('active','past_due','canceled','unpaid') NOT NULL DEFAULT 'active',
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`canceledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_workspaceId_unique` UNIQUE(`workspaceId`)
);
--> statement-breakpoint
CREATE TABLE `workspaceInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('manager','member') NOT NULL DEFAULT 'member',
	`token` varchar(255) NOT NULL,
	`invitedBy` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspaceInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspaceInvitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `workspaceMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','manager','member') NOT NULL DEFAULT 'member',
	`invitedBy` int,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`status` enum('active','invited','inactive') NOT NULL DEFAULT 'active',
	CONSTRAINT `workspaceMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaceSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`rolesPerDay` int NOT NULL DEFAULT 30,
	`targetRoles` text,
	`categories` text,
	`remoteOnly` boolean NOT NULL DEFAULT false,
	`usHiringOnly` boolean NOT NULL DEFAULT true,
	`emailNotifications` boolean NOT NULL DEFAULT true,
	`dailyDigest` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaceSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspaceSettings_workspaceId_unique` UNIQUE(`workspaceId`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`ownerId` int NOT NULL,
	`plan` enum('free','pro','enterprise') NOT NULL DEFAULT 'free',
	`status` enum('active','suspended','deleted') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspaces_slug_unique` UNIQUE(`slug`)
);
