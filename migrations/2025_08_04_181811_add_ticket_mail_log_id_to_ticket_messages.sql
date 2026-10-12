alter table `ticket_messages` add `ticket_mail_log_id` bigint unsigned null after `message`;
alter table `ticket_messages` add constraint `ticket_messages_ticket_mail_log_id_foreign` foreign key (`ticket_mail_log_id`) references `ticket_mail_logs` (`id`) on delete cascade;
