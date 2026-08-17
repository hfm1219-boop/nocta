-- El proyecto nació con migraciones aplicadas desde SQL Editor. Se normaliza el historial para CLI.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations(version,name,statements) values
('202608150001','identity_rbac',array[]::text[]),('202608150002','access_administration',array[]::text[]),
('202608150003','nightlife_operations',array[]::text[]),('202608150004','seed_nocta_catalog',array[]::text[]),
('202608150005','customer_transactions',array[]::text[]),('202608150006','integrity_audit',array[]::text[]),
('202608150007','auth_and_ticket_integrity',array[]::text[]),('202608150008','ticket_validation',array[]::text[]),
('202608150009','reservation_integrity',array[]::text[]),('202608150010','customer_ticket_wallet',array[]::text[]),
('202608150011','guest_lists_integrity',array[]::text[]),('202608150012','promoter_commercial_events',array[]::text[]),
('202608150013','conecta_multidevice',array[]::text[]),('202608150014','conecta_locations',array[]::text[]),
('202608150015','collaboration_decisions',array[]::text[]),('202608150016','loyalty',array[]::text[]),
('202608150017','loyalty_hardening',array[]::text[]),('202608150018','prototype_missions',array[]::text[]),
('202608150019','organization_context_rbac',array[]::text[]),('202608150020','consumer_discovery',array[]::text[]),
('202608150021','establishment_management',array[]::text[]),('202608150022','promoter_management',array[]::text[]),
('202608150023','brand_distributor_management',array[]::text[]),('202608150024','role_flow_integrity',array[]::text[]),
('202608150025','shared_collaborations',array[]::text[]),('202608150026','night_operations_backend',array[]::text[]),
('202608150027','economic_transactions',array[]::text[]),('202608150028','organization_access_removal',array[]::text[]),
('202608160029','demo_promotion',array[]::text[]),('202608160030','ticket_digest_hotfix',array[]::text[]),
('202608160031','digest_integrity_audit',array[]::text[]),('202608160032','consumer_mutation_integrity',array[]::text[]),
('202608160033','consumer_profile',array[]::text[]),('202608160034','loyalty_benefit_catalog',array[]::text[]),
('202608160035','consumer_role_administration',array[]::text[]),('202608160036','prevent_false_success_mutations',array[]::text[]),
('202608160037','promotion_engine_core',array[]::text[]),('202608160038','promotion_engine_hardening',array[]::text[]),
('202608160039','promotion_rpc_signature',array[]::text[]),('202608160040','bootstrap_migration_history',array[]::text[])
on conflict(version)do update set name=excluded.name;
alter table supabase_migrations.schema_migrations enable row level security;
