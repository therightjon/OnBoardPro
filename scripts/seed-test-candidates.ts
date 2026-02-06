#!/usr/bin/env tsx
import 'dotenv/config';
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { db, pool } from "../server/db/connection";
import {
  candidates,
  departments,
  divisions,
  candidateTypes,
  facultyRanks,
  templates,
  templateTasks,
  users,
} from "@shared/schemas";
import { and, eq } from "drizzle-orm";

/**
 * Script to create test candidates with randomly assigned templates.
 * Only creates candidates — does NOT expand templates or create tasks.
 *
 * Usage:
 *   npm run script:seed-candidates
 */

const SALUTATIONS = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof.", "Mx.", "Other"] as const;

const FIRST_NAMES = [
  "Elena", "James", "Priya", "David", "Sarah", "Amina", "Liam", "Nadia",
  "Marcus", "Jordan", "Maya", "Noah", "Aria", "Ethan", "Zara", "Owen",
  "Leah", "Isaac", "Sofia", "Caleb", "Nina", "Adrian", "Riya", "Miles",
];

const LAST_NAMES = [
  "Rodriguez", "Chen", "Sharma", "Okonkwo", "Muller", "Khan", "Garcia", "Petrov",
  "Taylor", "Lee", "Patel", "Nguyen", "Brooks", "Santos", "Bennett", "Hassan",
  "Rivera", "Campbell", "Kim", "Murphy", "Bailey", "Flores", "Ward", "Reed",
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

/** Returns a YYYY-MM-DD string offset by `daysOffset` from today. */
function dateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

function slugifyEmailPart(part: string): string {
  return part.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makeRandomCandidate(usedEmails: Set<string>) {
  const salutation = randomElement(SALUTATIONS);
  const firstName = randomElement(FIRST_NAMES);
  const lastName = randomElement(LAST_NAMES);
  const firstNameSlug = slugifyEmailPart(firstName);
  const lastNameSlug = slugifyEmailPart(lastName);
  const base = `${firstNameSlug}.${lastNameSlug}`;

  let email = `${base}@example.edu`;
  let suffix = 2;
  while (usedEmails.has(email)) {
    email = `${base}${suffix}@example.edu`;
    suffix += 1;
  }
  usedEmails.add(email);

  return { salutation, firstName, lastName, email };
}

async function promptCandidateCount(): Promise<number> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question("How many test candidates should be created? (default 10): ")).trim();

      if (!answer) return 10;

      const parsed = Number.parseInt(answer, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }

      console.log("Please enter a positive whole number.");
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const FACULTY_TYPE_NAMES = new Set(["Faculty", "Faculty Clinical"]);
  const targetCount = await promptCandidateCount();
  const usedEmails = new Set<string>();

  console.log("Fetching reference data...\n");

  const [allDepts, allDivisions, allTypes, allRanks, allTemplates, allUsers, ptPrereqTemplates] = await Promise.all([
    db.select().from(departments).where(eq(departments.archived, false)),
    db.select().from(divisions).where(eq(divisions.archived, false)),
    db.select().from(candidateTypes),
    db.select().from(facultyRanks),
    db.select().from(templates).where(and(eq(templates.isActive, true), eq(templates.archived, false))),
    db.select({ id: users.id }).from(users).where(eq(users.status, "active")),
    db
      .select({ templateId: templateTasks.templateId })
      .from(templateTasks)
      .where(and(
        eq(templateTasks.archived, false),
        eq(templateTasks.isPrerequisite, true),
        eq(templateTasks.prerequisiteCondition, "requires_pt")
      )),
  ]);

  if (allDepts.length === 0) {
    console.error("No departments found. Seed reference data first.");
    process.exit(1);
  }
  if (allTypes.length === 0) {
    console.error("No candidate types found. Seed reference data first.");
    process.exit(1);
  }
  if (allTemplates.length === 0) {
    console.error("No active templates found. Seed reference data first.");
    process.exit(1);
  }

  console.log(`  Departments:      ${allDepts.length}`);
  console.log(`  Divisions:        ${allDivisions.length}`);
  console.log(`  Candidate types:  ${allTypes.length}`);
  console.log(`  Faculty ranks:    ${allRanks.length}`);
  console.log(`  Active templates: ${allTemplates.length}`);
  console.log(`  Active users:     ${allUsers.length}\n`);

  const templateIdsWithPTPrerequisite = new Set(ptPrereqTemplates.map((t) => t.templateId));
  const candidateTypeById = new Map(allTypes.map((type) => [type.id, type]));
  const nonPTRanks = allRanks.filter((rank) => rank.requiresPT !== true);

  const templatesByCandidateType = allTemplates.reduce((acc, template) => {
    const list = acc.get(template.candidateTypeId) ?? [];
    list.push(template);
    acc.set(template.candidateTypeId, list);
    return acc;
  }, new Map<string, typeof allTemplates>());

  // Shuffle templates so candidate/template assignment varies each run.
  const shuffledTemplates = shuffle(allTemplates);

  const created: { name: string; id: string; template: string }[] = [];

  for (let i = 0; i < targetCount; i++) {
    const person = makeRandomCandidate(usedEmails);
    let template = shuffledTemplates[i % shuffledTemplates.length];

    // Use the template's candidate type
    const candidateTypeId = template.candidateTypeId;
    const candidateType = candidateTypeById.get(candidateTypeId);
    const isFacultyType = candidateType ? FACULTY_TYPE_NAMES.has(candidateType.name) : false;

    // Pick a random department and optionally a division within it
    const dept = randomElement(allDepts);
    const deptDivisions = allDivisions.filter((d) => d.departmentId === dept.id);
    const division = deptDivisions.length > 0 ? randomElement(deptDivisions) : null;

    // Optional: random owner from active users
    const owner = allUsers.length > 0 ? randomElement(allUsers) : null;

    // Match candidate rank/template pairing with candidate creation validation:
    // if rank requires PT approval, template must include requires_pt prerequisite.
    let selectedFacultyRankId: string | null = null;
    if (isFacultyType) {
      if (allRanks.length === 0) {
        console.error("Faculty template selected but no faculty ranks found.");
        process.exit(1);
      }

      const templateSupportsPTRule = templateIdsWithPTPrerequisite.has(template.id);
      if (!templateSupportsPTRule && nonPTRanks.length === 0) {
        const ptCompatibleTemplates = (templatesByCandidateType.get(candidateTypeId) ?? [])
          .filter((t) => templateIdsWithPTPrerequisite.has(t.id));

        if (ptCompatibleTemplates.length === 0) {
          console.error(
            `No template for candidate type "${candidateType?.name ?? candidateTypeId}" supports requires_pt prerequisites.`
          );
          process.exit(1);
        }

        template = randomElement(ptCompatibleTemplates);
      }

      const finalTemplateSupportsPTRule = templateIdsWithPTPrerequisite.has(template.id);
      if (finalTemplateSupportsPTRule) {
        selectedFacultyRankId = randomElement(allRanks).id;
      } else {
        selectedFacultyRankId = randomElement(nonPTRanks).id;
      }
    }

    // Random LOI date in the past 30 days
    const loiDate = dateString(-Math.floor(Math.random() * 30 + 1));

    const [inserted] = await db
      .insert(candidates)
      .values({
        salutation: person.salutation,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        candidateTypeId,
        departmentId: dept.id,
        divisionId: division?.id ?? null,
        facultyRankId: selectedFacultyRankId,
        managerId: owner?.id ?? null,
        primaryOwnerId: owner?.id ?? null,
        letterOfIntentDate: loiDate,
        templateAppliedFromId: template.id,
        templateNameSnapshot: template.name,
        status: "active",
      })
      .returning({ id: candidates.id });

    created.push({
      name: `${person.salutation} ${person.firstName} ${person.lastName}`,
      id: inserted.id,
      template: template.name,
    });

    console.log(`  Created ${person.firstName} ${person.lastName}  ->  template: "${template.name}"`);
  }

  console.log("\n--- Summary ---");
  for (const c of created) {
    console.log(`  ${c.name}  (${c.id})  — ${c.template}`);
  }

  console.log(`\nDone. ${created.length} candidates created (no template expansion).`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
