SET smartstay.allow_synthetic_demo = 'YES_I_AM_USING_A_DISPOSABLE_DEMO_OR_STAGING_PROJECT';
-- Explicitly opt-in synthetic tenant fixture. Never run against a live customer workspace.
-- Apply db/migrations/20260925_housekeeping_readiness.sql first.
-- In the same SQL session, first run:
--   SET smartstay.allow_synthetic_demo = 'YES_I_AM_USING_A_DISPOSABLE_DEMO_OR_STAGING_PROJECT';
-- This seed creates only the KAKHETI-SYNTH-40 tenant. It does not attach real Auth users.
begin;
do $$
begin
  if current_setting('smartstay.allow_synthetic_demo', true)
       is distinct from 'YES_I_AM_USING_A_DISPOSABLE_DEMO_OR_STAGING_PROJECT' then
    raise exception 'synthetic seed blocked: explicitly set smartstay.allow_synthetic_demo in this SQL session';
  end if;
end $$;

insert into platform.spaces (id, property_code, name, region, timezone, lifecycle)
values ('e25b4000-0000-4000-8000-000000000001', 'KAKHETI-SYNTH-40',
        'SYNTHETIC DEMO · Kakheti Boutique Hotel (40 rooms)', 'Kakheti', 'Asia/Tbilisi', 'ACTIVE')
on conflict (property_code) do update
  set name = excluded.name, region = excluded.region, timezone = excluded.timezone, lifecycle = 'ACTIVE'
  where platform.spaces.id = excluded.id;

insert into platform.staff (space_id, id, display_name, role, user_id, enabled) values
  ('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000002','Maka · seasonal attendant','ROOM_ATTENDANT',null,true),
  ('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000003','Ana · housekeeping supervisor','HOUSEKEEPING_SUPERVISOR',null,true),
  ('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000004','Tamar · experienced attendant','ROOM_ATTENDANT',null,true),
  ('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000005','Levan · front desk lead','FRONT_DESK_LEAD',null,true)
on conflict (space_id,id) do nothing;

insert into ops.rooms (space_id,id,number,room_type,floor,cleaning_state)
select 'e25b4000-0000-4000-8000-000000000001',
       md5('smartstay-kakheti-synth-room-' || n)::uuid,
       lpad(n::text,2,'0'),
       case when n % 4 = 0 then 'Twin' else 'Double' end,
       'Floor ' || ((n - 1) / 10 + 1)::text,
       case when n = 12 then 'DIRTY' else 'CLEAN' end
from generate_series(1,40) as g(n)
on conflict (space_id,number) do nothing;

insert into kb.documents (space_id,id,doc_key,title,kind,folder,version,state,approved_by,approved_at,valid_during)
values ('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000006',
        'housekeeping-turnover','Housekeeping Turnover SOP','SOP','Housekeeping',3,'APPROVED_ACTIVE',
        'Ana · synthetic demo supervisor',now(),tstzrange(now() - interval '1 day',null,'[)'))
on conflict (space_id,doc_key,version) do update
  set title=excluded.title,kind='SOP',folder='Housekeeping',state='APPROVED_ACTIVE',
      approved_by=excluded.approved_by,approved_at=excluded.approved_at,valid_during=excluded.valid_during;

insert into kb.chunks (space_id,id,document_id,ordinal,content,structured) values
('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000011','e25b4000-0000-4000-8000-000000000006',1,
 'ოთახში შესვლამდე სამჯერ დააკაკუნეთ, თქვით „Housekeeping“ და დაელოდეთ პასუხს. გადაამოწმეთ, რომ მომსახურება ნებადართულია. თუ კარზე „არ შემაწუხოთ“ ნიშანია ან სტუმარი ითხოვს შეჩერებას, შეჩერდით და აცნობეთ ზედამხედველს.',
 '{"topic":"შესვლა და სტუმრის კონფიდენციალურობა","language":"ka"}'),
('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000012','e25b4000-0000-4000-8000-000000000006',2,
 'შეამოწმეთ საწოლი და თეთრეული, პირსახოცები, სააბაზანო, ნაგვის ურნები და საჭირო ინვენტარი. გამოიყენეთ ოთახისთვის განსაზღვრული დასუფთავების საშუალებები და მიჰყევით მათ ეტიკეტზე მითითებულ უსაფრთხოების წესებს. თუ ნივთი აკლია ან დაზიანებულია, აცნობეთ ზედამხედველს.',
 '{"topic":"ოთახის შემოწმების სია","language":"ka"}'),
('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000013','e25b4000-0000-4000-8000-000000000006',3,
 'თუ სტუმრის პირადი ნივთი დარჩენილია, არ შეეხოთ და არ გადაადგილოთ. შეაჩერეთ შესაბამისი სამუშაო, დააფიქსირეთ შემთხვევა სამუშაო ჟურნალში და დაუყოვნებლივ აცნობეთ ზედამხედველს.',
 '{"topic":"დარჩენილი პირადი ნივთები","language":"ka"}'),
('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000014','e25b4000-0000-4000-8000-000000000006',4,
 'დასუფთავების შემდეგ გადაამოწმეთ ოთახის სია და აცნობეთ ზედამხედველს. ოთახი მზად არ არის, სანამ ზედამხედველი არ შეამოწმებს და არ გაათავისუფლებს. ოთახის CLEAN/ready სტატუსს მხოლოდ უფლებამოსილი ზედამხედველი ცვლის.',
 '{"topic":"შემოწმება და ოთახის გათავისუფლება","language":"ka"}')
on conflict (space_id,id) do update set document_id=excluded.document_id,ordinal=excluded.ordinal,
  content=excluded.content,structured=excluded.structured;

insert into ops.sop_quiz_questions
(space_id,sop_document_id,sop_version,question_key,ordinal,prompt,choices,correct_choice,active)
values
('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000006',3,
 'personal_item',1,'რა უნდა გააკეთოთ, თუ ოთახში სტუმრის პირადი ნივთი დარჩა?',
 '{"a":"არ შევეხო; შევაჩერო შესაბამისი სამუშაო, ჩავწერო შემთხვევა და ვაცნობო ზედამხედველს","b":"ნივთი დავმალო, რომ ოთახი დროულად მოვამზადო","c":"ნივთი გადავიტანო სხვა ოთახში"}','a',true),
('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000006',3,
 'room_release',2,'ვინ ამოწმებს და ათავისუფლებს ოთახს ready სტატუსისთვის?',
 '{"a":"ოთახის დამლაგებელი, დასუფთავების დასრულებისთანავე","b":"მორიგე სტუმარი","c":"უფლებამოსილი ზედამხედველი, ოთახის შემოწმების შემდეგ"}','c',true)
on conflict (space_id,sop_document_id,sop_version,question_key) do update
  set ordinal=excluded.ordinal,prompt=excluded.prompt,choices=excluded.choices,correct_choice=excluded.correct_choice,active=true;

-- Synthetic demand: nine departures and eight same-day arrivals, all clearly confined to this property.
do $$
declare d date := (now() at time zone 'Asia/Tbilisi')::date; i integer; profile_id uuid; room_id uuid;
        departure_names text[] := array['ნინო მაისურაძე','გიორგი ბერიძე','მარიამ ჯაფარიძე','ლევან კაპანაძე','თამარ გელაშვილი','ანა ლომიძე','დავით ქავთარაძე','ეკა აბაშიძე','სანდრო მელაძე'];
        arrival_names text[] := array['ელენე ცინცაძე','ირაკლი კობახიძე','სალომე ბაქრაძე','ნიკა ჩხეიძე','თეა ჭანტურია','ლაშა მიქაძე','ქეთევან ბერიძე','გიგა წიკლაური'];
begin
  for i in 1..9 loop
    profile_id := md5('smartstay-kakheti-synth-departure-profile-' || i)::uuid;
    room_id := md5('smartstay-kakheti-synth-room-' || (11+i))::uuid;
    insert into guest_crm.profiles (space_id,id,full_name,locale,provisional)
    values ('e25b4000-0000-4000-8000-000000000001',profile_id,departure_names[i],'ka',false)
    on conflict (space_id,id) do nothing;
    insert into guest_crm.stays (space_id,id,profile_id,room_id,arrival_date,departure_date,status,source)
    values ('e25b4000-0000-4000-8000-000000000001',md5('smartstay-kakheti-synth-departure-stay-'||i)::uuid,
            profile_id,room_id,d-1,d,'DEPARTED','synthetic-demo')
    on conflict (space_id,id) do nothing;
  end loop;
  for i in 1..8 loop
    profile_id := md5('smartstay-kakheti-synth-arrival-profile-' || i)::uuid;
    room_id := md5('smartstay-kakheti-synth-room-' || (11+i))::uuid;
    insert into guest_crm.profiles (space_id,id,full_name,locale,provisional)
    values ('e25b4000-0000-4000-8000-000000000001',profile_id,arrival_names[i],'ka',false)
    on conflict (space_id,id) do nothing;
    insert into guest_crm.stays (space_id,id,profile_id,room_id,arrival_date,departure_date,status,source)
    values ('e25b4000-0000-4000-8000-000000000001',md5('smartstay-kakheti-synth-arrival-stay-'||i)::uuid,
            profile_id,room_id,d,d+1,'BOOKED','synthetic-demo')
    on conflict (space_id,id) do nothing;
  end loop;
end $$;

insert into ops.tasks (space_id,id,category,title,detail,room_id,priority,status,assignee_id,due_at,
                       required_sop_document_id,required_sop_version,arrival_deadline_at)
values ('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000007',
        'housekeeping','Turn over Room 12 before guest arrival',
        'SYNTHETIC DEMO · 40-room Kakheti hotel · 9 departures / 8 arrivals today. Follow the approved Georgian SOP; supervisor must inspect and release the room.',
        md5('smartstay-kakheti-synth-room-12')::uuid,'URGENT','QUEUED',null,
        (((now() at time zone 'Asia/Tbilisi')::date + time '14:00') at time zone 'Asia/Tbilisi'),
        'e25b4000-0000-4000-8000-000000000006',3,
        (((now() at time zone 'Asia/Tbilisi')::date + time '14:00') at time zone 'Asia/Tbilisi'))
on conflict (space_id,id) do nothing;

-- Maka starts explicitly NOT_TRAINED; Tamar is already approved for SOP v3.
insert into ops.staff_competencies (space_id,id,staff_id,sop_document_id,sop_version,status,quiz_attempts)
values ('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000020',
        'e25b4000-0000-4000-8000-000000000002','e25b4000-0000-4000-8000-000000000006',3,'NOT_TRAINED',0)
on conflict (space_id,staff_id,sop_document_id,sop_version) do nothing;

insert into ops.staff_competencies
(space_id,id,staff_id,sop_document_id,sop_version,status,quiz_score,quiz_attempts,quiz_completed_at,
 supervised_at,supervised_by_staff_id,practical_approved_at,approved_by_staff_id)
values ('e25b4000-0000-4000-8000-000000000001','e25b4000-0000-4000-8000-000000000021',
        'e25b4000-0000-4000-8000-000000000004','e25b4000-0000-4000-8000-000000000006',3,
        'PRACTICALLY_APPROVED',100,1,now(),now(),
        'e25b4000-0000-4000-8000-000000000003',now(),
        'e25b4000-0000-4000-8000-000000000003')
on conflict (space_id,staff_id,sop_document_id,sop_version) do nothing;

commit;

-- Demo login setup (use disposable Supabase Auth accounts only):
-- UPDATE platform.staff SET user_id = '<Maka auth UUID>' WHERE id = 'e25b4000-0000-4000-8000-000000000002';
-- UPDATE platform.staff SET user_id = '<Ana auth UUID>'  WHERE id = 'e25b4000-0000-4000-8000-000000000003';
-- UPDATE platform.staff SET user_id = '<Tamar auth UUID>' WHERE id = 'e25b4000-0000-4000-8000-000000000004';
