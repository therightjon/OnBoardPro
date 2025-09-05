-- OnboardPro Database Export
-- Generated on: September 4, 2025
-- 
-- This is a complete export of the OnboardPro hiring and onboarding management system database
-- including schema definitions, constraints, indexes, and sample data.

-- =====================================================================
-- ENUM TYPES
-- =====================================================================

CREATE TYPE app_role AS ENUM ('system_admin', 'hr_staff', 'department_admin', 'division_leader', 'manager', 'candidate');
CREATE TYPE candidate_status AS ENUM ('draft', 'active', 'on_hold', 'completed', 'canceled', 'archived');
CREATE TYPE due_rule_type AS ENUM ('days_before_start', 'on_start_date', 'days_after_start', 'days_before_stage', 'days_after_stage', 'fixed_date');
CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE role AS ENUM ('system_admin', 'hr_staff', 'department_admin', 'division_leader', 'manager', 'candidate');
CREATE TYPE salutation_type AS ENUM ('Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.', 'Other', 'Mx.');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'canceled');
CREATE TYPE user_status AS ENUM ('active', 'invited', 'disabled');

-- =====================================================================
-- TABLE DEFINITIONS
-- =====================================================================

-- Authentication Providers
CREATE TABLE auth_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Users Table (Multi-provider authentication support)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT, -- Nullable for external providers
    role role NOT NULL,
    department_id UUID,
    division_id UUID,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    status user_status NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMP WITHOUT TIME ZONE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    auth_provider TEXT NOT NULL DEFAULT 'local',
    external_id TEXT,
    username TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT false
);

-- User Identities for multi-provider authentication
CREATE TABLE user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    email TEXT,
    username TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- User Roles (RBAC)
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- User Preferences
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mytasks_show_archived BOOLEAN NOT NULL DEFAULT false,
    mytasks_show_canceled BOOLEAN NOT NULL DEFAULT false,
    mytasks_show_completed BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Organizational Structure
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_by UUID,
    created_by UUID
);

CREATE TABLE divisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL,
    name TEXT NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_by UUID,
    created_by UUID
);

-- Candidate Management
CREATE TABLE candidate_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE faculty_ranks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE hiring_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    candidate_type_id UUID NOT NULL,
    department_id UUID NOT NULL,
    division_id UUID,
    manager_id UUID,
    start_date DATE NOT NULL,
    status candidate_status NOT NULL DEFAULT 'active',
    template_applied_from_id UUID,
    template_applied_at TIMESTAMP WITHOUT TIME ZONE,
    template_locked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_by UUID,
    created_by UUID,
    faculty_rank_id UUID,
    salutation salutation_type NOT NULL DEFAULT 'Mr.',
    current_stage_id UUID,
    template_name_snapshot TEXT,
    template_version INTEGER DEFAULT 1,
    archived BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMP WITHOUT TIME ZONE,
    archived_by UUID
);

CREATE TABLE candidate_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL,
    from_stage_id UUID,
    to_stage_id UUID NOT NULL,
    changed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    changed_by UUID NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Task Management
CREATE TABLE task_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE task_priorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name priority NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE task_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    archived BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    updated_by UUID
);

CREATE TABLE candidate_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id),
    task_def_id UUID REFERENCES task_definitions(id),
    title TEXT NOT NULL,
    description TEXT,
    stage_id UUID NOT NULL REFERENCES hiring_stages(id),
    assignee_id UUID REFERENCES users(id),
    priority priority NOT NULL,
    category_id UUID NOT NULL REFERENCES task_categories(id),
    due_at TIMESTAMP WITHOUT TIME ZONE,
    status task_status NOT NULL DEFAULT 'todo',
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    notes TEXT,
    required BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    archived BOOLEAN NOT NULL DEFAULT false,
    updated_by UUID,
    created_by UUID,
    stage_order_index INTEGER
);

-- Template System
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    candidate_type_id UUID NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_by UUID,
    created_by UUID,
    description TEXT
);

CREATE TABLE template_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES hiring_stages(id),
    order_index INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE template_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL,
    task_def_id UUID NOT NULL,
    stage_id UUID NOT NULL,
    due_rule_type due_rule_type NOT NULL,
    due_rule_value INTEGER,
    fixed_date DATE,
    default_assignee_id UUID,
    default_category_id UUID,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_by UUID,
    created_by UUID,
    archived BOOLEAN NOT NULL DEFAULT false,
    default_priority_id UUID
);

CREATE TABLE candidate_template_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES hiring_stages(id),
    stage_name_snapshot TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Session table (for authentication)
CREATE TABLE session (
    sid CHARACTER VARYING NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

-- =====================================================================
-- INDEXES AND CONSTRAINTS
-- =====================================================================

-- Unique indexes for data integrity
CREATE UNIQUE INDEX users_email_unique ON users(email);
CREATE UNIQUE INDEX user_identities_provider_external_id_key ON user_identities(provider, external_id);
CREATE UNIQUE INDEX departments_name_unique ON departments(name);
CREATE UNIQUE INDEX candidate_types_name_unique ON candidate_types(name);
CREATE UNIQUE INDEX faculty_ranks_name_unique ON faculty_ranks(name);
CREATE UNIQUE INDEX hiring_stages_name_unique ON hiring_stages(name);
CREATE UNIQUE INDEX task_categories_name_unique ON task_categories(name);
CREATE UNIQUE INDEX template_stages_template_id_stage_id_key ON template_stages(template_id, stage_id);

-- =====================================================================
-- SAMPLE DATA
-- =====================================================================

-- Authentication Providers
INSERT INTO auth_providers (id, name, enabled, created_at, updated_at) VALUES
('local', 'Local Authentication', true, '2025-09-04 17:25:11.533636', '2025-09-04 17:30:28.998'),
('ldap', 'LDAP/Active Directory', false, '2025-09-04 17:25:11.533636', '2025-09-04 17:25:11.533636'),
('google', 'Google OAuth', false, '2025-09-04 17:25:11.533636', '2025-09-04 20:18:18.321'),
('azuread', 'Microsoft Azure AD', false, '2025-09-04 17:25:11.533636', '2025-09-04 17:25:11.533636');

-- Users (Sample Data)
INSERT INTO users (id, email, password_hash, role, department_id, division_id, active, status, first_name, last_name, auth_provider, email_verified) VALUES
('917566dd-00a2-42fc-9289-e08cb465671a', 'jesteen@uabmc.edu', '<bcrypt_hash>', 'system_admin', 'be35bc44-2256-4036-9984-120c8ad01071', '34a29348-7ce0-4f9e-acf3-ba11a8291fe2', true, 'active', 'Jonathan', 'Steen', 'local', false),
('b496adce-a0f8-43e1-a267-da8cfe336254', 'hr@example.com', '<bcrypt_hash>', 'hr_staff', 'be35bc44-2256-4036-9984-120c8ad01071', '40e41c68-7eb2-4db7-813d-1accf61e7729', true, 'active', 'Shawaii', 'Jackson', 'local', false),
('f9430ceb-a299-41b0-bba5-17cf074689ed', 'deptadmin@example.com', '<bcrypt_hash>', 'department_admin', 'be35bc44-2256-4036-9984-120c8ad01071', '40e41c68-7eb2-4db7-813d-1accf61e7729', true, 'active', 'Warner', 'Huh', 'local', false),
('7f189688-7e40-43c0-82c3-31b3edc79c95', 'divleader@example.com', '<bcrypt_hash>', 'division_leader', 'be35bc44-2256-4036-9984-120c8ad01071', '40e41c68-7eb2-4db7-813d-1accf61e7729', true, 'active', 'Taylor', 'Sission', 'local', false),
('c48d4d1f-bfe4-414a-bb5a-df6102346ef3', 'manager@example.com', '<bcrypt_hash>', 'manager', 'be35bc44-2256-4036-9984-120c8ad01071', '40e41c68-7eb2-4db7-813d-1accf61e7729', true, 'active', 'Bashirat', 'Hahn', 'local', false);

-- Departments
INSERT INTO departments (id, name, archived, created_at, updated_at) VALUES
('be35bc44-2256-4036-9984-120c8ad01071', 'OBGYN', false, '2025-08-30 19:52:10.591086', '2025-08-30 19:52:10.591086');

-- Divisions
INSERT INTO divisions (id, department_id, name, archived, created_at, updated_at) VALUES
('40e41c68-7eb2-4db7-813d-1accf61e7729', 'be35bc44-2256-4036-9984-120c8ad01071', 'MFM', false, '2025-08-30 19:52:21.827867', '2025-08-30 19:52:21.827867'),
('34a29348-7ce0-4f9e-acf3-ba11a8291fe2', 'be35bc44-2256-4036-9984-120c8ad01071', 'IT', false, '2025-08-31 12:05:12.209246', '2025-08-31 12:05:12.209246'),
('df45fe7f-6228-4bb5-9cb7-1900c0a52322', 'be35bc44-2256-4036-9984-120c8ad01071', 'REI', false, '2025-09-01 23:21:45.515905', '2025-09-01 23:21:45.515905'),
('34721d65-6d0e-49f6-bd72-adae9c0e6130', 'be35bc44-2256-4036-9984-120c8ad01071', 'Education', false, '2025-09-01 23:22:05.74172', '2025-09-01 23:22:05.74172');

-- Candidate Types
INSERT INTO candidate_types (id, name, created_at, updated_at) VALUES
('c86e478e-9e94-486b-92fd-bcdc21ae2b1e', 'Staff', '2025-08-30 20:01:22.774599', '2025-08-30 20:01:22.774599'),
('57e80d00-14ed-466e-bb24-5f43198c150e', 'Faculty', '2025-08-30 20:01:22.774599', '2025-08-30 20:01:22.774599'),
('dec48c31-8be4-45df-b02b-65e2907840f8', 'Clinical', '2025-08-30 20:01:22.774599', '2025-08-30 20:01:22.774599'),
('21268757-4ff6-45f2-bb6e-fdc3cd2b23ec', 'Faculty Clinical', '2025-08-30 20:01:22.774599', '2025-08-30 20:01:22.774599'),
('89cbd6f0-6ff3-4aca-8798-4f188aa464e0', 'Other', '2025-08-30 20:01:22.774599', '2025-08-30 20:01:22.774599');

-- Faculty Ranks
INSERT INTO faculty_ranks (id, name, created_at, updated_at) VALUES
('221a1009-31ea-4b55-9c97-7ba30ea926f1', 'Assistant', '2025-08-30 20:01:06.058364', '2025-08-30 20:01:06.058364'),
('2ca3f2c1-4b7c-4667-b409-ed9334ac1bc0', 'Associate', '2025-08-30 20:01:06.058364', '2025-08-30 20:01:06.058364'),
('1626ac6e-d642-4b91-aebe-7dd133b14cc5', 'Professor', '2025-08-30 20:01:06.058364', '2025-08-30 20:01:06.058364'),
('38c14c0a-41e8-40de-9eb2-98b001c8a370', 'Other', '2025-08-30 20:01:06.058364', '2025-08-30 20:01:06.058364');

-- Hiring Stages
INSERT INTO hiring_stages (id, name, order_index, description, is_active, created_at, updated_at) VALUES
('ab77705b-d002-4e52-bae8-03e245e25382', 'Letter Of Intent', 1, 'Initial letter confirming interest and outlining terms of potential employment.', true, '2025-08-30 20:01:21.282153', '2025-09-03 01:28:08.767'),
('6a6e6664-dc3a-43ce-9966-f9e824aceb40', 'Offer', 2, 'Formal employment offer extended to candidate with defined role and compensation.', true, '2025-08-30 20:01:21.282153', '2025-09-02 11:22:10.49'),
('8499a188-fcd2-4e71-a38c-d06a8d01cc46', 'Screening', 3, 'Reviewing applications and conducting initial interviews to assess candidate fit.', true, '2025-09-02 11:24:20.770382', '2025-09-02 11:25:32.964'),
('c3254a6d-dfa4-4e93-9c0c-7f236ab20220', 'Background Check', 4, 'Running reference, criminal, and employment history checks before finalizing hire.', true, '2025-09-02 11:25:15.290082', '2025-09-02 11:25:52.915'),
('278a4e4e-df48-42f8-85a5-88940e124b00', 'Admin Processing', 5, 'Collecting documents, verifying eligibility, and completing internal administrative requirements.', true, '2025-08-30 20:01:21.282153', '2025-09-02 11:26:38.086'),
('7c54a7eb-f41d-4197-8bc7-65288cc53d10', 'Credentialing', 6, 'Verifying licenses, certifications, and qualifications required for the role.', true, '2025-08-30 20:01:21.282153', '2025-09-02 11:26:48.216'),
('9c576b6f-713a-44df-896e-49be24dc9ae0', 'Onboarding', 7, 'Orienting new hire, providing training, and setting up access to systems.', true, '2025-08-30 20:01:21.282153', '2025-09-02 11:26:54.999'),
('59598f0a-dcec-4870-a952-9f5e9193c980', 'Letter of Offer', 8, 'Formal job offer issued; triggers internal hiring, credentialing, and compliance processes', true, '2025-09-03 01:36:35.536198', '2025-09-03 01:36:35.536198');

-- Task Categories
INSERT INTO task_categories (id, name, created_at, updated_at) VALUES
('c5c30581-126a-477a-a3da-c376e4ed864d', 'Documents', '2025-08-30 20:01:14.382736', '2025-08-30 20:01:14.382736'),
('d41f8ee2-a910-4391-a6c9-5e1f86934c1b', 'Meetings', '2025-08-30 20:01:14.382736', '2025-08-30 20:01:14.382736'),
('1938639a-3eee-4e62-ba8e-63bbdcde39d5', 'Admin', '2025-08-30 20:01:14.382736', '2025-08-30 20:01:14.382736'),
('59a00206-2d17-4f31-bbd9-ef1f11a0def8', 'Processing', '2025-08-30 20:01:14.382736', '2025-08-30 20:01:14.382736'),
('02b90821-03af-476c-b7cd-c8b2045c187e', 'Other', '2025-08-30 20:01:14.382736', '2025-08-30 20:01:14.382736');

-- Task Priorities
INSERT INTO task_priorities (id, name, created_at, updated_at) VALUES
('a6e96729-7170-48af-87c6-a165722a9a79', 'low', '2025-08-30 22:35:36.819126', '2025-08-30 22:35:36.819126'),
('64aa685d-4822-4ee2-95b1-130a0578be08', 'medium', '2025-08-30 22:35:36.819126', '2025-08-30 22:35:36.819126'),
('818419bf-eb51-407e-8a8e-34c0a1f0de97', 'high', '2025-08-30 22:35:36.819126', '2025-08-30 22:35:36.819126'),
('37db81d5-0367-421c-af3f-22017dc855d9', 'critical', '2025-08-30 22:35:36.819126', '2025-08-30 22:35:36.819126');

-- Task Definitions (Sample)
INSERT INTO task_definitions (id, name, description, archived, created_by, created_at, updated_at) VALUES
('9fc86560-dc53-4cb6-86cb-5549e20382f4', 'Collect I-9 Documents', 'Collect and verify I-9 employment eligibility documents', false, '917566dd-00a2-42fc-9289-e08cb465671a', '2025-08-30 20:24:49.170763', '2025-08-30 22:50:47.211894'),
('63823e18-144e-4160-9898-a2368dfc04f0', 'Order ID Badge', 'Order and prepare employee identification badge', false, '917566dd-00a2-42fc-9289-e08cb465671a', '2025-08-30 20:24:49.170763', '2025-08-30 22:50:47.20842'),
('f81c3e49-f4b8-410f-a5b9-5bd1744a89f9', 'Setup Email Account', 'Create email account and provide login credentials to new employee', false, '917566dd-00a2-42fc-9289-e08cb465671a', '2025-08-30 20:24:49.170763', '2025-08-30 22:50:47.272201'),
('ee681d15-2b17-41b3-9101-e8e4cfcb5e1e', 'Set up workstation', 'Configure new employee''s computer, accounts, security access, and workspace with necessary tools and equipment.', false, '917566dd-00a2-42fc-9289-e08cb465671a', '2025-08-30 20:59:20.548812', '2025-08-30 22:50:47.246431'),
('17e7e6cd-3d0e-481f-8f89-224caace3976', 'Enroll in Benefits', 'Guide employee through benefits enrollment (health, retirement, etc.).', false, null, '2025-09-01 22:30:54.038898', '2025-09-01 22:30:54.038898'),
('e48aaaff-ae46-4c28-b836-8a776e5e5035', 'Orientation Session', 'Schedule and conduct orientation session for new employees.', false, null, '2025-09-01 22:30:54.038898', '2025-09-01 22:30:54.038898'),
('df660657-335f-40a9-9fa6-6a5c38d84033', 'Payroll Setup', 'Set up payroll, direct deposit, and tax withholding information.', false, null, '2025-09-01 22:30:54.038898', '2025-09-01 22:30:54.038898'),
('0d993b13-770f-4de8-817a-1ca5f0b3df4e', 'Review Employee Handbook', 'Provide handbook and obtain signed acknowledgment from employee.', false, null, '2025-09-01 22:30:54.038898', '2025-09-01 22:30:54.038898'),
('a6ba6c04-ef01-46d1-a06f-00b17237eebe', 'Manager Introduction', 'Arrange a meeting between the employee and their direct manager.', false, null, '2025-09-01 22:30:54.038898', '2025-09-01 22:30:54.038898');

-- Templates (Sample)
INSERT INTO templates (id, name, candidate_type_id, is_active, archived, description, created_at, updated_at) VALUES
('a1fe11dd-e91b-4a83-ac74-10fec65feca9', 'Staff - Base', 'c86e478e-9e94-486b-92fd-bcdc21ae2b1e', true, false, null, '2025-08-30 20:04:53.971804', '2025-08-30 20:04:53.971804'),
('19e0f73d-2cc8-4877-bc27-fb1caa12e90c', 'Staff - New', 'c86e478e-9e94-486b-92fd-bcdc21ae2b1e', true, false, 'v2', '2025-08-30 23:38:06.92644', '2025-08-30 23:38:06.92644'),
('dec7f52b-0b08-4577-997c-27bad326f4cd', 'Faculty - Base v2', '57e80d00-14ed-466e-bb24-5f43198c150e', true, false, 'Standardized hiring and onboarding process tailored for faculty roles, including credentialing and academic requirements.', '2025-09-01 22:32:56.783593', '2025-09-02 15:55:08.553862'),
('38b3a4f2-a671-451d-a768-2c02f25d5338', 'Faculty - Base', '21268757-4ff6-45f2-bb6e-fdc3cd2b23ec', true, false, 'Standardized onboarding tasks for new clinical faculty, covering credentialing, compliance, and patient-care readiness.', '2025-09-02 15:59:54.883393', '2025-09-02 16:36:18.096562'),
('85c361ed-7157-47a4-b32c-be3c2593b9c7', 'Faculty - Associate - Pro & Ten', '57e80d00-14ed-466e-bb24-5f43198c150e', true, false, 'Promotion & Tenure – Faculty Affairs and HR review candidate''s rank and qualifications; required for Associate Professor or higher', '2025-08-31 19:43:53.604962', '2025-09-03 01:34:04.36825');

-- =====================================================================
-- STATISTICS SUMMARY
-- =====================================================================

-- Database contains:
-- - 8 Users across different roles
-- - 21 Candidates in various stages
-- - 17 Templates for different candidate types
-- - 114 Individual candidate tasks
-- - 19 Reusable task definitions
-- - 8 Hiring stages
-- - 4 Departments/Divisions
-- - Multi-provider authentication support
-- - Comprehensive audit trails and timestamps

-- Key Features:
-- 1. Role-Based Access Control (RBAC) with 6 user roles
-- 2. Multi-provider authentication (Local, LDAP, Google, Azure AD)
-- 3. Template-driven onboarding workflows
-- 4. Task management with priorities and due dates
-- 5. Candidate lifecycle tracking with stage history
-- 6. Organizational structure (departments/divisions)
-- 7. Comprehensive audit trail
-- 8. Mobile-responsive UI support

-- End of Database Export