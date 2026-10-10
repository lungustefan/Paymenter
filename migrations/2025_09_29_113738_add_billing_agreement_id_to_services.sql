alter table `services` add `billing_agreement_id` bigint unsigned null;
alter table `services` add constraint `services_billing_agreement_id_foreign` foreign key (`billing_agreement_id`) references `billing_agreements` (`id`) on delete set null;
