alter table `invoice_transactions` add `refunded_amount` decimal(17, 2) not null default '0' after `amount`;
