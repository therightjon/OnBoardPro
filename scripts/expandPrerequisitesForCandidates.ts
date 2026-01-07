/**
 * Script to manually expand prerequisite tasks for candidates
 *
 * Usage: tsx scripts/expandPrerequisitesForCandidates.ts <candidateId1> <candidateId2> ...
 * Or: tsx scripts/expandPrerequisitesForCandidates.ts --all-faculty-associate
 */

import { db, pool } from "../server/config/database.config";
import { getTemplateExpansionService } from "../server/services/service-factory";
import { CandidateRepository } from "../server/repositories/candidates/CandidateRepository";
import { templates } from "../shared/schema";
import { eq } from "drizzle-orm";

async function expandPrerequisitesForCandidates(candidateIds: string[]) {
  const candidateRepo = new CandidateRepository(db);
  const templateExpansionService = getTemplateExpansionService();

  console.log(`\nExpanding prerequisites for ${candidateIds.length} candidate(s)...\n`);

  for (const candidateId of candidateIds) {
    try {
      console.log(`Processing candidate: ${candidateId}`);

      const candidate = await candidateRepo.getCandidate(candidateId);

      if (!candidate) {
        console.log(`  ❌ Candidate not found`);
        continue;
      }

      if (!candidate.templateAppliedFromId) {
        console.log(`  ⚠️  No template assigned`);
        continue;
      }

      if (!candidate.letterOfIntentDate) {
        console.log(`  ⚠️  No LOI date set`);
        continue;
      }

      if (candidate.templatePrerequisitesExpandedAt) {
        console.log(`  ⚠️  Prerequisites already expanded at ${candidate.templatePrerequisitesExpandedAt}`);
        console.log(`     Run resetDomainData.ts or manually reset template_prerequisites_expanded_at first`);
        continue;
      }

      console.log(`  📋 Candidate: ${candidate.firstName} ${candidate.lastName}`);
      console.log(`  📅 LOI Date: ${candidate.letterOfIntentDate}`);
      console.log(`  🎓 Faculty Rank: ${candidate.facultyRank?.name || 'Not set'} (requires_pt: ${candidate.facultyRank?.requiresPT || false})`);
      console.log(`  📝 Template: ${candidate.templateNameSnapshot || 'Unknown'}`);

      const result = await templateExpansionService.expandPrerequisites(
        candidateId,
        candidate.templateAppliedFromId
      );

      console.log(`  ✅ Success!`);
      console.log(`     Tasks created: ${result.tasksCreated}`);
      console.log(`     Tasks skipped: ${result.tasksSkipped}`);
      console.log(`     Conditions met: ${Array.from(result.conditionsMet).join(', ') || 'none'}`);
      console.log('');

    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      console.log('');
    }
  }

  await pool.end();
  process.exit(0);
}

async function getAllFacultyAssociateCandidates(): Promise<string[]> {
  const [template] = await db
    .select()
    .from(templates)
    .where(eq(templates.name, 'Faculty - Associate'));

  if (!template) {
    console.error('❌ Faculty - Associate template not found');
    return [];
  }

  const candidateRepo = new CandidateRepository(db);
  const candidates = await candidateRepo.getCandidates({
    includeArchived: false
  });

  return candidates
    .filter(c => c.templateAppliedFromId === template.id)
    .map(c => c.id);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: tsx scripts/expandPrerequisitesForCandidates.ts <candidateId1> <candidateId2> ...');
    console.error('   or: tsx scripts/expandPrerequisitesForCandidates.ts --all-faculty-associate');
    process.exit(1);
  }

  let candidateIds: string[];

  if (args[0] === '--all-faculty-associate') {
    console.log('Finding all Faculty - Associate candidates...');
    candidateIds = await getAllFacultyAssociateCandidates();
    console.log(`Found ${candidateIds.length} candidates\n`);
  } else {
    candidateIds = args;
  }

  await expandPrerequisitesForCandidates(candidateIds);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
