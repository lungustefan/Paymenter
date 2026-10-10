alter table `invoice_transactions` add `status` varchar(255) not null default 'succeeded' after `transaction_id`;
