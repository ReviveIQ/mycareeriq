ALTER TABLE `applications` MODIFY COLUMN `companyId` varchar(255) DEFAULT '';--> statement-breakpoint
ALTER TABLE `applications` MODIFY COLUMN `contactEmail` varchar(320) DEFAULT '';--> statement-breakpoint
ALTER TABLE `applications` MODIFY COLUMN `sentToHiringManager` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `applications` MODIFY COLUMN `sentToUser` boolean DEFAULT false;