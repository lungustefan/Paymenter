alter table `service_configs` drop foreign key `service_configs_config_value_id_foreign`;
alter table `service_configs` add constraint `service_configs_config_value_id_foreign` foreign key (`config_value_id`) references `config_options` (`id`) on delete cascade;
