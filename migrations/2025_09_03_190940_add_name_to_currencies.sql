alter table `currencies` add `name` varchar(255) null after `code`;
update `currencies` set `name` = `code`;
alter table `currencies` modify `name` varchar(255) not null;
