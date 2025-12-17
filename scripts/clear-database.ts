#!/usr/bin/env tsx
import 'dotenv/config';
import { Client } from 'pg';
import readline from 'readline';

const dryRun = process.argv.includes('--dry-run');

interface DeletionResults {
  candidateFollowers: number;
  candidateTemplateStages: number;
  candidateStageHistory: number;
  managerCandidateScopes: number;
  candidateTasks: number;
  comments: number;
  auditLog: number;
  candidates: number;
  notificationOutbox: number;
  notificationKeys: number;
  notifications: number;
  userDepartmentScopes: number;
  userDivisionScopes: number;
  userPreferences: number;
  userRoles: number;
  userIdentities: number;
  nonAdminUsers: number;
  sessions: number;
}

async function confirmAction(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n⚠️  This action cannot be undone!\nType \'yes\' to confirm: ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function deleteTable(
  client: Client,
  tableName: string,
  isDryRun: boolean
): Promise<number> {
  if (isDryRun) {
    const result = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
    const count = parseInt(result.rows[0].count);
    console.log(`  [DRY RUN] Would delete ${count} records from ${tableName}`);
    return count;
  } else {
    const result = await client.query(`DELETE FROM "${tableName}"`);
    const count = result.rowCount || 0;
    console.log(`  Deleted ${count} records from ${tableName}`);
    return count;
  }
}

async function deleteWhere(
  client: Client,
  tableName: string,
  column: string,
  values: string[],
  isDryRun: boolean
): Promise<number> {
  if (values.length === 0) return 0;

  if (isDryRun) {
    const result = await client.query(
      `SELECT COUNT(*) FROM "${tableName}" WHERE "${column}" = ANY($1::uuid[])`,
      [values]
    );
    const count = parseInt(result.rows[0].count);
    console.log(`  [DRY RUN] Would delete ${count} records from ${tableName}`);
    return count;
  } else {
    const result = await client.query(
      `DELETE FROM "${tableName}" WHERE "${column}" = ANY($1::uuid[])`,
      [values]
    );
    const count = result.rowCount || 0;
    console.log(`  Deleted ${count} records from ${tableName}`);
    return count;
  }
}

async function clearDatabase(isDryRun: boolean = false) {
  console.log('DATABASE RESET SCRIPT');
  console.log('=====================\n');

  // Show what will be preserved
  console.log('✅ PRESERVED:');
  console.log('  - Task Library (templates, stages, tasks, definitions)');
  console.log('  - Settings (system_settings, auth_providers, smtp_settings)');
  console.log('  - Configuration (hiring_stages, task_categories, task_priorities, etc.)');
  console.log('  - Organizational Structure (departments, divisions)');
  console.log('  - System Administrator Users\n');

  // Show what will be cleared
  console.log('🗑️  WILL BE CLEARED:');
  console.log('  - All candidates and candidate-related data');
  console.log('  - All non-admin users and their data');
  console.log('  - All sessions');
  console.log('  - All notifications and comments');
  console.log('  - All audit logs\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Get confirmation unless dry-run
  if (!isDryRun && !(await confirmAction())) {
    console.log('Operation cancelled.');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set in the environment.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const results: DeletionResults = {
    candidateFollowers: 0,
    candidateTemplateStages: 0,
    candidateStageHistory: 0,
    managerCandidateScopes: 0,
    candidateTasks: 0,
    comments: 0,
    auditLog: 0,
    candidates: 0,
    notificationOutbox: 0,
    notificationKeys: 0,
    notifications: 0,
    userDepartmentScopes: 0,
    userDivisionScopes: 0,
    userPreferences: 0,
    userRoles: 0,
    userIdentities: 0,
    nonAdminUsers: 0,
    sessions: 0
  };

  try {
    await client.query('BEGIN');

    // Phase 1: Candidate-Related Data
    console.log('\n📊 Phase 1: Clearing Candidate Data...');

    results.candidateFollowers = await deleteTable(client, 'candidate_followers', isDryRun);
    results.candidateTemplateStages = await deleteTable(client, 'candidate_template_stages', isDryRun);
    results.candidateStageHistory = await deleteTable(client, 'candidate_stage_history', isDryRun);
    results.managerCandidateScopes = await deleteTable(client, 'manager_candidate_scopes', isDryRun);
    results.candidateTasks = await deleteTable(client, 'candidate_tasks', isDryRun);
    results.comments = await deleteTable(client, 'comments', isDryRun);
    results.auditLog = await deleteTable(client, 'audit_log', isDryRun);
    results.candidates = await deleteTable(client, 'candidates', isDryRun);

    // Phase 2: User-Related Data (Non-Admins)
    console.log('\n👥 Phase 2: Clearing Non-Admin Users...');

    // First get list of non-admin user IDs
    const nonAdminUserIdsResult = await client.query(
      `SELECT id FROM users WHERE role != 'system_admin'`
    );
    const userIdsList = nonAdminUserIdsResult.rows.map(row => row.id);

    if (userIdsList.length > 0) {
      // Delete user-related data for non-admins
      results.notificationOutbox = await deleteWhere(
        client,
        'notification_outbox',
        'user_id',
        userIdsList,
        isDryRun
      );
      results.notificationKeys = await deleteWhere(
        client,
        'notification_keys',
        'user_id',
        userIdsList,
        isDryRun
      );
      results.notifications = await deleteWhere(
        client,
        'notifications',
        'user_id',
        userIdsList,
        isDryRun
      );
      results.userDepartmentScopes = await deleteWhere(
        client,
        'user_department_scopes',
        'user_id',
        userIdsList,
        isDryRun
      );
      results.userDivisionScopes = await deleteWhere(
        client,
        'user_division_scopes',
        'user_id',
        userIdsList,
        isDryRun
      );
      results.userPreferences = await deleteWhere(
        client,
        'user_preferences',
        'user_id',
        userIdsList,
        isDryRun
      );
      results.userRoles = await deleteWhere(
        client,
        'user_roles',
        'user_id',
        userIdsList,
        isDryRun
      );
      results.userIdentities = await deleteWhere(
        client,
        'user_identities',
        'user_id',
        userIdsList,
        isDryRun
      );

      // Delete non-admin users
      if (!isDryRun) {
        const deleted = await client.query(
          `DELETE FROM users WHERE role != 'system_admin'`
        );
        results.nonAdminUsers = deleted.rowCount || 0;
      } else {
        results.nonAdminUsers = userIdsList.length;
      }
      console.log(`  Deleted ${results.nonAdminUsers} non-admin users`);
    } else {
      console.log('  No non-admin users to delete');
    }

    // Phase 3: Sessions
    console.log('\n🔐 Phase 3: Clearing Sessions...');

    results.sessions = await deleteTable(client, 'session', isDryRun);

    // Summary
    console.log('\n📋 SUMMARY:');
    console.log('===========');
    Object.entries(results).forEach(([table, count]) => {
      if (count > 0) {
        console.log(`  ${table}: ${count} records`);
      }
    });

    if (isDryRun) {
      console.log('\n✅ Dry run completed - no changes made');
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      console.log('\n✅ Database cleared successfully!');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error during database clear:', error);
    throw error;
  } finally {
    await client.end();
  }
}

clearDatabase(dryRun).catch((error) => {
  console.error(error);
  process.exit(1);
});
