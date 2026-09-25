SET smartstay.allow_synthetic_demo = 'YES_I_AM_USING_A_DISPOSABLE_DEMO_OR_STAGING_PROJECT';
-- Reset ONLY the synthetic KAKHETI-SYNTH-40 tenant, including training progress.
-- In the same SQL session, first run:
--   SET smartstay.allow_synthetic_demo = 'YES_I_AM_USING_A_DISPOSABLE_DEMO_OR_STAGING_PROJECT';
begin;
do $$
begin
  if current_setting('smartstay.allow_synthetic_demo', true)
       is distinct from 'YES_I_AM_USING_A_DISPOSABLE_DEMO_OR_STAGING_PROJECT' then
    raise exception 'synthetic reset blocked: explicitly set smartstay.allow_synthetic_demo in this SQL session';
  end if;
end $$;

delete from ops.training_events where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from ops.staff_competencies where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from ops.sop_quiz_questions where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from ops.attestations where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from ops.tasks where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from ops.room_events where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from guest_crm.stays where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from guest_crm.identities where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from guest_crm.preferences where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from guest_crm.link_tokens where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from guest_crm.profiles where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from kb.chunks where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from kb.documents where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from ops.rooms where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from platform.staff where space_id =
  (select id from platform.spaces where property_code = 'KAKHETI-SYNTH-40');
delete from platform.spaces where property_code = 'KAKHETI-SYNTH-40';
commit;

