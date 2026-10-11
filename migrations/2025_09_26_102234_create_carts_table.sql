create table `carts` (`id` bigint unsigned not null auto_increment primary key, `ulid` char(26) not null, `user_id` bigint unsigned null, `coupon_id` bigint unsigned null, `currency_code` varchar(3) not null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `carts` add constraint `carts_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete cascade;
alter table `carts` add constraint `carts_coupon_id_foreign` foreign key (`coupon_id`) references `coupons` (`id`) on delete set null;
alter table `carts` add unique `carts_ulid_unique`(`ulid`);
