create table `billing_agreements` (`id` bigint unsigned not null auto_increment primary key, `ulid` char(26) not null, `user_id` bigint unsigned not null, `gateway_id` bigint unsigned not null, `name` varchar(255) not null, `type` varchar(255) null, `expiry` date null, `external_reference` varchar(255) not null, `deleted_at` timestamp null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `billing_agreements` add constraint `billing_agreements_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete cascade;
alter table `billing_agreements` add constraint `billing_agreements_gateway_id_foreign` foreign key (`gateway_id`) references `extensions` (`id`) on delete cascade;
alter table `billing_agreements` add unique `billing_agreements_ulid_unique`(`ulid`);
alter table `billing_agreements` add unique `billing_agreements_external_reference_unique`(`external_reference`);
