alter table `coupons` add `applies_to` varchar(255) not null default 'all' after `type`;
update `coupons` set `applies_to` = 'setup_fee', `type` = 'percentage', `value` = 100, `updated_at` = now() where `type` = 'free_setup';
