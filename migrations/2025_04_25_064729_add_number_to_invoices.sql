alter table `invoices` add `number` varchar(255) null after `id`;
alter table `invoices` add unique `invoices_number_unique`(`number`);
UPDATE invoices SET number = id;
alter table `invoices` modify `number` varchar(255) not null;
update `settings` set `value` = (select coalesce(max(`id`), 0) from `invoices`), `updated_at` = now() where `key` = 'invoice_number';
insert into `settings` (`key`, `value`, `updated_at`, `created_at`) select 'invoice_number', coalesce(max(`id`), 0), now(), now() from `invoices` where not exists (select 1 from (select `id` from `settings` where `key` = 'invoice_number') as `s`);
