create table `user_sessions` (`id` bigint unsigned not null auto_increment primary key, `ulid` char(26) not null, `user_id` bigint unsigned not null, `ip_address` varchar(45) null, `user_agent` varchar(512) null, `last_activity` timestamp not null, `expires_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `user_sessions` add constraint `user_sessions_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete cascade;
alter table `user_sessions` add unique `user_sessions_ulid_unique`(`ulid`);
