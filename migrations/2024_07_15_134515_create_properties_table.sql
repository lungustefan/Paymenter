create table `properties` (`id` bigint unsigned not null auto_increment primary key, `custom_property_id` bigint unsigned null, `name` varchar(255) null, `key` varchar(255) not null, `value` text not null, `model_type` varchar(255) not null, `model_id` bigint unsigned not null, `created_at` timestamp null, `updated_at` timestamp null) default character set {{charset}} collate {{collation}};
alter table `properties` add constraint `properties_custom_property_id_foreign` foreign key (`custom_property_id`) references `custom_properties` (`id`) on delete cascade;
alter table `properties` add unique `properties_key_model_id_model_type_unique`(`key`, `model_id`, `model_type`);
alter table `properties` add index `properties_model_type_model_id_index`(`model_type`, `model_id`);
