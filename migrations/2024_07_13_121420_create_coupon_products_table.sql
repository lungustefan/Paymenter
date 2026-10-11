create table `coupon_products` (`id` bigint unsigned not null auto_increment primary key, `coupon_id` bigint unsigned not null, `product_id` bigint unsigned not null) default character set {{charset}} collate {{collation}};
alter table `coupon_products` add constraint `coupon_products_coupon_id_foreign` foreign key (`coupon_id`) references `coupons` (`id`) on delete cascade;
alter table `coupon_products` add constraint `coupon_products_product_id_foreign` foreign key (`product_id`) references `products` (`id`) on delete cascade;
