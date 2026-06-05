# OnBoardPro — Steering Team Overview

Last Updated: 2026-05-07

A high-level overview of the OnBoardPro project for presentation to the project steering team.

---

## Table of Contents

- [Request Description](#request-description)
- [Business Justification](#business-justification)
- [Current State](#current-state)
- [Expected Benefits](#expected-benefits)
- [What It Is](#what-it-is)
- [What It Does](#what-it-does)
- [Tech Stack](#tech-stack)
- [Key Features](#key-features)
- [Security Protections](#security-protections)
- [How Our Department Benefits](#how-our-department-benefits)
- [Glossary](#glossary)

---

## Request Description

We are requesting steering team approval to **promote OnBoardPro from internal pilot to full production rollout** as the department's system of record for candidate onboarding.

This includes:

- Cutting over from spreadsheet/email-based tracking to OnBoardPro for all new hires going forward.
- Standing up production hosting, backups, monitoring, and SSO integration.
- Completing pre-launch security hardening (PostgreSQL Row-Level Security, third-party penetration test, remediation of findings).
- Onboarding HR staff, department admins, division leaders, and managers via training and documentation already produced.

## Business Justification

The current onboarding process relies on shared spreadsheets, email threads, and tribal knowledge. This creates four recurring problems:

1. **Tasks fall through the cracks** — there is no single source of truth for what's due, when, or who owns it. Missed steps cause delays in start dates, IT provisioning, and compliance paperwork.
2. **No leadership visibility** — questions like "how many candidates are in the pipeline?" or "what's our completion rate?" require manual data gathering each time they're asked.
3. **Inconsistent process** — every hire is handled slightly differently depending on which HR staff member owns it, increasing compliance risk.
4. **Sensitive candidate data is loosely controlled** — spreadsheets and email attachments are difficult to audit and easy to over-share.

OnBoardPro has already been built in-house and is functionally complete. The remaining cost to reach production is **incremental** (hardening + rollout) rather than a new build. Continuing on spreadsheets means continuing to absorb the operational and compliance cost above with no improvement.

## Current State

- **Build status** — feature-complete for the core workflow (candidates, tasks, templates, dashboards, notifications, RBAC, audit logging). Documentation, executive demo guide, and onboarding tutorials are written.
- **Pilot usage** — used internally by the development team; a structured pilot with HR is the proposed next step before broader rollout.
- **Security posture** — strong application-layer controls in place (session auth, CSRF, security headers, rate limiting, RBAC scope enforcement, audit logging). A documented hardening roadmap exists ([RLS_IMPLEMENTATION_PLAN.md](RLS_IMPLEMENTATION_PLAN.md), [SECURITY_PRIORITIES_CHECKLIST.md](SECURITY_PRIORITIES_CHECKLIST.md)) and pen-test scope is defined ([PENTEST_SCOPE_CHECKLIST.md](PENTEST_SCOPE_CHECKLIST.md)).
- **Identity integration** — local accounts, LDAP, and Google/Azure OAuth are all supported; production will use corporate SSO.
- **Outstanding before go-live** — production hosting & backup procedures, RLS implementation, third-party pen-test, HR training sessions, and a defined cutover plan from existing spreadsheets.

## Expected Benefits

**Operational**

- Eliminate missed onboarding steps through automated task generation and overdue alerts.
- Cut HR time spent assembling per-candidate task lists — templates do this automatically once an offer is accepted.
- Reduce inbound "what's the status of my new hire?" emails through self-service manager and candidate views.

**Leadership & Reporting**

- On-demand answers to pipeline volume, completion rate, and per-department hiring activity.
- Consistent metrics quarter-over-quarter without manual data assembly.

**Compliance & Risk**

- Every sensitive action is audit-logged.
- RBAC ensures candidate data is only visible to authorized staff — replacing the "anyone with the spreadsheet link" model.
- Pen-test report and RLS implementation provide documented assurance for compliance reviews.

**Strategic**

- A standardized, measurable onboarding process is a prerequisite for future improvements (SLA targets, automation expansion, integration with HRIS/IT provisioning systems).
- Internal ownership of the codebase avoids per-seat SaaS licensing costs and vendor lock-in.

---

## What It Is

OnBoardPro is an in-house **hiring pipeline & candidate onboarding management system**. It tracks candidates from initial Letter of Intent (LOI) through their first day and beyond, replacing ad-hoc spreadsheets, email threads, and shared inboxes with a structured, auditable workflow.

## What It Does

- **Centralizes the candidate journey** — every hire moves through standardized stages: LOI Issued → Offer Pending → Pre-Hire Tasks → Onboarding → Completed.
- **Automates onboarding tasks** — when a Letter of Offer is accepted, tasks auto-generate from a chosen template, with due dates calculated relative to LOI/LOO/Start dates.
- **Provides role-based dashboards** — each user (HR, Department Admin, Division Leader, Manager, Candidate) sees only what they're authorized to see.
- **Sends automated notifications & reminders** — background jobs scan deadlines, deliver email notifications, and surface overdue work.
- **Reusable templates & a task library** — HR builds workflows once (e.g., "Faculty Onboarding") and applies them consistently to every new hire.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TanStack Query, Wouter, Tailwind, Radix UI |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL with Drizzle ORM |
| Auth | Passport (local + LDAP + Google/Azure OAuth), session-based |
| Email | Nodemailer (configurable SMTP/TLS) |
| Async | Event bus + background jobs (deadline scanner, email, cleanup) |
| API Docs | OpenAPI / Swagger UI |
| Deployment | Docker Compose, monorepo with shared schema contracts |

## Key Features

- **Candidate management** — list, filter, detail views with timelines, comments, and stage progress.
- **Personal "My Tasks"** — every user sees what they own, with due-soon/overdue summaries.
- **Template engine** — drag-and-drop stages and tasks with relative due-date rules.
- **Dashboard & metrics** — active candidates, completion rate, division overview, urgent tasks.
- **Audit logging** — sensitive actions and access denials are logged.

## Security Protections

- **Session-based auth** with idle (2h) and absolute (24h) timeouts.
- **Role-based access control (RBAC)** with department/division/manager scoping enforced in routes, services, and repositories.
- **CSRF protection** on all state-changing API endpoints.
- **Helmet security headers** + strict Content Security Policy.
- **DB-backed rate limiting** (general + sensitive-endpoint tier).
- **Bcrypt password hashing**, sanitized HTML inputs, and input validation via Zod schemas.
- **Candidate self-view sanitization** so candidates only see their own data.
- **Hardening roadmap** — PostgreSQL Row-Level Security (RLS) is planned as defense-in-depth (see [RLS_IMPLEMENTATION_PLAN.md](RLS_IMPLEMENTATION_PLAN.md)).
- **Pen-test ready** — formal scope and checklist documented ([PENTEST_SCOPE_CHECKLIST.md](PENTEST_SCOPE_CHECKLIST.md)).

## How Our Department Benefits

- **Visibility** — leadership can answer "how many candidates are in pipeline?", "which departments are hiring most?", and "what's our completion rate?" without chasing spreadsheets.
- **Accountability** — nothing falls through the cracks; overdue tasks are automatically escalated, and every action is auditable.
- **Consistency** — standardized templates ensure every hire goes through the same compliance, paperwork, and IT setup steps.
- **Time savings** — HR no longer manually creates task lists per candidate; the template engine does it automatically once an offer is accepted.
- **Reduced risk** — RBAC and audit logs ensure sensitive candidate data is only accessible to authorized staff, supporting compliance and pen-test readiness.
- **Self-service for managers and candidates** — managers see their direct hires; candidates see their own onboarding progress, reducing inbound HR questions.

---

## Glossary

A reference for technical terms used throughout this document.

### Architecture & Frameworks

| Term | Definition |
|---|---|
| **React 18** | A JavaScript library for building user interfaces. It powers everything users see and click in OnBoardPro. |
| **Vite** | A modern build tool that compiles and serves the frontend code very quickly during development. |
| **TanStack Query** | A library that handles fetching, caching, and syncing data between the browser and the server, so the UI stays fast and up to date. |
| **Wouter** | A small library that handles in-app navigation (which page is shown when the user clicks a link). |
| **Tailwind** | A styling framework that lets developers design consistent, responsive UI quickly. |
| **Radix UI** | A library of accessible, pre-built interface components (dropdowns, dialogs, etc.) that meet accessibility standards. |
| **Node.js** | The runtime that executes the server-side JavaScript code. |
| **Express** | A web server framework for Node.js. It receives requests from the browser and routes them to the right code. |
| **TypeScript** | JavaScript with type safety added. It helps catch bugs before code is deployed. |
| **PostgreSQL** | The database that stores all candidate, task, user, and audit data. Industry-standard, open source, enterprise-grade. |
| **Drizzle ORM** | A tool that lets the server safely read and write to the PostgreSQL database without writing raw SQL. Helps prevent SQL injection. |
| **Monorepo** | A single code repository that holds the frontend, backend, and shared code together — keeping everything in sync. |

### Authentication & Authorization

| Term | Definition |
|---|---|
| **Auth (Authentication)** | Verifying *who* a user is — typically by username/password or single sign-on. |
| **Authorization** | Verifying *what* a user is allowed to do — e.g., can this manager see this candidate? |
| **Passport** | A widely used authentication library for Node.js. It plugs into multiple login methods (local password, LDAP, OAuth). |
| **Local Auth** | Standard username + password login, where credentials live in our own database. |
| **LDAP** | Lightweight Directory Access Protocol — a protocol used to authenticate against an organization's central directory (e.g., Active Directory), so users can log in with their existing corporate credentials. |
| **OAuth (Google / Azure)** | An industry-standard protocol that lets users log in using an existing Google or Microsoft account, without OnBoardPro ever seeing their password. |
| **SSO (Single Sign-On)** | Lets users sign in once with their corporate identity (via LDAP or OAuth) and access OnBoardPro without a separate password. |
| **Session** | A short-lived "logged-in" state stored on the server. The user's browser holds a session cookie that proves they're logged in. |
| **Session Timeout** | Automatic logout — *idle* (after 2 hours of inactivity) and *absolute* (forced re-login after 24 hours regardless of activity). |
| **RBAC (Role-Based Access Control)** | A security model where permissions are tied to roles (HR Staff, Department Admin, Manager, etc.) rather than to individual users. |
| **Bcrypt** | A password-hashing algorithm. We never store actual passwords — only a one-way scrambled hash that can't be reversed. |

### Web Security

| Term | Definition |
|---|---|
| **CSRF (Cross-Site Request Forgery)** | An attack where a malicious site tricks a logged-in user's browser into performing an unwanted action on OnBoardPro. **CSRF Protection** blocks this by requiring a secret token on every state-changing request. |
| **XSS (Cross-Site Scripting)** | An attack where malicious code is injected into a page. We prevent it by sanitizing user-submitted HTML and escaping output. |
| **SQL Injection** | An attack where bad input is crafted to manipulate database queries. Drizzle ORM and parameterized queries prevent this. |
| **Helmet** | A Node.js library that sets a bundle of HTTP **security headers** automatically — telling browsers to enforce stricter security rules. |
| **Security Headers** | Special instructions sent with every web response that tell the browser things like "don't allow this page to be embedded in another site" or "only load scripts from trusted sources." |
| **CSP (Content Security Policy)** | One specific security header that strictly controls which scripts, images, and resources the browser is allowed to load — a strong defense against XSS. |
| **Rate Limiting** | Caps how many requests a single user/IP can make in a time window. Blocks brute-force login attempts and abuse. |
| **Audit Logging** | A tamper-evident record of sensitive actions (logins, permission denials, data changes) for compliance and incident investigation. |
| **RLS (Row-Level Security)** | A PostgreSQL feature where the database itself enforces "this user can only see these rows." Planned as an additional defense-in-depth layer. |
| **Defense-in-Depth** | Layering multiple independent security controls so that if one fails, others still protect the system. |
| **Pen-Test (Penetration Test)** | A controlled, authorized simulated attack performed by security professionals to find vulnerabilities before real attackers do. |

### Data, Validation & Operations

| Term | Definition |
|---|---|
| **Zod** | A TypeScript library that validates incoming data shapes (e.g., "this field must be a valid email"). Stops malformed or malicious input at the door. |
| **ORM (Object-Relational Mapper)** | Software that translates between database rows and code objects, removing the need to write raw SQL. |
| **Schema** | The defined structure of the database (tables, columns, relationships). |
| **Migration** | A versioned change to the database schema — applied in order so every environment (dev, staging, prod) stays in sync. |
| **OpenAPI / Swagger** | An industry-standard format for describing what an API does. Swagger UI generates an interactive documentation page from it. |
| **Docker Compose** | A tool that runs the app and its database together in containers, making setup repeatable across machines. |
| **Background Jobs** | Long-running tasks that execute on the server independently of user requests — e.g., scanning for overdue tasks or sending reminder emails. |
| **Event Bus** | An internal messaging system that lets different parts of the server react to events (e.g., "LOO accepted") without being tightly coupled. |
| **Nodemailer** | The library used to send transactional emails (notifications, reminders) from the server. |
| **SMTP / TLS** | SMTP is the protocol email servers use to send mail. TLS is the encryption layer that protects it in transit. |

### Domain Terms

| Term | Definition |
|---|---|
| **Candidate** | A person going through the hiring/onboarding process. |
| **LOI** | Letter of Intent — the initial offer communication. |
| **LOO** | Letter of Offer — the formal employment offer. |
| **Stage** | A phase in the hiring pipeline (Pre-Hire, Onboarding, etc.). |
| **Template** | A reusable workflow defining stages and tasks for a category of hire. |
| **Anchor Date** | A key date (LOI, LOO, Start) used as the reference point to calculate task due dates. |
