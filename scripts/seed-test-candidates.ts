#!/usr/bin/env tsx
import 'dotenv/config';
import { db, pool } from "../server/db/connection";
import {
  candidates,
  departments,
  divisions,
  candidateTypes,
  facultyRanks,
  templates,
  users,
} from "@shared/schemas";
import { eq } from "drizzle-orm";

/**
 * Script to create five test candidates with randomly assigned templates.
 * Only creates candidates — does NOT expand templates or create tasks.
 *
 * Usage:
 *   npm run script:seed-candidates
 */

const TEST_CANDIDATES = [
  { salutation: "Dr." as const,   firstName: "Elena",   lastName: "Rodriguez", email: "elena.rodriguez@example.edu" },
  { salutation: "Mr." as const,   firstName: "James",   lastName: "Chen",      email: "james.chen@example.edu" },
  { salutation: "Ms." as const,   firstName: "Priya",   lastName: "Sharma",    email: "priya.sharma@example.edu" },
  { salutation: "Prof." as const, firstName: "David",    lastName: "Okonkwo",   email: "david.okonkwo@example.edu" },
  { salutation: "Mrs." as const,  firstName: "Sarah",    lastName: "Müller",    email: "sarah.muller@example.edu" },
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Returns a YYYY-MM-DD string offset by `daysOffset` from today. */
function dateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

async function main() {
  console.log("Fetching reference data...\n");

  const [allDepts, allDivisions, allTypes, allRanks, allTemplates, allUsers] = await Promise.all([
    db.select().from(departments).where(eq(departments.archived, false)),
    db.select().from(divisions).where(eq(divisions.archived, false)),
    db.select().from(candidateTypes),
    db.select().from(facultyRanks),
    db.select().from(templates).where(eq(templates.isActive, true)),
    db.select({ id: users.id }).from(users).where(eq(users.status, "active")),
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

  // Shuffle templates so each candidate gets a different one when possible
  const shuffledTemplates = [...allTemplates].sort(() => Math.random() - 0.5);

  const created: { name: string; id: string; template: string }[] = [];

  for (let i = 0; i < TEST_CANDIDATES.length; i++) {
    const person = TEST_CANDIDATES[i];
    const template = shuffledTemplates[i % shuffledTemplates.length];

    // Use the template's candidate type
    const candidateTypeId = template.candidateTypeId;

    // Pick a random department and optionally a division within it
    const dept = randomElement(allDepts);
    const deptDivisions = allDivisions.filter((d) => d.departmentId === dept.id);
    const division = deptDivisions.length > 0 ? randomElement(deptDivisions) : null;

    // Optional: random owner from active users
    const owner = allUsers.length > 0 ? randomElement(allUsers) : null;

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
        facultyRankId: allRanks.length > 0 ? randomElement(allRanks).id : null,
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
