-- Authorization scope tables for multi-level data access

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_department_scopes'
  ) THEN
    CREATE TABLE public.user_department_scopes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT user_department_scopes_unique UNIQUE (user_id, department_id)
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_division_scopes'
  ) THEN
    CREATE TABLE public.user_division_scopes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      division_id uuid NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT user_division_scopes_unique UNIQUE (user_id, division_id)
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'manager_candidate_scopes'
  ) THEN
    CREATE TABLE public.manager_candidate_scopes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      manager_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT manager_candidate_scopes_unique UNIQUE (manager_id, candidate_id)
    );
  END IF;
END$$;

-- Backfill current single-assignment relationships into scope tables

INSERT INTO public.user_department_scopes (user_id, department_id)
SELECT DISTINCT u.id, u.department_id
FROM public.users u
WHERE u.department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_department_scopes uds
    WHERE uds.user_id = u.id AND uds.department_id = u.department_id
  );

INSERT INTO public.user_division_scopes (user_id, division_id)
SELECT DISTINCT u.id, u.division_id
FROM public.users u
WHERE u.division_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_division_scopes uds
    WHERE uds.user_id = u.id AND uds.division_id = u.division_id
  );

INSERT INTO public.manager_candidate_scopes (manager_id, candidate_id)
SELECT DISTINCT c.manager_id, c.id
FROM public.candidates c
WHERE c.manager_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.manager_candidate_scopes mcs
    WHERE mcs.manager_id = c.manager_id AND mcs.candidate_id = c.id
  );

-- Refresh updated_at columns on backfilled rows

UPDATE public.user_department_scopes SET updated_at = now() WHERE updated_at IS NULL;
UPDATE public.user_division_scopes SET updated_at = now() WHERE updated_at IS NULL;
UPDATE public.manager_candidate_scopes SET updated_at = now() WHERE updated_at IS NULL;

-- Helpful indexes for scope lookups

CREATE INDEX IF NOT EXISTS user_department_scopes_user_idx ON public.user_department_scopes (user_id);
CREATE INDEX IF NOT EXISTS user_department_scopes_department_idx ON public.user_department_scopes (department_id);

CREATE INDEX IF NOT EXISTS user_division_scopes_user_idx ON public.user_division_scopes (user_id);
CREATE INDEX IF NOT EXISTS user_division_scopes_division_idx ON public.user_division_scopes (division_id);

CREATE INDEX IF NOT EXISTS manager_candidate_scopes_manager_idx ON public.manager_candidate_scopes (manager_id);
CREATE INDEX IF NOT EXISTS manager_candidate_scopes_candidate_idx ON public.manager_candidate_scopes (candidate_id);
