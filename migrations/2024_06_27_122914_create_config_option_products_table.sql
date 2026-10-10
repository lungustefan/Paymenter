create table `config_option_products` (`id` bigint unsigned not null auto_increment primary key, `config_option_id` bigint unsigned not null, `product_id` bigint unsigned not null) default character set {{charset}} collate {{collation}};
alter table `config_option_products` add constraint `config_option_products_config_option_id_foreign` foreign key (`config_option_id`) references `config_options` (`id`) on delete cascade;
alter table `config_option_products` add constraint `config_option_products_product_id_foreign` foreign key (`product_id`) references `products` (`id`) on delete cascade;
