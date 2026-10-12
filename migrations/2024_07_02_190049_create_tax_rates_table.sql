create table `tax_rates` (`id` bigint unsigned not null auto_increment primary key, `name` varchar(255) not null, `rate` decimal(5, 2) not null, `country` varchar(255) not null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `tax_rates` add unique `tax_rates_country_unique`(`country`);
