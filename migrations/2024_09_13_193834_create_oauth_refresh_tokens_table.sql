create table `oauth_refresh_tokens` (`id` varchar(100) not null, `access_token_id` varchar(100) not null, `revoked` tinyint(1) not null, `expires_at` datetime null, primary key (`id`)) default character set {{charset}} collate {{collation}};
alter table `oauth_refresh_tokens` add index `oauth_refresh_tokens_access_token_id_index`(`access_token_id`);
