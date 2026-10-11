create table `users` (`id` bigint unsigned not null auto_increment primary key, `first_name` varchar(255) null, `last_name` varchar(255) null, `email` varchar(255) not null, `role_id` bigint unsigned null, `email_verified_at` timestamp null, `password` varchar(255) not null, `tfa_secret` text null, `remember_token` varchar(100) null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `users` add unique `users_email_unique`(`email`);
alter table `users` add index `users_role_id_index`(`role_id`);
create table `password_reset_tokens` (`email` varchar(255) not null, `token` varchar(255) not null, `created_at` timestamp null, primary key (`email`)) default character set {{charset}} collate {{collation}};
create table `sessions` (`id` varchar(255) not null, `user_id` bigint unsigned null, `ip_address` varchar(45) null, `user_agent` text null, `payload` longtext not null, `last_activity` int not null, primary key (`id`)) default character set {{charset}} collate {{collation}};
alter table `sessions` add index `sessions_user_id_index`(`user_id`);
alter table `sessions` add index `sessions_last_activity_index`(`last_activity`);
