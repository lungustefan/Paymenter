create table `config_options` (`id` bigint unsigned not null auto_increment primary key, `name` varchar(255) not null, `env_variable` varchar(255) null, `type` varchar(255) null, `sort` tinyint unsigned null, `hidden` tinyint(1) not null default '0', `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `config_options` add `parent_id` bigint unsigned null;
alter table `config_options` add constraint `config_options_parent_id_foreign` foreign key (`parent_id`) references `config_options` (`id`) on delete cascade;
