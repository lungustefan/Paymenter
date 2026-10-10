create table `oauth_auth_codes` (`id` varchar(100) not null, `user_id` bigint unsigned not null, `client_id` uuid not null, `scopes` text null, `revoked` tinyint(1) not null, `expires_at` datetime null, primary key (`id`)) default character set {{charset}} collate {{collation}};
alter table `oauth_auth_codes` add index `oauth_auth_codes_user_id_index`(`user_id`);
