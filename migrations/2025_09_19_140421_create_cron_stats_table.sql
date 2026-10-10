create table `cron_stats` (`id` bigint unsigned not null auto_increment primary key, `key` varchar(255) not null, `value` int not null default '0', `date` date not null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `cron_stats` add index `cron_stats_date_index`(`date`);
