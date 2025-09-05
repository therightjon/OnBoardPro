-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enums
CREATE TYPE role AS ENUM ('system_admin', 'hr_staff', 'department_admin', 'division_leader', 'manager', 'candidate');
CREATE TYPE candidate_status AS ENUM ('draft', 'active', 'on_hold', 'completed', 'canceled');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'canceled');
CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE due_rule_type AS ENUM ('days_before_start', 'days_after_start', 'days_before_stage', 'days_after_stage', 'fixed_date');

-- Create departments table
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    archived BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create divisions table
CREATE TABLE divisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id),
    name TEXT NOT NULL,
    archived BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(department_id, name)
);

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role role NOT NULL,
    department_id UUID REFERENCES departments(id),
    division_id UUID REFERENCES divisions(id),
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create candidate_types table
CREATE TABLE candidate_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create faculty_ranks table
CREATE TABLE faculty_ranks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create task_categories table
CREATE TABLE task_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create task_priorities table
CREATE TABLE task_priorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name priority NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create hiring_stages table
CREATE TABLE hiring_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create templates table
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    candidate_type_id UUID NOT NULL REFERENCES candidate_types(id),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    archived BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create candidates table
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    candidate_type_id UUID NOT NULL REFERENCES candidate_types(id),
    department_id UUID NOT NULL REFERENCES departments(id),
    division_id UUID REFERENCES divisions(id),
    manager_id UUID REFERENCES users(id),
    start_date DATE NOT NULL,
    status candidate_status DEFAULT 'active' NOT NULL,
    template_applied_from_id UUID REFERENCES templates(id),
    template_applied_at TIMESTAMPTZ,
    template_locked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create candidate_stage_history table
CREATE TABLE candidate_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id),
    from_stage_id UUID REFERENCES hiring_stages(id),
    to_stage_id UUID NOT NULL REFERENCES hiring_stages(id),
    changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create task_definitions table
CREATE TABLE task_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create template_tasks table
CREATE TABLE template_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id),
    task_def_id UUID NOT NULL REFERENCES task_definitions(id),
    stage_id UUID NOT NULL REFERENCES hiring_stages(id),
    due_rule_type due_rule_type NOT NULL,
    due_rule_value INTEGER,
    fixed_date DATE,
    default_assignee_id UUID REFERENCES users(id),
    default_priority priority,
    default_category_id UUID REFERENCES task_categories(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create candidate_tasks table
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
    due_at TIMESTAMPTZ,
    status task_status DEFAULT 'todo' NOT NULL,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    required BOOLEAN DEFAULT TRUE NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_department_id ON users(department_id);
CREATE INDEX idx_users_division_id ON users(division_id);
CREATE INDEX idx_candidates_email_department ON candidates(email, department_id);
CREATE INDEX idx_candidates_type_id ON candidates(candidate_type_id);
CREATE INDEX idx_candidates_department_id ON candidates(department_id);
CREATE INDEX idx_candidates_division_id ON candidates(division_id);
CREATE INDEX idx_candidates_manager_id ON candidates(manager_id);
CREATE INDEX idx_candidate_tasks_candidate_id ON candidate_tasks(candidate_id);
CREATE INDEX idx_candidate_tasks_assignee_id ON candidate_tasks(assignee_id) WHERE status != 'done';
CREATE INDEX idx_candidate_tasks_stage_id ON candidate_tasks(stage_id);
CREATE INDEX idx_candidate_tasks_category_id ON candidate_tasks(category_id);
CREATE INDEX idx_template_tasks_template_id ON template_tasks(template_id);
CREATE INDEX idx_template_tasks_task_def_id ON template_tasks(task_def_id);

-- Business days calculation function
CREATE OR REPLACE FUNCTION add_business_days(base_date TIMESTAMPTZ, delta INTEGER)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    result_date TIMESTAMPTZ;
    days_to_add INTEGER;
    day_of_week INTEGER;
BEGIN
    result_date := base_date;
    days_to_add := ABS(delta);
    
    WHILE days_to_add > 0 LOOP
        IF delta > 0 THEN
            result_date := result_date + INTERVAL '1 day';
        ELSE
            result_date := result_date - INTERVAL '1 day';
        END IF;
        
        day_of_week := EXTRACT(DOW FROM result_date);
        
        -- Skip weekends (0 = Sunday, 6 = Saturday)
        IF day_of_week != 0 AND day_of_week != 6 THEN
            days_to_add := days_to_add - 1;
        END IF;
    END LOOP;
    
    RETURN result_date;
END;
$$ LANGUAGE plpgsql;

-- Template expansion function
CREATE OR REPLACE FUNCTION expand_template(template_id_param UUID, candidate_id_param UUID)
RETURNS TABLE(task_id UUID, task_title TEXT, task_description TEXT) AS $$
DECLARE
    candidate_record RECORD;
    template_record RECORD;
    template_task_record RECORD;
    new_task_id UUID;
    calculated_due_at TIMESTAMPTZ;
BEGIN
    -- Get candidate info
    SELECT * INTO candidate_record FROM candidates WHERE id = candidate_id_param;
    
    -- Validation guards
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidate not found';
    END IF;
    
    IF candidate_record.template_locked THEN
        RAISE EXCEPTION 'Candidate template is already locked';
    END IF;
    
    IF candidate_record.start_date IS NULL THEN
        RAISE EXCEPTION 'Candidate start date is required';
    END IF;
    
    -- Check if candidate has existing tasks
    IF EXISTS (SELECT 1 FROM candidate_tasks WHERE candidate_id = candidate_id_param AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Candidate already has tasks - cannot apply template';
    END IF;
    
    -- Get template info
    SELECT * INTO template_record FROM templates WHERE id = template_id_param;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found';
    END IF;
    
    IF NOT template_record.is_active THEN
        RAISE EXCEPTION 'Template is not active';
    END IF;
    
    -- Create tasks from template
    FOR template_task_record IN 
        SELECT tt.*, td.name as task_name, td.description as task_description
        FROM template_tasks tt
        JOIN task_definitions td ON tt.task_def_id = td.id
        WHERE tt.template_id = template_id_param
    LOOP
        -- Calculate due date
        calculated_due_at := NULL;
        
        CASE template_task_record.due_rule_type
            WHEN 'days_before_start' THEN
                calculated_due_at := add_business_days(candidate_record.start_date::TIMESTAMPTZ, -template_task_record.due_rule_value);
            WHEN 'days_after_start' THEN
                calculated_due_at := add_business_days(candidate_record.start_date::TIMESTAMPTZ, template_task_record.due_rule_value);
            WHEN 'days_before_stage' THEN
                -- For MVP, anchor to start date
                calculated_due_at := add_business_days(candidate_record.start_date::TIMESTAMPTZ, -template_task_record.due_rule_value);
            WHEN 'days_after_stage' THEN
                -- For MVP, anchor to start date
                calculated_due_at := add_business_days(candidate_record.start_date::TIMESTAMPTZ, template_task_record.due_rule_value);
            WHEN 'fixed_date' THEN
                calculated_due_at := template_task_record.fixed_date::TIMESTAMPTZ;
        END CASE;
        
        -- Insert candidate task
        INSERT INTO candidate_tasks (
            candidate_id,
            task_def_id,
            title,
            description,
            stage_id,
            assignee_id,
            priority,
            category_id,
            due_at
        ) VALUES (
            candidate_id_param,
            template_task_record.task_def_id,
            template_task_record.task_name,
            template_task_record.task_description,
            template_task_record.stage_id,
            template_task_record.default_assignee_id,
            COALESCE(template_task_record.default_priority, 'medium'),
            template_task_record.default_category_id,
            calculated_due_at
        ) RETURNING id INTO new_task_id;
        
        -- Return task info
        task_id := new_task_id;
        task_title := template_task_record.task_name;
        task_description := template_task_record.task_description;
        RETURN NEXT;
    END LOOP;
    
    -- Lock the candidate template
    UPDATE candidates 
    SET 
        template_applied_from_id = template_id_param,
        template_applied_at = NOW(),
        template_locked = TRUE,
        updated_at = NOW()
    WHERE id = candidate_id_param;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Seed data
INSERT INTO task_categories (name) VALUES 
    ('Documents'),
    ('Meetings'),
    ('Admin'),
    ('Processing'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

INSERT INTO task_priorities (name) VALUES 
    ('low'),
    ('medium'),
    ('high'),
    ('critical')
ON CONFLICT (name) DO NOTHING;

INSERT INTO hiring_stages (name, order_index) VALUES 
    ('LOI', 1),
    ('Offer', 2),
    ('Admin Processing', 3),
    ('Credentialing', 4),
    ('Onboarding', 5)
ON CONFLICT (name) DO NOTHING;

INSERT INTO candidate_types (name) VALUES 
    ('Staff'),
    ('Faculty'),
    ('Clinical'),
    ('Faculty Clinical'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

INSERT INTO faculty_ranks (name) VALUES 
    ('Assistant'),
    ('Associate'),
    ('Professor'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

-- Create sample departments
INSERT INTO departments (name) VALUES 
    ('Human Resources'),
    ('Information Technology'),
    ('Cardiology'),
    ('Emergency Medicine')
ON CONFLICT (name) DO NOTHING;

-- Get department IDs for divisions
WITH dept_ids AS (
    SELECT id, name FROM departments WHERE name IN ('Cardiology', 'Emergency Medicine', 'Information Technology', 'Human Resources')
)
INSERT INTO divisions (department_id, name)
SELECT id, 'General' FROM dept_ids
ON CONFLICT (department_id, name) DO NOTHING;

-- Create base templates
WITH candidate_type_ids AS (
    SELECT id, name FROM candidate_types WHERE name IN ('Faculty', 'Staff')
)
INSERT INTO templates (name, candidate_type_id)
SELECT 'Faculty - Base', id FROM candidate_type_ids WHERE name = 'Faculty'
UNION ALL
SELECT 'Staff - Base', id FROM candidate_type_ids WHERE name = 'Staff'
ON CONFLICT (name) DO NOTHING;

-- Create sample task definitions
INSERT INTO task_definitions (name, description) VALUES 
    ('Background Check', 'Complete comprehensive background verification'),
    ('I-9 Form Completion', 'Complete Form I-9 Employment Eligibility Verification'),
    ('Drug Test', 'Schedule and complete pre-employment drug screening'),
    ('Reference Check', 'Contact and verify employment references'),
    ('Credential Verification', 'Verify professional licenses and certifications'),
    ('IT Setup', 'Create accounts and provide equipment'),
    ('Benefits Enrollment', 'Complete health insurance and benefits setup'),
    ('Orientation Session', 'Attend new employee orientation'),
    ('Department Introduction', 'Meet with department head and team'),
    ('Badge and Access', 'Create ID badge and setup building access')
ON CONFLICT (name) DO NOTHING;

-- Development users (password is "password123" hashed with bcrypt)
INSERT INTO users (email, name, password_hash, role, department_id) VALUES 
    ('sysadmin@example.com', 'System Administrator', '$2b$10$8K1p/a0dUeN5ue8GX3K.ouDEPNUjW5E2TqDqQw5p9n1e.qo8wHwoa', 'system_admin', NULL),
    ('hr@example.com', 'HR Staff', '$2b$10$8K1p/a0dUeN5ue8GX3K.ouDEPNUjW5E2TqDqQw5p9n1e.qo8wHwoa', 'hr_staff', (SELECT id FROM departments WHERE name = 'Human Resources' LIMIT 1)),
    ('manager@example.com', 'Department Manager', '$2b$10$8K1p/a0dUeN5ue8GX3K.ouDEPNUjW5E2TqDqQw5p9n1e.qo8wHwoa', 'manager', (SELECT id FROM departments WHERE name = 'Information Technology' LIMIT 1)),
    ('candidate@example.com', 'Test Candidate', '$2b$10$8K1p/a0dUeN5ue8GX3K.ouDEPNUjW5E2TqDqQw5p9n1e.qo8wHwoa', 'candidate', NULL)
ON CONFLICT (email) DO NOTHING;

-- Update departments for remaining users
UPDATE users 
SET department_id = (SELECT id FROM departments WHERE name = 'Cardiology' LIMIT 1)
WHERE email = 'deptadmin@example.com' AND department_id IS NULL;

UPDATE users 
SET division_id = (SELECT d.id FROM divisions d JOIN departments dept ON d.department_id = dept.id WHERE dept.name = 'Emergency Medicine' AND d.name = 'General' LIMIT 1)
WHERE email = 'divleader@example.com' AND division_id IS NULL;
