--
-- PostgreSQL database dump
--

\restrict yRciw9tMv26fN12Z1wJP6r0XnQ6Ic8ObJVIixR95ZrIN19Uio1eZHRZn7MjBJvN

-- Dumped from database version 17.6 (Debian 17.6-1.pgdg13+1)
-- Dumped by pg_dump version 17.6 (Debian 17.6-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.app_role AS ENUM (
    'system_admin',
    'hr_staff',
    'department_admin',
    'division_leader',
    'manager',
    'candidate'
);


ALTER TYPE public.app_role OWNER TO db_user;

--
-- Name: candidate_status; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.candidate_status AS ENUM (
    'draft',
    'active',
    'on_hold',
    'completed',
    'canceled',
    'archived'
);


ALTER TYPE public.candidate_status OWNER TO db_user;

--
-- Name: comment_entity; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.comment_entity AS ENUM (
    'candidate',
    'task'
);


ALTER TYPE public.comment_entity OWNER TO db_user;

--
-- Name: comment_visibility; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.comment_visibility AS ENUM (
    'internal',
    'external'
);


ALTER TYPE public.comment_visibility OWNER TO db_user;

--
-- Name: due_rule_type; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.due_rule_type AS ENUM (
    'days_before_start',
    'on_start_date',
    'days_after_start',
    'days_before_stage',
    'days_after_stage',
    'fixed_date'
);


ALTER TYPE public.due_rule_type OWNER TO db_user;

--
-- Name: notification_entity; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.notification_entity AS ENUM (
    'candidate',
    'task',
    'comment'
);


ALTER TYPE public.notification_entity OWNER TO db_user;

--
-- Name: priority; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


ALTER TYPE public.priority OWNER TO db_user;

--
-- Name: role; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.role AS ENUM (
    'system_admin',
    'hr_staff',
    'department_admin',
    'division_leader',
    'manager',
    'candidate'
);


ALTER TYPE public.role OWNER TO db_user;

--
-- Name: salutation_type; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.salutation_type AS ENUM (
    'Mr.',
    'Ms.',
    'Mrs.',
    'Dr.',
    'Prof.',
    'Other',
    'Mx.'
);


ALTER TYPE public.salutation_type OWNER TO db_user;

--
-- Name: task_status; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.task_status AS ENUM (
    'todo',
    'in_progress',
    'blocked',
    'done',
    'canceled'
);


ALTER TYPE public.task_status OWNER TO db_user;

--
-- Name: user_status; Type: TYPE; Schema: public; Owner: db_user
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'invited',
    'disabled'
);


ALTER TYPE public.user_status OWNER TO db_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    candidate_id uuid,
    task_id uuid,
    event_type text NOT NULL,
    details jsonb
);


ALTER TABLE public.audit_log OWNER TO db_user;

--
-- Name: auth_providers; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.auth_providers (
    id text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.auth_providers OWNER TO db_user;

--
-- Name: candidate_followers; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.candidate_followers (
    candidate_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.candidate_followers OWNER TO db_user;

--
-- Name: candidate_stage_history; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.candidate_stage_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    from_stage_id uuid,
    to_stage_id uuid NOT NULL,
    changed_at timestamp without time zone DEFAULT now() NOT NULL,
    changed_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.candidate_stage_history OWNER TO db_user;

--
-- Name: candidate_tasks; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.candidate_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    task_def_id uuid,
    title text NOT NULL,
    description text,
    stage_id uuid NOT NULL,
    assignee_id uuid,
    priority public.priority NOT NULL,
    category_id uuid NOT NULL,
    due_at timestamp without time zone,
    status public.task_status DEFAULT 'todo'::public.task_status NOT NULL,
    completed_at timestamp without time zone,
    notes text,
    required boolean DEFAULT true NOT NULL,
    deleted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    updated_by uuid,
    created_by uuid,
    stage_order_index integer,
    cancel_reason text
);


ALTER TABLE public.candidate_tasks OWNER TO db_user;

--
-- Name: candidate_template_stages; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.candidate_template_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    stage_name_snapshot text NOT NULL,
    order_index integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.candidate_template_stages OWNER TO db_user;

--
-- Name: candidate_types; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.candidate_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.candidate_types OWNER TO db_user;

--
-- Name: candidates; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    candidate_type_id uuid NOT NULL,
    department_id uuid NOT NULL,
    division_id uuid,
    manager_id uuid,
    start_date date NOT NULL,
    status public.candidate_status DEFAULT 'active'::public.candidate_status NOT NULL,
    template_applied_from_id uuid,
    template_applied_at timestamp without time zone,
    template_locked boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    created_by uuid,
    faculty_rank_id uuid,
    salutation public.salutation_type DEFAULT 'Mr.'::public.salutation_type NOT NULL,
    current_stage_id uuid,
    template_name_snapshot text,
    template_version integer DEFAULT 1,
    archived boolean DEFAULT false NOT NULL,
    archived_at timestamp without time zone,
    archived_by uuid,
    is_blocked_by_prior_stage boolean DEFAULT false NOT NULL,
    blocker_summary jsonb,
    primary_owner_id uuid
);


ALTER TABLE public.candidates OWNER TO db_user;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type public.comment_entity NOT NULL,
    entity_id uuid NOT NULL,
    author_user_id uuid NOT NULL,
    body text NOT NULL,
    visibility public.comment_visibility NOT NULL,
    parent_id uuid,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comments OWNER TO db_user;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    created_by uuid
);


ALTER TABLE public.departments OWNER TO db_user;

--
-- Name: divisions; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid NOT NULL,
    name text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    created_by uuid
);


ALTER TABLE public.divisions OWNER TO db_user;

--
-- Name: faculty_ranks; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.faculty_ranks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.faculty_ranks OWNER TO db_user;

--
-- Name: hiring_stages; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.hiring_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    order_index integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.hiring_stages OWNER TO db_user;

--
-- Name: invitations; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    username public.citext NOT NULL,
    roles text[] NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    department_id uuid,
    division_id uuid,
    first_name text,
    last_name text,
    CONSTRAINT invitations_email_has_at CHECK ((POSITION(('@'::text) IN (email)) > 1))
);


ALTER TABLE public.invitations OWNER TO db_user;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    entity_type public.notification_entity NOT NULL,
    entity_id uuid NOT NULL,
    payload jsonb NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_channels text[] DEFAULT '{}'::text[] NOT NULL
);


ALTER TABLE public.notifications OWNER TO db_user;

--
-- Name: session; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO db_user;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.system_settings OWNER TO db_user;

--
-- Name: task_categories; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.task_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.task_categories OWNER TO db_user;

--
-- Name: task_definitions; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.task_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid
);


ALTER TABLE public.task_definitions OWNER TO db_user;

--
-- Name: task_priorities; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.task_priorities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name public.priority NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.task_priorities OWNER TO db_user;

--
-- Name: template_stages; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.template_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.template_stages OWNER TO db_user;

--
-- Name: template_tasks; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.template_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    task_def_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    due_rule_type public.due_rule_type NOT NULL,
    due_rule_value integer,
    fixed_date date,
    default_assignee_id uuid,
    default_category_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    created_by uuid,
    archived boolean DEFAULT false NOT NULL,
    default_priority_id uuid,
    is_required boolean DEFAULT true NOT NULL
);


ALTER TABLE public.template_tasks OWNER TO db_user;

--
-- Name: templates; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    candidate_type_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    created_by uuid,
    description text
);


ALTER TABLE public.templates OWNER TO db_user;

--
-- Name: user_identities; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.user_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    external_id text NOT NULL,
    email text,
    username text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_identities OWNER TO db_user;

--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    mytasks_show_archived boolean DEFAULT false NOT NULL,
    mytasks_show_canceled boolean DEFAULT false NOT NULL,
    mytasks_show_completed boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    notify_in_app boolean DEFAULT true NOT NULL,
    notify_email boolean DEFAULT false NOT NULL,
    digest_frequency text DEFAULT 'immediate'::text NOT NULL,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    event_subscriptions jsonb DEFAULT '{}'::jsonb NOT NULL,
    allow_self_notifications boolean DEFAULT false NOT NULL,
    CONSTRAINT user_preferences_digest_frequency_check CHECK ((digest_frequency = ANY (ARRAY['immediate'::text, 'hourly'::text, 'daily'::text])))
);


ALTER TABLE public.user_preferences OWNER TO db_user;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_roles OWNER TO db_user;

--
-- Name: users; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text,
    role public.role NOT NULL,
    department_id uuid,
    division_id uuid,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    status public.user_status DEFAULT 'active'::public.user_status NOT NULL,
    last_login_at timestamp without time zone,
    first_name text NOT NULL,
    last_name text NOT NULL,
    auth_provider text DEFAULT 'local'::text NOT NULL,
    external_id text,
    username text,
    email_verified boolean DEFAULT false NOT NULL,
    mention_key text NOT NULL
);


ALTER TABLE public.users OWNER TO db_user;

--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.audit_log (id, occurred_at, actor_id, candidate_id, task_id, event_type, details) FROM stdin;
\.


--
-- Data for Name: auth_providers; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.auth_providers (id, name, enabled, created_at, updated_at) FROM stdin;
local	Local Authentication	t	2025-09-04 17:25:11.533636	2025-09-04 17:30:28.998
ldap	LDAP/Active Directory	f	2025-09-04 17:25:11.533636	2025-09-04 17:25:11.533636
google	Google OAuth	f	2025-09-04 17:25:11.533636	2025-09-04 20:18:18.321
azuread	Microsoft Azure AD	f	2025-09-04 17:25:11.533636	2025-09-04 17:25:11.533636
\.


--
-- Data for Name: candidate_followers; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.candidate_followers (candidate_id, user_id, created_at) FROM stdin;
\.


--
-- Data for Name: candidate_stage_history; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.candidate_stage_history (id, candidate_id, from_stage_id, to_stage_id, changed_at, changed_by, created_at, updated_at) FROM stdin;
454dce75-2052-4e7d-a54d-2083b611976a	586cf9d0-a4cc-4f5d-8b01-698b870f7711	\N	ab77705b-d002-4e52-bae8-03e245e25382	2025-09-09 15:09:40.338	917566dd-00a2-42fc-9289-e08cb465671a	2025-09-09 15:09:40.338	2025-09-09 15:09:40.338
5a7bde2a-c22c-48ee-bfd0-473494e57066	586cf9d0-a4cc-4f5d-8b01-698b870f7711	ab77705b-d002-4e52-bae8-03e245e25382	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	2025-09-10 18:45:27.244	917566dd-00a2-42fc-9289-e08cb465671a	2025-09-10 18:45:27.244	2025-09-10 18:45:27.244
678ae868-259f-4f22-b7fc-f4156e6fa6b6	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	\N	ab77705b-d002-4e52-bae8-03e245e25382	2025-09-12 14:23:11.822	917566dd-00a2-42fc-9289-e08cb465671a	2025-09-12 14:23:11.822	2025-09-12 14:23:11.822
28424ac5-60c6-4cfe-b51d-8126eb2dac2f	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	ab77705b-d002-4e52-bae8-03e245e25382	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	2025-09-12 14:36:21.333	917566dd-00a2-42fc-9289-e08cb465671a	2025-09-12 14:36:21.333	2025-09-12 14:36:21.333
2a583d62-7804-4e22-a06e-ad63aacc082c	d358dcf9-dffb-41ab-ac37-6ee0445864f9	\N	ab77705b-d002-4e52-bae8-03e245e25382	2025-09-12 14:48:55.499	917566dd-00a2-42fc-9289-e08cb465671a	2025-09-12 14:48:55.499	2025-09-12 14:48:55.499
48de32af-e0bf-44c4-b352-170952573367	3fa5ba00-0e23-4d3f-affc-78dea68c2941	\N	ab77705b-d002-4e52-bae8-03e245e25382	2025-09-18 20:33:56.143	917566dd-00a2-42fc-9289-e08cb465671a	2025-09-18 20:33:56.143	2025-09-18 20:33:56.143
34104070-bfe6-4f7b-87f7-4a27bef522e3	3fa5ba00-0e23-4d3f-affc-78dea68c2941	ab77705b-d002-4e52-bae8-03e245e25382	59598f0a-dcec-4870-a952-9f5e9193c980	2025-09-19 19:34:22.922	a3a5e666-8d8f-47e3-90a9-45b45240210c	2025-09-19 19:34:22.922	2025-09-19 19:34:22.922
1c98ea8b-619d-484e-afc0-3e9a3677af13	f898022e-2ead-4226-8d26-60e7ba374da5	\N	ab77705b-d002-4e52-bae8-03e245e25382	2025-09-19 19:35:12.776	a3a5e666-8d8f-47e3-90a9-45b45240210c	2025-09-19 19:35:12.776	2025-09-19 19:35:12.776
\.


--
-- Data for Name: candidate_tasks; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.candidate_tasks (id, candidate_id, task_def_id, title, description, stage_id, assignee_id, priority, category_id, due_at, status, completed_at, notes, required, deleted_at, created_at, updated_at, archived, updated_by, created_by, stage_order_index, cancel_reason) FROM stdin;
f8830b2d-8102-4c5f-99ad-0c94f3ea5e44	586cf9d0-a4cc-4f5d-8b01-698b870f7711	a6ba6c04-ef01-46d1-a06f-00b17237eebe	Manager Introduction	Arrange a meeting between the employee and their direct manager.	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	medium	02b90821-03af-476c-b7cd-c8b2045c187e	2025-09-14 00:00:00	todo	\N	\N	t	\N	2025-09-09 15:09:40.329712	2025-09-09 15:09:40.329712	f	\N	\N	2	\N
3c854aee-7e16-4d25-941c-2f4234534118	586cf9d0-a4cc-4f5d-8b01-698b870f7711	df660657-335f-40a9-9fa6-6a5c38d84033	Payroll Setup	Set up payroll, direct deposit, and tax withholding information.	9c576b6f-713a-44df-896e-49be24dc9ae0	6fbfab6d-3f67-492f-b93d-bd3d393c6601	medium	59a00206-2d17-4f31-bbd9-ef1f11a0def8	2025-09-16 00:00:00	todo	\N	\N	t	\N	2025-09-09 15:09:40.329712	2025-09-09 15:09:40.329712	f	\N	\N	5	\N
47f5d3fe-ad67-4127-be2b-fe3cf973929d	586cf9d0-a4cc-4f5d-8b01-698b870f7711	63823e18-144e-4160-9898-a2368dfc04f0	Order ID Badge	Order and prepare employee identification badge	7c54a7eb-f41d-4197-8bc7-65288cc53d10	\N	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-16 00:00:00	todo	\N	\N	t	\N	2025-09-09 15:09:40.329712	2025-09-09 15:09:40.329712	f	\N	\N	3	\N
4585a582-3b1d-40f4-86eb-4280a637f6bf	586cf9d0-a4cc-4f5d-8b01-698b870f7711	0d993b13-770f-4de8-817a-1ca5f0b3df4e	Review Employee Handbook	Provide handbook and obtain signed acknowledgment from employee.	6a6e6664-dc3a-43ce-9966-f9e824aceb40	b496adce-a0f8-43e1-a267-da8cfe336254	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-12 00:00:00	todo	\N	\N	t	\N	2025-09-09 15:09:40.329712	2025-09-09 15:09:40.329712	f	\N	\N	4	\N
c1488a86-50af-435f-84a8-0140022e475d	586cf9d0-a4cc-4f5d-8b01-698b870f7711	f81c3e49-f4b8-410f-a5b9-5bd1744a89f9	Setup Email Account	Create email account and provide login credentials to new employee	9c576b6f-713a-44df-896e-49be24dc9ae0	f9430ceb-a299-41b0-bba5-17cf074689ed	medium	9939b6d7-33f9-4427-925b-2ab3babf9031	2025-09-12 00:00:00	todo	\N	\N	t	\N	2025-09-09 15:09:40.329712	2025-09-09 15:09:40.329712	f	\N	\N	5	\N
e0d211ca-b1d2-4811-b0bf-716165f65df6	586cf9d0-a4cc-4f5d-8b01-698b870f7711	e48aaaff-ae46-4c28-b836-8a776e5e5035	Orientation Session	Schedule and conduct orientation session for new employees.	9c576b6f-713a-44df-896e-49be24dc9ae0	7f189688-7e40-43c0-82c3-31b3edc79c95	high	9939b6d7-33f9-4427-925b-2ab3babf9031	2025-09-13 00:00:00	todo	\N	\N	t	\N	2025-09-09 15:09:40.329712	2025-09-09 15:09:40.329712	f	\N	\N	5	\N
11188091-0ad0-4503-abce-01d9cbec5740	586cf9d0-a4cc-4f5d-8b01-698b870f7711	9fc86560-dc53-4cb6-86cb-5549e20382f4	Collect I-9 Documents	Collect and verify I-9 employment eligibility documents	ab77705b-d002-4e52-bae8-03e245e25382	6fbfab6d-3f67-492f-b93d-bd3d393c6601	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-12 00:00:00	done	2025-09-10 18:45:23.862	\N	t	\N	2025-09-09 15:09:40.329712	2025-09-10 18:45:23.863	f	\N	\N	1	\N
176461f4-ed94-4286-bf44-cce695f2394e	586cf9d0-a4cc-4f5d-8b01-698b870f7711	17e7e6cd-3d0e-481f-8f89-224caace3976	Enroll in Benefits	Guide employee through benefits enrollment (health, retirement, etc.).	ab77705b-d002-4e52-bae8-03e245e25382	917566dd-00a2-42fc-9289-e08cb465671a	medium	c5c30581-126a-477a-a3da-c376e4ed864d	2025-09-13 00:00:00	done	2025-09-10 18:45:27.222	\N	t	\N	2025-09-09 15:09:40.329712	2025-09-10 18:45:27.222	f	\N	\N	1	\N
354e2fc5-1b33-4593-a7e5-710962da12a1	d358dcf9-dffb-41ab-ac37-6ee0445864f9	17e7e6cd-3d0e-481f-8f89-224caace3976	Enroll in Benefits	Guide employee through benefits enrollment (health, retirement, etc.).	ab77705b-d002-4e52-bae8-03e245e25382	917566dd-00a2-42fc-9289-e08cb465671a	medium	c5c30581-126a-477a-a3da-c376e4ed864d	2025-09-21 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:48:55.490511	2025-09-12 16:55:01.562	f	\N	\N	1	\N
a2dca8a4-45ad-498d-b58e-819ab794e0ef	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	a6ba6c04-ef01-46d1-a06f-00b17237eebe	Manager Introduction	Arrange a meeting between the employee and their direct manager.	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	medium	02b90821-03af-476c-b7cd-c8b2045c187e	2025-09-17 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:23:11.808091	2025-09-12 14:23:11.808091	f	\N	\N	2	\N
51c0ff04-5f3c-4043-a8c8-79cb9799fd9d	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	df660657-335f-40a9-9fa6-6a5c38d84033	Payroll Setup	Set up payroll, direct deposit, and tax withholding information.	9c576b6f-713a-44df-896e-49be24dc9ae0	6fbfab6d-3f67-492f-b93d-bd3d393c6601	medium	59a00206-2d17-4f31-bbd9-ef1f11a0def8	2025-09-19 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:23:11.808091	2025-09-12 14:23:11.808091	f	\N	\N	5	\N
612a665c-9150-42c9-a237-28fc478dc26d	d358dcf9-dffb-41ab-ac37-6ee0445864f9	a6ba6c04-ef01-46d1-a06f-00b17237eebe	Manager Introduction	Arrange a meeting between the employee and their direct manager.	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	medium	02b90821-03af-476c-b7cd-c8b2045c187e	2025-09-19 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:48:55.490511	2025-09-12 16:55:01.562	f	\N	\N	2	\N
ed05a2ba-d685-4d45-812f-2c4c314e2b1f	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	63823e18-144e-4160-9898-a2368dfc04f0	Order ID Badge	Order and prepare employee identification badge	7c54a7eb-f41d-4197-8bc7-65288cc53d10	b496adce-a0f8-43e1-a267-da8cfe336254	medium	c5c30581-126a-477a-a3da-c376e4ed864d	2025-09-19 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:23:11.808091	2025-09-12 14:23:11.808091	f	\N	\N	3	\N
eacf3216-88ee-492d-add0-57f16d844663	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	0d993b13-770f-4de8-817a-1ca5f0b3df4e	Review Employee Handbook	Provide handbook and obtain signed acknowledgment from employee.	6a6e6664-dc3a-43ce-9966-f9e824aceb40	b496adce-a0f8-43e1-a267-da8cfe336254	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-18 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:23:11.808091	2025-09-12 14:23:11.808091	f	\N	\N	4	\N
922fef22-1700-4d7d-93dc-8b11d5f97eb1	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	f81c3e49-f4b8-410f-a5b9-5bd1744a89f9	Setup Email Account	Create email account and provide login credentials to new employee	9c576b6f-713a-44df-896e-49be24dc9ae0	f9430ceb-a299-41b0-bba5-17cf074689ed	medium	9939b6d7-33f9-4427-925b-2ab3babf9031	2025-09-15 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:23:11.808091	2025-09-12 14:23:11.808091	f	\N	\N	5	\N
8c8ddf63-0012-42a1-8371-567e96909f52	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	e48aaaff-ae46-4c28-b836-8a776e5e5035	Orientation Session	Schedule and conduct orientation session for new employees.	9c576b6f-713a-44df-896e-49be24dc9ae0	7f189688-7e40-43c0-82c3-31b3edc79c95	high	9939b6d7-33f9-4427-925b-2ab3babf9031	2025-09-16 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:23:11.808091	2025-09-12 14:23:11.808091	f	\N	\N	5	\N
3bbb3e86-2a02-494b-a345-50a9f2944b48	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	9fc86560-dc53-4cb6-86cb-5549e20382f4	Collect I-9 Documents	Collect and verify I-9 employment eligibility documents	ab77705b-d002-4e52-bae8-03e245e25382	6fbfab6d-3f67-492f-b93d-bd3d393c6601	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-15 00:00:00	done	2025-09-12 14:36:18.535	\N	t	\N	2025-09-12 14:23:11.808091	2025-09-12 14:36:18.535	f	\N	\N	1	\N
1884cdc2-415f-4e56-a983-f26ee0def12f	d358dcf9-dffb-41ab-ac37-6ee0445864f9	df660657-335f-40a9-9fa6-6a5c38d84033	Payroll Setup	Set up payroll, direct deposit, and tax withholding information.	9c576b6f-713a-44df-896e-49be24dc9ae0	6fbfab6d-3f67-492f-b93d-bd3d393c6601	medium	59a00206-2d17-4f31-bbd9-ef1f11a0def8	2025-09-21 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:48:55.490511	2025-09-12 16:55:01.562	f	\N	\N	5	\N
fef4247d-9b10-42fa-a3e1-6735b1e95619	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	17e7e6cd-3d0e-481f-8f89-224caace3976	Enroll in Benefits	Guide employee through benefits enrollment (health, retirement, etc.).	ab77705b-d002-4e52-bae8-03e245e25382	917566dd-00a2-42fc-9289-e08cb465671a	medium	c5c30581-126a-477a-a3da-c376e4ed864d	2025-09-19 00:00:00	done	2025-09-12 14:36:21.31	\N	t	\N	2025-09-12 14:23:11.808091	2025-09-12 14:36:21.311	f	\N	\N	1	\N
82be3dbc-27a8-4644-a340-c05491983a5e	3fa5ba00-0e23-4d3f-affc-78dea68c2941	9fc86560-dc53-4cb6-86cb-5549e20382f4	Collect I-9 Documents	Collect and verify I-9 employment eligibility documents	ab77705b-d002-4e52-bae8-03e245e25382	a3a5e666-8d8f-47e3-90a9-45b45240210c	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-20 00:00:00	done	2025-09-19 19:34:22.895	\N	t	\N	2025-09-18 20:33:56.132456	2025-09-19 19:34:22.895	f	\N	\N	1	\N
5721bdbf-8428-465f-8b6a-7e0970469938	f898022e-2ead-4226-8d26-60e7ba374da5	9fc86560-dc53-4cb6-86cb-5549e20382f4	Collect I-9 Documents	Collect and verify I-9 employment eligibility documents	ab77705b-d002-4e52-bae8-03e245e25382	a3a5e666-8d8f-47e3-90a9-45b45240210c	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-21 00:00:00	todo	\N	\N	t	\N	2025-09-19 19:35:12.764065	2025-09-19 19:35:12.764065	f	\N	\N	1	\N
5d63d106-e94b-4b95-b1c3-f17a7fb758a6	f898022e-2ead-4226-8d26-60e7ba374da5	17e7e6cd-3d0e-481f-8f89-224caace3976	Enroll in Benefits	Guide employee through benefits enrollment (health, retirement, etc.).	59598f0a-dcec-4870-a952-9f5e9193c980	a3a5e666-8d8f-47e3-90a9-45b45240210c	medium	c5c30581-126a-477a-a3da-c376e4ed864d	2025-09-20 00:00:00	todo	\N	\N	t	\N	2025-09-19 19:35:12.764065	2025-09-19 19:35:12.764065	f	\N	\N	2	\N
2a36ed48-338b-408a-b625-d0ca06693d2c	f898022e-2ead-4226-8d26-60e7ba374da5	a6ba6c04-ef01-46d1-a06f-00b17237eebe	Manager Introduction	Arrange a meeting between the employee and their direct manager.	9c576b6f-713a-44df-896e-49be24dc9ae0	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	medium	02b90821-03af-476c-b7cd-c8b2045c187e	2025-09-20 00:00:00	todo	\N	\N	t	\N	2025-09-19 19:35:12.764065	2025-09-19 19:35:12.764065	f	\N	\N	3	\N
7b2f509e-887f-48cb-8757-5f5335cce730	d358dcf9-dffb-41ab-ac37-6ee0445864f9	9fc86560-dc53-4cb6-86cb-5549e20382f4	Collect I-9 Documents	Collect and verify I-9 employment eligibility documents	ab77705b-d002-4e52-bae8-03e245e25382	6fbfab6d-3f67-492f-b93d-bd3d393c6601	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-17 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:48:55.490511	2025-09-12 16:55:01.562	f	\N	\N	1	\N
81c4f8f6-c887-4262-8a7a-3d27e2ac4fee	d358dcf9-dffb-41ab-ac37-6ee0445864f9	63823e18-144e-4160-9898-a2368dfc04f0	Order ID Badge	Order and prepare employee identification badge	7c54a7eb-f41d-4197-8bc7-65288cc53d10	b496adce-a0f8-43e1-a267-da8cfe336254	medium	c5c30581-126a-477a-a3da-c376e4ed864d	2025-09-21 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:48:55.490511	2025-09-12 16:55:01.562	f	\N	\N	3	\N
4192125b-bd11-41d8-b3bd-d3bea763c8bf	d358dcf9-dffb-41ab-ac37-6ee0445864f9	0d993b13-770f-4de8-817a-1ca5f0b3df4e	Review Employee Handbook	Provide handbook and obtain signed acknowledgment from employee.	6a6e6664-dc3a-43ce-9966-f9e824aceb40	b496adce-a0f8-43e1-a267-da8cfe336254	medium	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-20 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:48:55.490511	2025-09-12 16:55:01.562	f	\N	\N	4	\N
313f30db-766f-4e54-a44b-acfd12abaf3b	d358dcf9-dffb-41ab-ac37-6ee0445864f9	f81c3e49-f4b8-410f-a5b9-5bd1744a89f9	Setup Email Account	Create email account and provide login credentials to new employee	9c576b6f-713a-44df-896e-49be24dc9ae0	f9430ceb-a299-41b0-bba5-17cf074689ed	medium	9939b6d7-33f9-4427-925b-2ab3babf9031	2025-09-17 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:48:55.490511	2025-09-12 16:55:01.562	f	\N	\N	5	\N
191c568f-cd8b-455f-8ae5-6f18309b3884	d358dcf9-dffb-41ab-ac37-6ee0445864f9	e48aaaff-ae46-4c28-b836-8a776e5e5035	Orientation Session	Schedule and conduct orientation session for new employees.	9c576b6f-713a-44df-896e-49be24dc9ae0	7f189688-7e40-43c0-82c3-31b3edc79c95	high	9939b6d7-33f9-4427-925b-2ab3babf9031	2025-09-18 00:00:00	todo	\N	\N	t	\N	2025-09-12 14:48:55.490511	2025-09-12 16:55:01.562	f	\N	\N	5	\N
4dbc9e5c-ca66-4514-bad1-a4f1e122f4ae	3fa5ba00-0e23-4d3f-affc-78dea68c2941	17e7e6cd-3d0e-481f-8f89-224caace3976	Enroll in Benefits	Guide employee through benefits enrollment (health, retirement, etc.).	59598f0a-dcec-4870-a952-9f5e9193c980	a3a5e666-8d8f-47e3-90a9-45b45240210c	medium	c5c30581-126a-477a-a3da-c376e4ed864d	2025-09-19 00:00:00	todo	\N	\N	t	\N	2025-09-18 20:33:56.132456	2025-09-18 20:33:56.132456	f	\N	\N	2	\N
0ac1698c-93bb-4011-b62e-9d73a2a913d6	3fa5ba00-0e23-4d3f-affc-78dea68c2941	a6ba6c04-ef01-46d1-a06f-00b17237eebe	Manager Introduction	Arrange a meeting between the employee and their direct manager.	9c576b6f-713a-44df-896e-49be24dc9ae0	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	medium	02b90821-03af-476c-b7cd-c8b2045c187e	2025-09-19 00:00:00	todo	\N	\N	t	\N	2025-09-18 20:33:56.132456	2025-09-18 20:33:56.132456	f	\N	\N	3	\N
\.


--
-- Data for Name: candidate_template_stages; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.candidate_template_stages (id, candidate_id, stage_id, stage_name_snapshot, order_index, created_at, updated_at) FROM stdin;
76aac2b4-4c93-449e-b91e-a8f6044821bd	586cf9d0-a4cc-4f5d-8b01-698b870f7711	ab77705b-d002-4e52-bae8-03e245e25382	Letter Of Intent	1	2025-09-09 15:09:40.333035	2025-09-09 15:09:40.333035
b2b0a331-dd3c-4289-8e65-a572fd4f6ddc	586cf9d0-a4cc-4f5d-8b01-698b870f7711	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	Background Check	2	2025-09-09 15:09:40.333035	2025-09-09 15:09:40.333035
1123656e-2a19-48bd-9a71-8f3825a138a9	586cf9d0-a4cc-4f5d-8b01-698b870f7711	7c54a7eb-f41d-4197-8bc7-65288cc53d10	Credentialing	3	2025-09-09 15:09:40.333035	2025-09-09 15:09:40.333035
d8ee9c3d-f036-489a-a175-bcc8aa0d5fc5	586cf9d0-a4cc-4f5d-8b01-698b870f7711	6a6e6664-dc3a-43ce-9966-f9e824aceb40	Offer	4	2025-09-09 15:09:40.333035	2025-09-09 15:09:40.333035
04b7bbfb-ec1d-4360-b1f8-05e0b8d54bb6	586cf9d0-a4cc-4f5d-8b01-698b870f7711	9c576b6f-713a-44df-896e-49be24dc9ae0	Onboarding	5	2025-09-09 15:09:40.333035	2025-09-09 15:09:40.333035
59a77ca5-495e-4e3b-a06c-34681b67d781	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	ab77705b-d002-4e52-bae8-03e245e25382	Letter Of Intent	1	2025-09-12 14:23:11.813601	2025-09-12 14:23:11.813601
4f4b22e1-3da4-40d8-8b74-d1e872d5817d	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	Background Check	2	2025-09-12 14:23:11.813601	2025-09-12 14:23:11.813601
5d0fb6e2-e951-457b-9671-14db23092e87	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	7c54a7eb-f41d-4197-8bc7-65288cc53d10	Credentialing	3	2025-09-12 14:23:11.813601	2025-09-12 14:23:11.813601
1e007f02-e28c-4a59-9e91-4401813dacd5	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	6a6e6664-dc3a-43ce-9966-f9e824aceb40	Offer	4	2025-09-12 14:23:11.813601	2025-09-12 14:23:11.813601
7ddf0caa-576a-433c-ac2f-8bc28d242ac9	f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	9c576b6f-713a-44df-896e-49be24dc9ae0	Onboarding	5	2025-09-12 14:23:11.813601	2025-09-12 14:23:11.813601
e0407d68-8880-417d-a00a-9ab482a0bfde	d358dcf9-dffb-41ab-ac37-6ee0445864f9	ab77705b-d002-4e52-bae8-03e245e25382	Letter Of Intent	1	2025-09-12 14:48:55.49329	2025-09-12 14:48:55.49329
75ed1396-38a3-4763-b944-36d68768cebc	d358dcf9-dffb-41ab-ac37-6ee0445864f9	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	Background Check	2	2025-09-12 14:48:55.49329	2025-09-12 14:48:55.49329
df8bf71c-e98c-4675-be94-79f079f064cb	d358dcf9-dffb-41ab-ac37-6ee0445864f9	7c54a7eb-f41d-4197-8bc7-65288cc53d10	Credentialing	3	2025-09-12 14:48:55.49329	2025-09-12 14:48:55.49329
f1689540-0dfc-438d-8a7d-485510b0d5e1	d358dcf9-dffb-41ab-ac37-6ee0445864f9	6a6e6664-dc3a-43ce-9966-f9e824aceb40	Offer	4	2025-09-12 14:48:55.49329	2025-09-12 14:48:55.49329
67a41707-c09f-46b4-8acb-a4f90c6a4ab5	d358dcf9-dffb-41ab-ac37-6ee0445864f9	9c576b6f-713a-44df-896e-49be24dc9ae0	Onboarding	5	2025-09-12 14:48:55.49329	2025-09-12 14:48:55.49329
c48120e7-c02b-48b0-95b0-23d1bfbb306a	3fa5ba00-0e23-4d3f-affc-78dea68c2941	ab77705b-d002-4e52-bae8-03e245e25382	Letter Of Intent	1	2025-09-18 20:33:56.13669	2025-09-18 20:33:56.13669
0eefdc37-bcd4-4661-b931-47ff1327ad0a	3fa5ba00-0e23-4d3f-affc-78dea68c2941	59598f0a-dcec-4870-a952-9f5e9193c980	Letter of Offer	2	2025-09-18 20:33:56.13669	2025-09-18 20:33:56.13669
a1c27863-5379-447a-be8a-062561309eb8	3fa5ba00-0e23-4d3f-affc-78dea68c2941	9c576b6f-713a-44df-896e-49be24dc9ae0	Onboarding	3	2025-09-18 20:33:56.13669	2025-09-18 20:33:56.13669
ad8c1491-6e70-4e9c-871c-0ccb0a0913cf	f898022e-2ead-4226-8d26-60e7ba374da5	ab77705b-d002-4e52-bae8-03e245e25382	Letter Of Intent	1	2025-09-19 19:35:12.768716	2025-09-19 19:35:12.768716
c63dd912-37b9-4909-be9d-b9df76398ecf	f898022e-2ead-4226-8d26-60e7ba374da5	59598f0a-dcec-4870-a952-9f5e9193c980	Letter of Offer	2	2025-09-19 19:35:12.768716	2025-09-19 19:35:12.768716
c61e2e21-c7ac-4ad0-8e66-63ab9560e0b7	f898022e-2ead-4226-8d26-60e7ba374da5	9c576b6f-713a-44df-896e-49be24dc9ae0	Onboarding	3	2025-09-19 19:35:12.768716	2025-09-19 19:35:12.768716
\.


--
-- Data for Name: candidate_types; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.candidate_types (id, name, created_at, updated_at) FROM stdin;
c86e478e-9e94-486b-92fd-bcdc21ae2b1e	Staff	2025-08-30 20:01:22.774599	2025-08-30 20:01:22.774599
57e80d00-14ed-466e-bb24-5f43198c150e	Faculty	2025-08-30 20:01:22.774599	2025-08-30 20:01:22.774599
dec48c31-8be4-45df-b02b-65e2907840f8	Clinical	2025-08-30 20:01:22.774599	2025-08-30 20:01:22.774599
21268757-4ff6-45f2-bb6e-fdc3cd2b23ec	Faculty Clinical	2025-08-30 20:01:22.774599	2025-08-30 20:01:22.774599
89cbd6f0-6ff3-4aca-8798-4f188aa464e0	Other	2025-08-30 20:01:22.774599	2025-08-30 20:01:22.774599
\.


--
-- Data for Name: candidates; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.candidates (id, first_name, last_name, email, candidate_type_id, department_id, division_id, manager_id, start_date, status, template_applied_from_id, template_applied_at, template_locked, created_at, updated_at, updated_by, created_by, faculty_rank_id, salutation, current_stage_id, template_name_snapshot, template_version, archived, archived_at, archived_by, is_blocked_by_prior_stage, blocker_summary, primary_owner_id) FROM stdin;
d358dcf9-dffb-41ab-ac37-6ee0445864f9	Kerry	Washington	kw@gmail.com	57e80d00-14ed-466e-bb24-5f43198c150e	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	2025-09-17	active	85c361ed-7157-47a4-b32c-be3c2593b9c7	2025-09-12 14:48:55.498	t	2025-09-12 14:48:55.444852	2025-09-12 16:55:01.566	\N	\N	2ca3f2c1-4b7c-4667-b409-ed9334ac1bc0	Dr.	ab77705b-d002-4e52-bae8-03e245e25382	Faculty - Associate - Pro & Ten	1	f	\N	\N	f	\N	c48d4d1f-bfe4-414a-bb5a-df6102346ef3
586cf9d0-a4cc-4f5d-8b01-698b870f7711	Holly	Horan	hhoran@horan.com	57e80d00-14ed-466e-bb24-5f43198c150e	be35bc44-2256-4036-9984-120c8ad01071	df45fe7f-6228-4bb5-9cb7-1900c0a52322	ec6ef42b-bfe9-4166-9acf-122669612356	2025-09-12	active	85c361ed-7157-47a4-b32c-be3c2593b9c7	2025-09-09 15:09:40.337	t	2025-09-09 15:09:40.284857	2025-09-10 18:45:27.244	\N	\N	221a1009-31ea-4b55-9c97-7ba30ea926f1	Dr.	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	Faculty - Associate - Pro & Ten	1	f	\N	\N	f	\N	ec6ef42b-bfe9-4166-9acf-122669612356
f05f84e3-c3a5-4cfd-ba28-4053dcc08f7b	Leslie	White	lwht@gmail.com	57e80d00-14ed-466e-bb24-5f43198c150e	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	2025-09-15	active	85c361ed-7157-47a4-b32c-be3c2593b9c7	2025-09-12 14:23:11.82	t	2025-09-12 14:23:11.737747	2025-09-12 14:36:21.333	\N	\N	2ca3f2c1-4b7c-4667-b409-ed9334ac1bc0	Dr.	c3254a6d-dfa4-4e93-9c0c-7f236ab20220	Faculty - Associate - Pro & Ten	1	f	\N	\N	f	\N	c48d4d1f-bfe4-414a-bb5a-df6102346ef3
3fa5ba00-0e23-4d3f-affc-78dea68c2941	Mike	Cash	mcash@cash.com	57e80d00-14ed-466e-bb24-5f43198c150e	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	2025-09-19	active	fdb08906-cc63-4540-9d35-5358947e2d2c	2025-09-18 20:33:56.141	t	2025-09-18 20:33:56.09996	2025-09-19 19:34:22.922	\N	\N	2ca3f2c1-4b7c-4667-b409-ed9334ac1bc0	Dr.	59598f0a-dcec-4870-a952-9f5e9193c980	Faculty	1	f	\N	\N	f	\N	c48d4d1f-bfe4-414a-bb5a-df6102346ef3
f898022e-2ead-4226-8d26-60e7ba374da5	Test	People	tpeoples@cnn.com	57e80d00-14ed-466e-bb24-5f43198c150e	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	2025-09-20	active	fdb08906-cc63-4540-9d35-5358947e2d2c	2025-09-19 19:35:12.774	t	2025-09-19 19:35:12.733218	2025-09-19 19:35:12.774	\N	\N	2ca3f2c1-4b7c-4667-b409-ed9334ac1bc0	Dr.	ab77705b-d002-4e52-bae8-03e245e25382	Faculty	1	f	\N	\N	f	\N	a3a5e666-8d8f-47e3-90a9-45b45240210c
\.


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.comments (id, entity_type, entity_id, author_user_id, body, visibility, parent_id, is_deleted, created_at, updated_at) FROM stdin;
ab829a7b-351d-47b6-ba35-be4072ae23b8	candidate	586cf9d0-a4cc-4f5d-8b01-698b870f7711	917566dd-00a2-42fc-9289-e08cb465671a	test	internal	\N	t	2025-09-10 21:44:46.140772+00	2025-09-10 21:44:48.047+00
7b06c6db-98ed-4843-ae11-ec78fafa8152	task	11188091-0ad0-4503-abce-01d9cbec5740	917566dd-00a2-42fc-9289-e08cb465671a	This is a test.	internal	\N	t	2025-09-12 14:21:49.643884+00	2025-09-12 14:21:58.847+00
142bd991-9914-45d1-9707-7b231dbf56be	candidate	586cf9d0-a4cc-4f5d-8b01-698b870f7711	917566dd-00a2-42fc-9289-e08cb465671a	This is a test.	internal	\N	t	2025-09-12 14:22:15.796785+00	2025-09-12 14:22:18.635+00
94207305-5201-4728-890a-f1f7c3cd5827	task	3bbb3e86-2a02-494b-a345-50a9f2944b48	917566dd-00a2-42fc-9289-e08cb465671a	This is test.	internal	\N	f	2025-09-12 14:37:05.353113+00	2025-09-12 14:37:05.353113+00
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.departments (id, name, archived, created_at, updated_at, updated_by, created_by) FROM stdin;
be35bc44-2256-4036-9984-120c8ad01071	OBGYN	f	2025-08-30 19:52:10.591086	2025-09-07 21:01:17.574	\N	\N
508d8815-c1ad-4de5-806f-75ed0c82aebd	Chemistry	t	2025-09-07 17:13:12.416999	2025-09-07 22:26:46.069	\N	\N
f47d3c71-b271-4865-8c0a-4f8924e41e1f	Live Health Smart Alabama	f	2025-09-07 14:11:52.073962	2025-09-08 14:30:07.415	\N	\N
d010ddbf-e302-4fcc-a621-dc1ae320aa79	IT	f	2025-09-08 21:56:01.282457	2025-09-08 21:56:01.282457	\N	\N
\.


--
-- Data for Name: divisions; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.divisions (id, department_id, name, archived, created_at, updated_at, updated_by, created_by) FROM stdin;
40e41c68-7eb2-4db7-813d-1accf61e7729	be35bc44-2256-4036-9984-120c8ad01071	MFM	f	2025-08-30 19:52:21.827867	2025-08-30 19:52:21.827867	\N	\N
34a29348-7ce0-4f9e-acf3-ba11a8291fe2	be35bc44-2256-4036-9984-120c8ad01071	IT	f	2025-08-31 12:05:12.209246	2025-08-31 12:05:12.209246	\N	\N
34721d65-6d0e-49f6-bd72-adae9c0e6130	be35bc44-2256-4036-9984-120c8ad01071	Education	f	2025-09-01 23:22:05.74172	2025-09-01 23:22:05.74172	\N	\N
f980b722-4ad7-4c32-a4c7-498b2ebae440	be35bc44-2256-4036-9984-120c8ad01071	Research	f	2025-09-07 20:43:34.19836	2025-09-07 20:43:34.19836	\N	\N
df45fe7f-6228-4bb5-9cb7-1900c0a52322	be35bc44-2256-4036-9984-120c8ad01071	REI	f	2025-09-01 23:21:45.515905	2025-09-07 22:20:47.055	\N	\N
45412a39-9522-42ca-b21b-e7e68b5e1461	f47d3c71-b271-4865-8c0a-4f8924e41e1f	Mobile Market	f	2025-09-07 16:31:15.94087	2025-09-07 22:20:49.539	\N	\N
\.


--
-- Data for Name: faculty_ranks; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.faculty_ranks (id, name, created_at, updated_at) FROM stdin;
221a1009-31ea-4b55-9c97-7ba30ea926f1	Assistant	2025-08-30 20:01:06.058364	2025-08-30 20:01:06.058364
2ca3f2c1-4b7c-4667-b409-ed9334ac1bc0	Associate	2025-08-30 20:01:06.058364	2025-08-30 20:01:06.058364
1626ac6e-d642-4b91-aebe-7dd133b14cc5	Professor	2025-08-30 20:01:06.058364	2025-08-30 20:01:06.058364
38c14c0a-41e8-40de-9eb2-98b001c8a370	Other	2025-08-30 20:01:06.058364	2025-08-30 20:01:06.058364
\.


--
-- Data for Name: hiring_stages; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.hiring_stages (id, name, order_index, created_at, updated_at, description, is_active) FROM stdin;
8499a188-fcd2-4e71-a38c-d06a8d01cc46	Screening	3	2025-09-02 11:24:20.770382	2025-09-02 11:25:32.964	Reviewing applications and conducting initial interviews to assess candidate fit.	t
c3254a6d-dfa4-4e93-9c0c-7f236ab20220	Background Check	4	2025-09-02 11:25:15.290082	2025-09-02 11:25:52.915	Running reference, criminal, and employment history checks before finalizing hire.	t
278a4e4e-df48-42f8-85a5-88940e124b00	Admin Processing	5	2025-08-30 20:01:21.282153	2025-09-02 11:26:38.086	Collecting documents, verifying eligibility, and completing internal administrative requirements.	t
7c54a7eb-f41d-4197-8bc7-65288cc53d10	Credentialing	6	2025-08-30 20:01:21.282153	2025-09-02 11:26:48.216	Verifying licenses, certifications, and qualifications required for the role.	t
9c576b6f-713a-44df-896e-49be24dc9ae0	Onboarding	7	2025-08-30 20:01:21.282153	2025-09-02 11:26:54.999	Orienting new hire, providing training, and setting up access to systems.	t
59598f0a-dcec-4870-a952-9f5e9193c980	Letter of Offer	8	2025-09-03 01:36:35.536198	2025-09-03 01:36:35.536198	Formal job offer issued; triggers internal hiring, credentialing, and compliance processes	t
ab77705b-d002-4e52-bae8-03e245e25382	Letter Of Intent	1	2025-08-30 20:01:21.282153	2025-09-07 21:54:46.407	Initial letter confirming interest and outlining terms of potential employment.	t
6a6e6664-dc3a-43ce-9966-f9e824aceb40	Offer	2	2025-08-30 20:01:21.282153	2025-09-07 21:54:53.543	Formal employment offer extended to candidate with defined role and compensation.	t
\.


--
-- Data for Name: invitations; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.invitations (id, email, username, roles, token, status, expires_at, consumed_at, invited_by, created_at, updated_at, department_id, division_id, first_name, last_name) FROM stdin;
30b54bb5-6629-4d4a-8cb8-824f428ef4ba	hermansteen@gmail.com	hermansteen	{system_admin}	UX21r-tE9XXN4F6U1NnOU696991PzorZxM-18eO1_0M	pending	2025-09-24 19:43:47.757+00	\N	917566dd-00a2-42fc-9289-e08cb465671a	2025-09-17 19:43:47.758+00	2025-09-17 19:43:47.758+00	be35bc44-2256-4036-9984-120c8ad01071	34a29348-7ce0-4f9e-acf3-ba11a8291fe2	Herman	Steen
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.notifications (id, user_id, type, entity_type, entity_id, payload, is_read, read_at, created_at, delivered_channels) FROM stdin;
faf85e3c-37b1-4fef-89ec-affac363df04	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	stage.changed	candidate	3fa5ba00-0e23-4d3f-affc-78dea68c2941	{"actor": {"id": "a3a5e666-8d8f-47e3-90a9-45b45240210c", "name": "Jon Steen"}, "stage": {"toStageId": "59598f0a-dcec-4870-a952-9f5e9193c980", "fromStageId": "ab77705b-d002-4e52-bae8-03e245e25382", "toStageName": "Letter of Offer"}, "candidate": {"id": "3fa5ba00-0e23-4d3f-affc-78dea68c2941", "name": "Mike Cash"}}	f	\N	2025-09-19 19:34:22.956+00	{in_app}
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.session (sid, sess, expire) FROM stdin;
jDEYCey18PJl5EyO3Bxh1_ocqMSmNVtc	{"cookie":{"originalMaxAge":604800000,"expires":"2025-09-25T19:52:38.476Z","secure":false,"httpOnly":true,"path":"/"},"passport":{"user":"b496adce-a0f8-43e1-a267-da8cfe336254"}}	2025-09-25 20:30:03
Y0irRW7mT3m3lhc3nvfMrKshyWYm1jsc	{"cookie":{"originalMaxAge":604800000,"expires":"2025-09-25T22:16:05.291Z","secure":false,"httpOnly":true,"path":"/"},"passport":{"user":"a3a5e666-8d8f-47e3-90a9-45b45240210c"}}	2025-09-26 19:35:31
XIAllUjUoRxSEg09ZbASOQoYPqY6Vqnt	{"cookie":{"originalMaxAge":604800000,"expires":"2025-09-25T20:34:36.078Z","secure":false,"httpOnly":true,"path":"/"},"passport":{"user":"a3a5e666-8d8f-47e3-90a9-45b45240210c"}}	2025-09-25 22:11:08
y34maFLmjnuyxfzKt4xJMENF0IS9-fas	{"cookie":{"originalMaxAge":604800000,"expires":"2025-09-25T22:12:11.467Z","secure":false,"httpOnly":true,"path":"/"},"passport":{"user":"a3a5e666-8d8f-47e3-90a9-45b45240210c"}}	2025-09-25 22:12:22
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.system_settings (key, value, created_at, updated_at) FROM stdin;
auto_regress_on_prior_open	{"enabled": false}	2025-09-08 21:48:41.40381	2025-09-09 11:02:53.101
auth.ldap	{"url": "ldap://ad.hs.uab.edu:389 ", "baseDn": "OU=UABHS Users,DC=ad,DC=hs,DC=uab,DC=edu", "bindDn": "jesteen", "startTls": true, "emailAttr": "mail", "userFilter": "(sAMAccountName={{username}})", "bindPassword": "enc:v1:/sEZn71FoRvlKG1o1RKqjw==:NVqWv6epUATdScrG:SOYXw2V707Aq4k+m2Vr95D7s84nM+f4=:MbhRJPlO1oflCgQd/183tw==", "lastNameAttr": "sn", "usernameAttr": "sAMAccountName", "firstNameAttr": "givenName"}	2025-09-17 20:14:04.952	2025-09-17 20:14:50.994
\.


--
-- Data for Name: task_categories; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.task_categories (id, name, created_at, updated_at) FROM stdin;
c5c30581-126a-477a-a3da-c376e4ed864d	Documents	2025-08-30 20:01:14.382736	2025-08-30 20:01:14.382736
d41f8ee2-a910-4391-a6c9-5e1f86934c1b	Meetings	2025-08-30 20:01:14.382736	2025-08-30 20:01:14.382736
1938639a-3eee-4e62-ba8e-63bbdcde39d5	Admin	2025-08-30 20:01:14.382736	2025-08-30 20:01:14.382736
59a00206-2d17-4f31-bbd9-ef1f11a0def8	Processing	2025-08-30 20:01:14.382736	2025-08-30 20:01:14.382736
02b90821-03af-476c-b7cd-c8b2045c187e	Other	2025-08-30 20:01:14.382736	2025-08-30 20:01:14.382736
9939b6d7-33f9-4427-925b-2ab3babf9031	General	2025-09-08 21:56:01.28584	2025-09-08 21:56:01.28584
\.


--
-- Data for Name: task_definitions; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.task_definitions (id, name, description, created_at, updated_at, archived, created_by, updated_by) FROM stdin;
63823e18-144e-4160-9898-a2368dfc04f0	Order ID Badge	Order and prepare employee identification badge	2025-08-30 20:24:49.170763	2025-08-30 22:50:47.20842	f	917566dd-00a2-42fc-9289-e08cb465671a	\N
f81c3e49-f4b8-410f-a5b9-5bd1744a89f9	Setup Email Account	Create email account and provide login credentials to new employee	2025-08-30 20:24:49.170763	2025-08-30 22:50:47.272201	f	917566dd-00a2-42fc-9289-e08cb465671a	\N
ee681d15-2b17-41b3-9101-e8e4cfcb5e1e	Set up workstation	Configure new employee's computer, accounts, security access, and workspace with necessary tools and equipment.	2025-08-30 20:59:20.548812	2025-08-30 22:50:47.246431	f	917566dd-00a2-42fc-9289-e08cb465671a	\N
17e7e6cd-3d0e-481f-8f89-224caace3976	Enroll in Benefits	Guide employee through benefits enrollment (health, retirement, etc.).	2025-09-01 22:30:54.038898	2025-09-01 22:30:54.038898	f	\N	\N
e48aaaff-ae46-4c28-b836-8a776e5e5035	Orientation Session	Schedule and conduct orientation session for new employees.	2025-09-01 22:30:54.038898	2025-09-01 22:30:54.038898	f	\N	\N
df660657-335f-40a9-9fa6-6a5c38d84033	Payroll Setup	Set up payroll, direct deposit, and tax withholding information.	2025-09-01 22:30:54.038898	2025-09-01 22:30:54.038898	f	\N	\N
0d993b13-770f-4de8-817a-1ca5f0b3df4e	Review Employee Handbook	Provide handbook and obtain signed acknowledgment from employee.	2025-09-01 22:30:54.038898	2025-09-01 22:30:54.038898	f	\N	\N
a6ba6c04-ef01-46d1-a06f-00b17237eebe	Manager Introduction	Arrange a meeting between the employee and their direct manager.	2025-09-01 22:30:54.038898	2025-09-01 22:30:54.038898	f	\N	\N
9fc86560-dc53-4cb6-86cb-5549e20382f4	Collect I-9 Documents	Collect and verify I-9 employment eligibility documents	2025-08-30 20:24:49.170763	2025-09-08 22:13:51.792	f	917566dd-00a2-42fc-9289-e08cb465671a	\N
\.


--
-- Data for Name: task_priorities; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.task_priorities (id, name, created_at, updated_at) FROM stdin;
a6e96729-7170-48af-87c6-a165722a9a79	low	2025-08-30 22:35:36.819126	2025-08-30 22:35:36.819126
64aa685d-4822-4ee2-95b1-130a0578be08	medium	2025-08-30 22:35:36.819126	2025-08-30 22:35:36.819126
818419bf-eb51-407e-8a8e-34c0a1f0de97	high	2025-08-30 22:35:36.819126	2025-08-30 22:35:36.819126
37db81d5-0367-421c-af3f-22017dc855d9	critical	2025-08-30 22:35:36.819126	2025-08-30 22:35:36.819126
\.


--
-- Data for Name: template_stages; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.template_stages (id, template_id, stage_id, order_index, is_active, created_at, updated_at) FROM stdin;
986f11ee-d5ad-43fd-b790-52556c345416	fdb08906-cc63-4540-9d35-5358947e2d2c	ab77705b-d002-4e52-bae8-03e245e25382	1	t	2025-09-18 15:42:58.688373	2025-09-18 15:42:58.688373
79d82d90-75ac-4e70-bfbc-64d380a3b4fd	fdb08906-cc63-4540-9d35-5358947e2d2c	59598f0a-dcec-4870-a952-9f5e9193c980	2	t	2025-09-18 15:55:16.192834	2025-09-18 15:55:16.192834
44ee6336-e11a-4a9c-b7e6-e9dca40b2154	fdb08906-cc63-4540-9d35-5358947e2d2c	9c576b6f-713a-44df-896e-49be24dc9ae0	3	t	2025-09-18 15:55:45.29031	2025-09-18 15:55:45.29031
\.


--
-- Data for Name: template_tasks; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.template_tasks (id, template_id, task_def_id, stage_id, due_rule_type, due_rule_value, fixed_date, default_assignee_id, default_category_id, created_at, updated_at, updated_by, created_by, archived, default_priority_id, is_required) FROM stdin;
2da8cd59-67b6-49c9-87d2-52455d30328e	38b3a4f2-a671-451d-a768-2c02f25d5338	9fc86560-dc53-4cb6-86cb-5549e20382f4	ab77705b-d002-4e52-bae8-03e245e25382	on_start_date	\N	\N	\N	\N	2025-09-11 18:12:52.401241	2025-09-11 18:12:52.401241	\N	\N	f	\N	t
d4ceeae9-acb6-46e4-974d-900f423d807a	38b3a4f2-a671-451d-a768-2c02f25d5338	f81c3e49-f4b8-410f-a5b9-5bd1744a89f9	ab77705b-d002-4e52-bae8-03e245e25382	on_start_date	\N	\N	\N	\N	2025-09-11 18:12:52.404522	2025-09-11 18:12:52.404522	\N	\N	f	\N	t
980c3213-833a-4aa0-8369-4e531ac4d6a1	a1fe11dd-e91b-4a83-ac74-10fec65feca9	f81c3e49-f4b8-410f-a5b9-5bd1744a89f9	9c576b6f-713a-44df-896e-49be24dc9ae0	on_start_date	\N	\N	\N	\N	2025-09-11 18:24:29.32006	2025-09-11 18:24:29.32006	\N	\N	f	\N	t
a89dff1b-955c-4cc3-ab28-8ebd6f19f1f0	f56350fe-20dc-4454-a931-1ae63a3edeaa	9fc86560-dc53-4cb6-86cb-5549e20382f4	ab77705b-d002-4e52-bae8-03e245e25382	on_start_date	\N	\N	\N	\N	2025-09-12 14:47:14.545002	2025-09-12 14:47:14.545002	\N	\N	f	\N	t
fbf356e2-3a0a-4bb0-91d6-acf5feca78d5	f56350fe-20dc-4454-a931-1ae63a3edeaa	a6ba6c04-ef01-46d1-a06f-00b17237eebe	ab77705b-d002-4e52-bae8-03e245e25382	days_after_start	5	\N	\N	\N	2025-09-12 14:47:27.470107	2025-09-12 14:47:43.838	\N	\N	f	\N	f
ca9843d0-c47f-453a-8bf3-842425ddca92	85c361ed-7157-47a4-b32c-be3c2593b9c7	9fc86560-dc53-4cb6-86cb-5549e20382f4	ab77705b-d002-4e52-bae8-03e245e25382	days_after_start	5	\N	\N	\N	2025-09-18 15:40:04.809032	2025-09-18 15:40:04.809032	\N	\N	f	\N	t
f1e3614d-ad48-4804-b7eb-207239975871	fdb08906-cc63-4540-9d35-5358947e2d2c	a6ba6c04-ef01-46d1-a06f-00b17237eebe	9c576b6f-713a-44df-896e-49be24dc9ae0	on_start_date	\N	\N	c48d4d1f-bfe4-414a-bb5a-df6102346ef3	02b90821-03af-476c-b7cd-c8b2045c187e	2025-09-18 15:55:45.299218	2025-09-18 15:55:59.946	\N	\N	f	64aa685d-4822-4ee2-95b1-130a0578be08	t
24faf461-ea03-42ea-bfee-97052fb2e8a6	fdb08906-cc63-4540-9d35-5358947e2d2c	9fc86560-dc53-4cb6-86cb-5549e20382f4	ab77705b-d002-4e52-bae8-03e245e25382	days_after_start	1	\N	a3a5e666-8d8f-47e3-90a9-45b45240210c	1938639a-3eee-4e62-ba8e-63bbdcde39d5	2025-09-18 15:42:58.697341	2025-09-18 20:32:42.591	\N	\N	f	64aa685d-4822-4ee2-95b1-130a0578be08	t
f7462323-e9cc-4770-946a-a89a5438b1ac	fdb08906-cc63-4540-9d35-5358947e2d2c	17e7e6cd-3d0e-481f-8f89-224caace3976	59598f0a-dcec-4870-a952-9f5e9193c980	days_after_stage	1	\N	a3a5e666-8d8f-47e3-90a9-45b45240210c	c5c30581-126a-477a-a3da-c376e4ed864d	2025-09-18 15:55:16.201102	2025-09-18 20:32:53.139	\N	\N	f	64aa685d-4822-4ee2-95b1-130a0578be08	t
\.


--
-- Data for Name: templates; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.templates (id, name, candidate_type_id, is_active, archived, created_at, updated_at, updated_by, created_by, description) FROM stdin;
c5eff704-54fa-4d08-8c59-2092c1d6b854	Faculty - Associate - Pro & Ten	57e80d00-14ed-466e-bb24-5f43198c150e	f	f	2025-09-18 15:42:20.292753	2025-09-18 15:42:20.292753	\N	\N	
176af1f7-506a-4654-9e81-5d3a56dcde44	Staff - Base	c86e478e-9e94-486b-92fd-bcdc21ae2b1e	f	f	2025-09-18 15:42:34.523045	2025-09-18 15:42:34.523045	\N	\N	
fdb08906-cc63-4540-9d35-5358947e2d2c	Faculty	57e80d00-14ed-466e-bb24-5f43198c150e	t	f	2025-09-18 15:42:06.999631	2025-09-18 15:42:58.692244	\N	\N	
\.


--
-- Data for Name: user_identities; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.user_identities (id, user_id, provider, external_id, email, username, created_at) FROM stdin;
\.


--
-- Data for Name: user_preferences; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.user_preferences (user_id, mytasks_show_archived, mytasks_show_canceled, mytasks_show_completed, updated_at, notify_in_app, notify_email, digest_frequency, quiet_hours_start, quiet_hours_end, event_subscriptions, allow_self_notifications) FROM stdin;
917566dd-00a2-42fc-9289-e08cb465671a	f	f	f	2025-09-18 20:34:21.518	t	f	immediate	\N	\N	{"mention": true, "stage.changed": true, "task.assigned": true, "comment.created": true}	f
a3a5e666-8d8f-47e3-90a9-45b45240210c	t	t	t	2025-09-18 22:23:24.079	t	f	immediate	\N	\N	{"mention": true, "stage.changed": true, "task.assigned": true, "comment.created": true}	f
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.user_roles (id, user_id, role, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: db_user
--

COPY public.users (id, email, password_hash, role, department_id, division_id, active, created_at, updated_at, status, last_login_at, first_name, last_name, auth_provider, external_id, username, email_verified, mention_key) FROM stdin;
f9430ceb-a299-41b0-bba5-17cf074689ed	deptadmin@example.com	<bcrypt_hash>	department_admin	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	t	2025-09-06 01:17:13.233557	2025-09-07 16:27:25.551	active	\N	Warner	Huh	local	\N	\N	f	.arner.uh
6fbfab6d-3f67-492f-b93d-bd3d393c6601	cmar@cnn.com	d7276f09e90e4882c132c9737ec4da4a653033a0db7904570c13131e3634af219bbca6488f6fc56567a6228473e47fa7431d15ac5324cb12b862147e3ab5d36b.84f4b1d2c3835fdf17bef129b032fe9c	hr_staff	be35bc44-2256-4036-9984-120c8ad01071	34721d65-6d0e-49f6-bd72-adae9c0e6130	t	2025-09-07 16:28:49.051864	2025-09-07 16:28:49.051864	active	\N	Carrie	Martin	local	\N	\N	f	.arrie.artin
c48d4d1f-bfe4-414a-bb5a-df6102346ef3	manager@example.com	<bcrypt_hash>	manager	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	t	2025-09-06 01:17:13.233557	2025-09-08 20:46:22.9	active	\N	Bashirat	Hahn	local	\N	\N	f	.ashirat.ahn
7f189688-7e40-43c0-82c3-31b3edc79c95	divleader@example.com	<bcrypt_hash>	division_leader	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	t	2025-09-06 01:17:13.233557	2025-09-06 04:41:04.854	active	\N	Taylor	Sission	local	\N	\N	f	.aylor.ission
b496adce-a0f8-43e1-a267-da8cfe336254	hr@example.com	$2b$10$k8oSdg8jS6aGhD0vWc5OgO5PJkgN4k1DseQ3Huqwtd0ml.7GJu3ua	hr_staff	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	t	2025-09-06 01:17:13.233557	2025-09-06 04:41:02.373	active	2025-09-18 19:52:38.472	Shawaii	Jackson	local	\N	\N	t	.hawaii.ackson
ec6ef42b-bfe9-4166-9acf-122669612356	smoke@example.com	\N	manager	be35bc44-2256-4036-9984-120c8ad01071	df45fe7f-6228-4bb5-9cb7-1900c0a52322	t	2025-09-08 21:56:01.286988	2025-09-09 20:54:04.217	active	\N	Smoke	Tester	local	\N	\N	f	.moke.ester
917566dd-00a2-42fc-9289-e08cb465671a	jesteen@uabmc.edu	$2b$10$N.vy9Rf9g/cywGJyNhp0qeT.AvaOR15/oD3fAKr.0An8Rp5sizFSO	system_admin	be35bc44-2256-4036-9984-120c8ad01071	34a29348-7ce0-4f9e-acf3-ba11a8291fe2	t	2025-09-06 01:17:13.233557	2025-09-06 04:40:59.541	active	2025-09-18 15:38:09.562	Jonathan	Steen	local	\N	\N	t	.onathan.teen
79c56667-a897-40e8-95e6-51ebd7af098f	dwilson@gmail.com	b700c32965527da453c4ba9273299179337f7b7bbcdb561384214f8f4f278baacb95535b2bfbdc62278995f087cf1f6ac64f36189b8bcb6ed84d998e6c625140.01551ab6ca4cfde259820646f11262c7	candidate	be35bc44-2256-4036-9984-120c8ad01071	40e41c68-7eb2-4db7-813d-1accf61e7729	t	2025-09-12 13:30:28.616755	2025-09-12 13:30:28.616755	active	2025-09-12 13:30:43.742	Donna	Wilson	local	\N	\N	f	.onna.ilson
a3a5e666-8d8f-47e3-90a9-45b45240210c	dev@dev.com	d78bad15c9dd28eaa5e2c2651a89f1d0731c1a58e0f72b0f24e29f2bf572f12f9041dab73de6f65913b687eb650d45a17a397d2b4c36267cfe6986a51b3b3f95.5a211aec09c83cdff073b0b29a885f82	system_admin	be35bc44-2256-4036-9984-120c8ad01071	34a29348-7ce0-4f9e-acf3-ba11a8291fe2	t	2025-09-06 02:13:19.473748	2025-09-17 20:18:21.894	active	2025-09-18 22:16:05.289	Jon	Steen	local	\N	\N	f	.on.teen
\.


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: auth_providers auth_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.auth_providers
    ADD CONSTRAINT auth_providers_pkey PRIMARY KEY (id);


--
-- Name: candidate_followers candidate_followers_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_followers
    ADD CONSTRAINT candidate_followers_pkey PRIMARY KEY (candidate_id, user_id);


--
-- Name: candidate_stage_history candidate_stage_history_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_stage_history
    ADD CONSTRAINT candidate_stage_history_pkey PRIMARY KEY (id);


--
-- Name: candidate_tasks candidate_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_tasks
    ADD CONSTRAINT candidate_tasks_pkey PRIMARY KEY (id);


--
-- Name: candidate_template_stages candidate_template_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_template_stages
    ADD CONSTRAINT candidate_template_stages_pkey PRIMARY KEY (id);


--
-- Name: candidate_types candidate_types_name_key; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_types
    ADD CONSTRAINT candidate_types_name_key UNIQUE (name);


--
-- Name: candidate_types candidate_types_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_types
    ADD CONSTRAINT candidate_types_pkey PRIMARY KEY (id);


--
-- Name: candidates candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (id);


--
-- Name: faculty_ranks faculty_ranks_name_key; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.faculty_ranks
    ADD CONSTRAINT faculty_ranks_name_key UNIQUE (name);


--
-- Name: faculty_ranks faculty_ranks_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.faculty_ranks
    ADD CONSTRAINT faculty_ranks_pkey PRIMARY KEY (id);


--
-- Name: hiring_stages hiring_stages_name_key; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.hiring_stages
    ADD CONSTRAINT hiring_stages_name_key UNIQUE (name);


--
-- Name: hiring_stages hiring_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.hiring_stages
    ADD CONSTRAINT hiring_stages_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: task_categories task_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.task_categories
    ADD CONSTRAINT task_categories_name_key UNIQUE (name);


--
-- Name: task_categories task_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.task_categories
    ADD CONSTRAINT task_categories_pkey PRIMARY KEY (id);


--
-- Name: task_definitions task_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.task_definitions
    ADD CONSTRAINT task_definitions_pkey PRIMARY KEY (id);


--
-- Name: task_priorities task_priorities_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.task_priorities
    ADD CONSTRAINT task_priorities_pkey PRIMARY KEY (id);


--
-- Name: template_stages template_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.template_stages
    ADD CONSTRAINT template_stages_pkey PRIMARY KEY (id);


--
-- Name: template_tasks template_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.template_tasks
    ADD CONSTRAINT template_tasks_pkey PRIMARY KEY (id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: user_identities user_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: candidate_followers_user_idx; Type: INDEX; Schema: public; Owner: db_user
--

CREATE INDEX candidate_followers_user_idx ON public.candidate_followers USING btree (user_id);


--
-- Name: candidate_types_name_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX candidate_types_name_unique ON public.candidate_types USING btree (name);


--
-- Name: candidates_primary_owner_idx; Type: INDEX; Schema: public; Owner: db_user
--

CREATE INDEX candidates_primary_owner_idx ON public.candidates USING btree (primary_owner_id);


--
-- Name: comments_entity_visibility_idx; Type: INDEX; Schema: public; Owner: db_user
--

CREATE INDEX comments_entity_visibility_idx ON public.comments USING btree (entity_type, entity_id, visibility, created_at DESC);


--
-- Name: departments_name_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX departments_name_unique ON public.departments USING btree (name);


--
-- Name: faculty_ranks_name_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX faculty_ranks_name_unique ON public.faculty_ranks USING btree (name);


--
-- Name: hiring_stages_name_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX hiring_stages_name_unique ON public.hiring_stages USING btree (name);


--
-- Name: idx_candidate_stage_order; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX idx_candidate_stage_order ON public.candidate_template_stages USING btree (candidate_id, order_index);


--
-- Name: invitations_email_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX invitations_email_unique ON public.invitations USING btree (lower((email)::text));


--
-- Name: invitations_token_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX invitations_token_unique ON public.invitations USING btree (token);


--
-- Name: notifications_user_read_created_idx; Type: INDEX; Schema: public; Owner: db_user
--

CREATE INDEX notifications_user_read_created_idx ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: task_categories_name_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX task_categories_name_unique ON public.task_categories USING btree (name);


--
-- Name: task_definitions_name_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX task_definitions_name_unique ON public.task_definitions USING btree (lower(name));


--
-- Name: template_stages_template_id_stage_id_key; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX template_stages_template_id_stage_id_key ON public.template_stages USING btree (template_id, stage_id);


--
-- Name: templates_name_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX templates_name_unique ON public.templates USING btree (lower(name));


--
-- Name: uniq_candidate_stage; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX uniq_candidate_stage ON public.candidate_template_stages USING btree (candidate_id, stage_id);


--
-- Name: unique_user_role; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX unique_user_role ON public.user_roles USING btree (user_id, role);


--
-- Name: user_identities_provider_external_id_key; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX user_identities_provider_external_id_key ON public.user_identities USING btree (provider, external_id);


--
-- Name: user_identities_user_id_idx; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX user_identities_user_id_idx ON public.user_identities USING btree (user_id);


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email);


--
-- Name: users_external_id_idx; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX users_external_id_idx ON public.users USING btree (external_id);


--
-- Name: users_mention_key_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX users_mention_key_unique ON public.users USING btree (mention_key);


--
-- Name: users_username_unique; Type: INDEX; Schema: public; Owner: db_user
--

CREATE UNIQUE INDEX users_username_unique ON public.users USING btree (lower(username));


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: audit_log audit_log_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id);


--
-- Name: audit_log audit_log_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.candidate_tasks(id);


--
-- Name: candidate_followers candidate_followers_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_followers
    ADD CONSTRAINT candidate_followers_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;


--
-- Name: candidate_followers candidate_followers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_followers
    ADD CONSTRAINT candidate_followers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: candidate_tasks candidate_tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_tasks
    ADD CONSTRAINT candidate_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);


--
-- Name: candidate_tasks candidate_tasks_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_tasks
    ADD CONSTRAINT candidate_tasks_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id);


--
-- Name: candidate_tasks candidate_tasks_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_tasks
    ADD CONSTRAINT candidate_tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.task_categories(id);


--
-- Name: candidate_tasks candidate_tasks_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_tasks
    ADD CONSTRAINT candidate_tasks_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.hiring_stages(id);


--
-- Name: candidate_tasks candidate_tasks_task_def_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_tasks
    ADD CONSTRAINT candidate_tasks_task_def_id_fkey FOREIGN KEY (task_def_id) REFERENCES public.task_definitions(id);


--
-- Name: candidate_template_stages candidate_template_stages_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_template_stages
    ADD CONSTRAINT candidate_template_stages_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;


--
-- Name: candidate_template_stages candidate_template_stages_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidate_template_stages
    ADD CONSTRAINT candidate_template_stages_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.hiring_stages(id);


--
-- Name: candidates candidates_primary_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_primary_owner_id_fkey FOREIGN KEY (primary_owner_id) REFERENCES public.users(id);


--
-- Name: comments comments_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invitations invitations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: invitations invitations_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: template_stages template_stages_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.template_stages
    ADD CONSTRAINT template_stages_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.hiring_stages(id);


--
-- Name: template_stages template_stages_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.template_stages
    ADD CONSTRAINT template_stages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE CASCADE;


--
-- Name: user_identities user_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict yRciw9tMv26fN12Z1wJP6r0XnQ6Ic8ObJVIixR95ZrIN19Uio1eZHRZn7MjBJvN

