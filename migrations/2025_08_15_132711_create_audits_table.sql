drop table if exists `audits`;
create table `audits` (`id` bigint unsigned not null auto_increment primary key, `user_type` varchar(255) null, `user_id` bigint unsigned null, `event` varchar(255) not null, `auditable_type` varchar(255) not null, `auditable_id` bigint unsigned not null, `old_values` text null, `new_values` text null, `url` text null, `ip_address` varchar(45) null, `user_agent` varchar(1023) null, `tags` varchar(255) null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `audits` add index `audits_auditable_type_auditable_id_index`(`auditable_type`, `auditable_id`);
alter table `audits` add index `audits_user_id_user_type_index`(`user_id`, `user_type`);
