create table `categories` (`id` bigint unsigned not null auto_increment primary key, `slug` varchar(255) not null, `name` varchar(255) not null, `description` text null, `image` varchar(255) null, `parent_id` bigint unsigned null, `full_slug` text null, `sort` tinyint unsigned null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `categories` add constraint `categories_parent_id_foreign` foreign key (`parent_id`) references `categories` (`id`);
alter table `categories` add unique `categories_slug_unique`(`slug`);
