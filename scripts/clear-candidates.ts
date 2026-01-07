#!/usr/bin/env tsx
import 'dotenv/config';
import { db } from "../server/db/connection";
import {
  candidates,
  candidateTasks,
  candidateStageHistory,
  notifications,
  notificationOutbox,
  candidateFollowers,
  candidateTemplateStages,
} from "@shared/schema";
import { comments } from "@shared/schemas/comments.schema";
import { auditLog } from "@shared/schemas/audit.schema";
import { eq, inArray, or, and } from "drizzle-orm";

/**
 * Script to clear all candidate data and associated records from the database.
 * WARNING: This operation is irreversible!
 * 
 * Usage:
 *   npm run script:clear-candidates           # Shows warning, doesn't delete
 *   npm run script:clear-candidates -- --confirm  # Actually deletes data
 */

async function clearCandidates(shouldConfirm: boolean = true) {
  try {
    if (shouldConfirm) {
      console.log("⚠️  WARNING: This will delete ALL candidate data!");
      console.log("To proceed, run with --confirm flag:");
      console.log("  npm run script:clear-candidates -- --confirm");
      process.exit(0);
    }

    console.log("Starting candidate data cleanup...\n");

    // Get all candidate IDs first
    const allCandidates = await db.select({ id: candidates.id }).from(candidates);
    const candidateIds = allCandidates.map(c => c.id);

    if (candidateIds.length === 0) {
      console.log("✓ No candidates found. Database is already clean.");
      return;
    }

    console.log(`Found ${candidateIds.length} candidates to delete.\n`);

    // Delete in order of foreign key dependencies

    // 1. Delete comments on candidate tasks
    console.log("Deleting task comments...");
    const taskIdsResult = await db
      .select({ id: candidateTasks.id })
      .from(candidateTasks)
      .where(inArray(candidateTasks.candidateId, candidateIds));
    const taskIds = taskIdsResult.map(t => t.id);
    
    let deletedComments = { length: 0 };
    if (taskIds.length > 0) {
      deletedComments = await db
        .delete(comments)
        .where(inArray(comments.entityId, taskIds))
        .returning({ id: comments.id });
    }
    console.log(`✓ Deleted ${deletedComments.length} task comments\n`);

    // 2. Delete comments on candidates
    console.log("Deleting candidate comments...");
    const deletedCandidateComments = await db
      .delete(comments)
      .where(inArray(comments.entityId, candidateIds))
      .returning({ id: comments.id });
    console.log(`✓ Deleted ${deletedCandidateComments.length} candidate comments\n`);

    // 3. Delete candidate followers
    console.log("Deleting candidate followers...");
    const deletedFollowers = await db
      .delete(candidateFollowers)
      .where(inArray(candidateFollowers.candidateId, candidateIds))
      .returning({ candidateId: candidateFollowers.candidateId });
    console.log(`✓ Deleted ${deletedFollowers.length} follower relationships\n`);

    // 4. Delete candidate template stages
    console.log("Deleting candidate template stages...");
    const deletedTemplateStages = await db
      .delete(candidateTemplateStages)
      .where(inArray(candidateTemplateStages.candidateId, candidateIds))
      .returning({ id: candidateTemplateStages.id });
    console.log(`✓ Deleted ${deletedTemplateStages.length} template stages\n`);

    // 5. Delete candidate stage history
    console.log("Deleting candidate stage history...");
    const deletedHistory = await db
      .delete(candidateStageHistory)
      .where(inArray(candidateStageHistory.candidateId, candidateIds))
      .returning({ id: candidateStageHistory.id });
    console.log(`✓ Deleted ${deletedHistory.length} stage history records\n`);

    // 6. Delete audit log entries for tasks and candidates
    console.log("Deleting audit log entries...");
    const deletedAuditLogs = await db
      .delete(auditLog)
      .where(
        or(
          taskIds.length > 0 ? inArray(auditLog.taskId, taskIds) : undefined,
          inArray(auditLog.candidateId, candidateIds)
        )
      )
      .returning({ id: auditLog.id });
    console.log(`✓ Deleted ${deletedAuditLogs.length} audit log entries\n`);

    // 7. Delete tasks assigned to candidates
    console.log("Deleting candidate tasks...");
    const deletedTasks = await db
      .delete(candidateTasks)
      .where(inArray(candidateTasks.candidateId, candidateIds))
      .returning({ id: candidateTasks.id });
    console.log(`✓ Deleted ${deletedTasks.length} tasks\n`);

    // 8. Delete notifications related to candidates (entityType = 'candidate' and entityId in candidateIds)
    // Also delete task notifications (entityType = 'task' and entityId in taskIds)
    console.log("Deleting candidate notifications...");
    const deletedNotifications = await db
      .delete(notifications)
      .where(
        or(
          and(
            eq(notifications.entityType, 'candidate'),
            inArray(notifications.entityId, candidateIds)
          ),
          taskIds.length > 0 
            ? and(
                eq(notifications.entityType, 'task'),
                inArray(notifications.entityId, taskIds)
              )
            : undefined
        )
      )
      .returning({ id: notifications.id });
    console.log(`✓ Deleted ${deletedNotifications.length} notifications\n`);

    // 9. Delete notification outbox entries related to candidates
    console.log("Deleting notification outbox entries...");
    let deletedOutbox = { length: 0 };
    if (deletedNotifications.length > 0) {
      deletedOutbox = await db
        .delete(notificationOutbox)
        .where(inArray(notificationOutbox.notificationId, deletedNotifications.map(n => n.id)))
        .returning({ id: notificationOutbox.id });
    }
    console.log(`✓ Deleted ${deletedOutbox.length} notification outbox entries\n`);

    // 10. Finally, delete candidates
    console.log("Deleting candidates...");
    const deletedCandidates = await db
      .delete(candidates)
      .where(inArray(candidates.id, candidateIds))
      .returning({ id: candidates.id });
    console.log(`✓ Deleted ${deletedCandidates.length} candidates\n`);

    console.log("✅ Successfully cleared all candidate data!");
    console.log("\nSummary:");
    console.log(`  Candidates: ${deletedCandidates.length}`);
    console.log(`  Tasks: ${deletedTasks.length}`);
    console.log(`  Task Comments: ${deletedComments.length}`);
    console.log(`  Candidate Comments: ${deletedCandidateComments.length}`);
    console.log(`  Followers: ${deletedFollowers.length}`);
    console.log(`  Template Stages: ${deletedTemplateStages.length}`);
    console.log(`  Stage History: ${deletedHistory.length}`);
    console.log(`  Audit Log Entries: ${deletedAuditLogs.length}`);
    console.log(`  Notifications: ${deletedNotifications.length}`);
    console.log(`  Notification Outbox: ${deletedOutbox.length}`);

  } catch (error) {
    console.error("❌ Error clearing candidate data:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");

clearCandidates(!confirmed);
