create table `roles` (`id` bigint unsigned not null auto_increment primary key, `name` varchar(255) not null, `permissions` json null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `roles` add unique `roles_name_unique`(`name`);
