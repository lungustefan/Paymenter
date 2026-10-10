alter table `invoice_transactions` drop foreign key `invoice_transactions_gateway_id_foreign`;
alter table `invoice_transactions` add constraint `invoice_transactions_gateway_id_foreign` foreign key (`gateway_id`) references `extensions` (`id`) on delete set null;
