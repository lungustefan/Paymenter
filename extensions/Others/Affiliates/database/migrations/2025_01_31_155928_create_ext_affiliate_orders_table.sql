create table `ext_affiliate_orders` (`id` bigint unsigned not null auto_increment primary key, `affiliate_id` bigint unsigned not null, `order_id` bigint unsigned not null) default character set {{charset}} collate {{collation}};
alter table `ext_affiliate_orders` add constraint `ext_affiliate_orders_affiliate_id_foreign` foreign key (`affiliate_id`) references `ext_affiliates` (`id`) on delete cascade;
alter table `ext_affiliate_orders` add constraint `ext_affiliate_orders_order_id_foreign` foreign key (`order_id`) references `orders` (`id`) on delete cascade;
alter table `ext_affiliate_orders` add unique `ext_affiliate_orders_order_id_unique`(`order_id`);
