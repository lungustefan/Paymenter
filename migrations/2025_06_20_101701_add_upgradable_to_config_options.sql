alter table `config_options` add `upgradable` tinyint(1) not null default '0' after `hidden`;
