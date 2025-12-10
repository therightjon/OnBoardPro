-- Phase 5 sample data seeding for LOO / Start split

-- Candidate types (ensure Faculty exists)
INSERT INTO candidate_types (id, name, created_at, updated_at)
VALUES
  ('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f01', 'Faculty', now(), now())
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    updated_at = now();

-- Departments & category scaffolding
INSERT INTO departments (id, name, archived, created_at, updated_at)
VALUES
  ('0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d01', 'Office of Faculty Affairs', false, now(), now())
ON CONFLICT (name) DO UPDATE
SET updated_at = now();

INSERT INTO task_categories (id, name, created_at, updated_at)
VALUES
  ('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01', 'Onboarding', now(), now())
ON CONFLICT (name) DO UPDATE
SET updated_at = now();

INSERT INTO task_priorities (id, name, created_at, updated_at)
VALUES
  ('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01', 'medium', now(), now())
ON CONFLICT (name) DO UPDATE
SET updated_at = now();

-- Stage library covering pre-hire and onboarding phases
INSERT INTO hiring_stages (id, name, description, order_index, is_active, phase, created_at, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Offer Administration', 'Pre-hire offer tasks', 1, true, 'pre_hire', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'Preboarding', 'Collect onboarding requirements', 2, true, 'pre_hire', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'Orientation Prep', 'Onboarding welcome tasks', 3, true, 'onboarding', now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'First Week', 'Initial onboarding follow up', 4, true, 'onboarding', now(), now())
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    order_index = EXCLUDED.order_index,
    is_active = true,
    phase = EXCLUDED.phase,
    updated_at = now();

-- Task definitions referenced by the sample template
INSERT INTO task_definitions (id, name, description, archived, created_at, updated_at)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Collect Signed LOO', 'Obtain signed letter of offer', false, now(), now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Preboard Paperwork', 'Collect required documents before start', false, now(), now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'IT Provisioning', 'Set up laptop and accounts', false, now(), now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'First Day Orientation', 'Welcome session tasks', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    archived = false,
    updated_at = now();

-- Example template mixing LOO and Start due rules
INSERT INTO templates (id, name, candidate_type_id, description, is_active, archived, created_by, created_at, updated_at)
VALUES
  ('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', 'Faculty Offer & Onboarding', '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f01', 'Demonstrates LOO vs Start anchors', true, false, NULL, now(), now())
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    candidate_type_id = EXCLUDED.candidate_type_id,
    is_active = EXCLUDED.is_active,
    archived = false,
    updated_at = now();

INSERT INTO template_stages (id, template_id, stage_id, order_index, is_active, created_at, updated_at)
VALUES
  ('66666666-6666-4666-8666-666666666666', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', '11111111-1111-4111-8111-111111111111', 1, true, now(), now()),
  ('77777777-7777-4777-8777-777777777777', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', '33333333-3333-4333-8333-333333333333', 2, true, now(), now())
ON CONFLICT (id) DO UPDATE
SET order_index = EXCLUDED.order_index,
    is_active = true,
    updated_at = now();

INSERT INTO template_tasks (
  id,
  template_id,
  task_def_id,
  stage_id,
  due_rule_type,
  due_rule_value,
  fixed_date,
  default_assignee_kind,
  default_assignee_user_id,
  default_assignee_role,
  default_priority_id,
  default_category_id,
  is_required,
  archived,
  created_by,
  created_at,
  updated_at
) VALUES
  ('88888888-8888-4888-8888-888888888881', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '11111111-1111-4111-8111-111111111111', 'on_loo_date', NULL, NULL, 'user', NULL, NULL,
   '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01', true, false, NULL, now(), now()),
  ('88888888-8888-4888-8888-888888888882', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   '11111111-1111-4111-8111-111111111111', 'days_after_loo', 2, NULL, 'user', NULL, NULL,
   '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01', true, false, NULL, now(), now()),
  ('88888888-8888-4888-8888-888888888883', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
   '33333333-3333-4333-8333-333333333333', 'days_before_start', 5, NULL, 'user', NULL, NULL,
   '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01', true, false, NULL, now(), now()),
  ('88888888-8888-4888-8888-888888888884', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
   '33333333-3333-4333-8333-333333333333', 'days_after_start', 1, NULL, 'user', NULL, NULL,
   '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01', true, false, NULL, now(), now())
ON CONFLICT (id) DO UPDATE
SET due_rule_type = EXCLUDED.due_rule_type,
    due_rule_value = EXCLUDED.due_rule_value,
    fixed_date = EXCLUDED.fixed_date,
    default_category_id = EXCLUDED.default_category_id,
    archived = false,
    updated_at = now();

-- Sample candidates showing various anchor states
INSERT INTO candidates (
  id, salutation, first_name, last_name, email,
  candidate_type_id, department_id, division_id,
  offer_letter_issued_at, offer_letter_accepted_at, anticipated_start_date,
  status, template_applied_from_id, template_applied_at, template_locked,
  created_at, updated_at
) VALUES
  ('99999999-0000-4000-8000-000000000001', 'Dr.', 'Alice', 'PendingAccept', 'alice.accept@example.edu',
   '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f01', '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d01', NULL,
   now() - interval '7 days', NULL, NULL,
   'active', NULL, NULL, false, now(), now()),
  ('99999999-0000-4000-8000-000000000002', 'Dr.', 'Ben', 'AwaitingStart', 'ben.start@example.edu',
   '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f01', '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d01', NULL,
   now() - interval '10 days', now() - interval '5 days', NULL,
   'active', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', now() - interval '4 days', true, now(), now()),
  ('99999999-0000-4000-8000-000000000003', 'Dr.', 'Cara', 'StartsSoon', 'cara.soon@example.edu',
   '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f01', '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d01', NULL,
   now() - interval '12 days', now() - interval '9 days', now() + interval '14 days',
   'active', NULL, NULL, false, now(), now())
ON CONFLICT (id) DO UPDATE
SET offer_letter_issued_at = EXCLUDED.offer_letter_issued_at,
    offer_letter_accepted_at = EXCLUDED.offer_letter_accepted_at,
    anticipated_start_date = EXCLUDED.anticipated_start_date,
    status = EXCLUDED.status,
    template_applied_from_id = EXCLUDED.template_applied_from_id,
    template_applied_at = EXCLUDED.template_applied_at,
    template_locked = EXCLUDED.template_locked,
    updated_at = now();

-- Snapshot template stages for Ben (awaiting start)
INSERT INTO candidate_template_stages (id, candidate_id, stage_id, stage_name_snapshot, order_index, created_at, updated_at)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '99999999-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Offer Administration', 1, now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '99999999-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'Orientation Prep', 2, now(), now())
ON CONFLICT (candidate_id, stage_id) DO UPDATE
SET stage_name_snapshot = EXCLUDED.stage_name_snapshot,
    order_index = EXCLUDED.order_index,
    updated_at = now();

-- Candidate tasks demonstrating LOO-based due dates and pending anchors
INSERT INTO candidate_tasks (
  id, candidate_id, task_def_id, title, description,
  stage_id, assignee_kind, assignee_user_id, assignee_role, assignee_resolved_at,
  priority, category_id, due_at, due_rule_type, due_rule_value, fixed_date,
  pending_anchor, status, required, archived, stage_order_index,
  created_at, updated_at
) VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', '99999999-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'Collect Signed LOO', 'Obtain signed letter of offer', '11111111-1111-4111-8111-111111111111',
   'user', NULL, NULL, NULL, 'medium', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01',
   (SELECT offer_letter_accepted_at FROM candidates WHERE id = '99999999-0000-4000-8000-000000000002'),
   'on_loo_date', NULL, NULL, false, 'todo', true, false, 1, now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', '99999999-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   'Preboard Paperwork', 'Collect required documents before start', '11111111-1111-4111-8111-111111111111',
   'user', NULL, NULL, NULL, 'medium', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01',
   (SELECT offer_letter_accepted_at + interval '2 days' FROM candidates WHERE id = '99999999-0000-4000-8000-000000000002'),
   'days_after_loo', 2, NULL, false, 'todo', true, false, 1, now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc03', '99999999-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
   'IT Provisioning', 'Set up laptop and accounts', '33333333-3333-4333-8333-333333333333',
   'user', NULL, NULL, NULL, 'medium', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01',
   NULL, 'days_before_start', 5, NULL, true, 'todo', true, false, 2, now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc04', '99999999-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
   'First Day Orientation', 'Welcome session tasks', '33333333-3333-4333-8333-333333333333',
   'user', NULL, NULL, NULL, 'medium', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c01',
   NULL, 'days_after_start', 1, NULL, true, 'todo', true, false, 2, now(), now())
ON CONFLICT (id) DO UPDATE
SET due_at = EXCLUDED.due_at,
    pending_anchor = EXCLUDED.pending_anchor,
    status = EXCLUDED.status,
    updated_at = now();
