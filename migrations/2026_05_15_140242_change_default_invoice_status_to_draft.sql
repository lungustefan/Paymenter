alter table `invoices` modify `status` varchar(255) not null default 'draft';
alter table `invoices` add `cancellation_reason` varchar(255) null default null after `status`;
alter table `invoices` drop foreign key `invoices_user_id_foreign`;
alter table `invoices` modify `user_id` bigint unsigned null;
alter table `invoices` add constraint `invoices_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete set null;
