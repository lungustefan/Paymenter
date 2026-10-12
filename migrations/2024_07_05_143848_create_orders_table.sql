create table `orders` (`id` bigint unsigned not null auto_increment primary key, `user_id` bigint unsigned not null, `currency_code` varchar(3) not null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `orders` add constraint `orders_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete cascade;
