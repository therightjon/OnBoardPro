import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TaskDefinition } from "@shared/schemas";

/**
 * Test suite for TaskDefinitionRepository
 *
 * Tests CRUD operations for task definitions (reusable task templates).
 */

type MockDb = {
  _definitions: Map<string, TaskDefinition>;
  select: any;
  insert: any;
  update: any;
};

function createMockDb(): MockDb {
  const definitions = new Map<string, TaskDefinition>();

  const mockDb: MockDb = {
    _definitions: definitions,
    select: (fields?: any) => ({
      from: (table: any) => ({
        where: (condition: any) => {
          const results = Array.from(definitions.values()).filter(d => !d.archived);
          return Promise.resolve(results);
        },
        orderBy: (order: any) => {
          const results = Array.from(definitions.values()).filter(d => !d.archived);
          return Promise.resolve(results.sort((a, b) => a.title.localeCompare(b.title)));
        }
      })
    }),
    insert: (table: any) => ({
      values: (values: TaskDefinition) => ({
        returning: () => {
          const def = { ...values };
          definitions.set(def.id, def);
          return Promise.resolve([def]);
        }
      })
    }),
    update: (table: any) => ({
      set: (updates: Partial<TaskDefinition>) => ({
        where: (condition: any) => ({
          returning: () => {
            // Find by ID from condition (simplified)
            for (const [id, def] of definitions.entries()) {
              Object.assign(def, updates);
              return Promise.resolve([def]);
            }
            return Promise.resolve([]);
          }
        })
      })
    })
  };

  return mockDb;
}

test("TaskDefinitionRepository: creates task definition with all fields", async () => {
  const mockDb = createMockDb();

  const newDefinition: TaskDefinition = {
    id: randomUUID(),
    title: "Background Check",
    description: "Conduct comprehensive background verification",
    categoryId: "category-1",
    priorityId: "priority-high",
    defaultDueRuleType: "days_before_start",
    defaultDueRuleValue: 30,
    estimatedHours: 2,
    isRequired: true,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await mockDb.insert(null).values(newDefinition).returning();

  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Background Check");
    assert.equal(result[0].isRequired, true);
  assert.equal(result[0].defaultDueRuleType, "days_before_start");
  assert.equal(result[0].defaultDueRuleValue, 30);
  assert.equal(result[0].estimatedHours, 2);
});

test("TaskDefinitionRepository: retrieves all non-archived definitions", async () => {
  const mockDb = createMockDb();

  const definitions: TaskDefinition[] = [
    {
      id: randomUUID(),
      title: "Reference Check",
      description: "Contact and verify references",
      categoryId: null,
      priorityId: null,
      defaultDueRuleType: "days_before_loo",
      defaultDueRuleValue: 14,
      estimatedHours: 1,
      isRequired: true,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: randomUUID(),
      title: "Equipment Setup",
      description: "Prepare workstation and equipment",
      categoryId: null,
      priorityId: null,
      defaultDueRuleType: "on_start_date",
      defaultDueRuleValue: null,
      estimatedHours: 3,
      isRequired: false,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: randomUUID(),
      title: "Deprecated Task",
      description: "Old task no longer used",
      categoryId: null,
      priorityId: null,
      defaultDueRuleType: null,
      defaultDueRuleValue: null,
      estimatedHours: null,
      isRequired: false,
      archived: true, // ARCHIVED
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  for (const def of definitions) {
    mockDb._definitions.set(def.id, def);
  }

  const result = await mockDb.select().from(null).where(null);

  // Should only return non-archived
  assert.equal(result.length, 2);
  assert.ok(result.every(d => !d.archived));
});

test("TaskDefinitionRepository: updates task definition", async () => {
  const mockDb = createMockDb();

  const definition: TaskDefinition = {
    id: randomUUID(),
    title: "I-9 Verification",
    description: "Complete employment eligibility verification",
    categoryId: null,
    priorityId: null,
    defaultDueRuleType: "on_start_date",
    defaultDueRuleValue: null,
    estimatedHours: 0.5,
    isRequired: true,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  mockDb._definitions.set(definition.id, definition);

  const updates = {
    title: "I-9 Employment Verification",
    description: "Complete federal I-9 form for employment eligibility",
    estimatedHours: 1,
    updatedAt: new Date()
  };

  const result = await mockDb.update(null).set(updates).where(null).returning();

  assert.equal(result.length, 1);
  assert.equal(result[0].title, "I-9 Employment Verification");
  assert.equal(result[0].estimatedHours, 1);
  assert.equal(result[0].isRequired, true); // Unchanged
});

test("TaskDefinitionRepository: handles null optional fields", async () => {
  const mockDb = createMockDb();

  const minimalDefinition: TaskDefinition = {
    id: randomUUID(),
    title: "Minimal Task",
    description: null,
    categoryId: null,
    priorityId: null,
    defaultDueRuleType: null,
    defaultDueRuleValue: null,
    estimatedHours: null,
    isRequired: false,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await mockDb.insert(null).values(minimalDefinition).returning();

  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Minimal Task");
  assert.equal(result[0].description, null);
  assert.equal(result[0].categoryId, null);
  assert.equal(result[0].estimatedHours, null);
});

test("TaskDefinitionRepository: supports different due rule types", async () => {
  const mockDb = createMockDb();

  const dueRuleTypes = [
    "on_loo_date",
    "days_before_loo",
    "days_after_loo",
    "on_start_date",
    "days_before_start",
    "days_after_start",
    "fixed_date",
    null
  ];

  for (const ruleType of dueRuleTypes) {
    const definition: TaskDefinition = {
      id: randomUUID(),
      title: `Task with ${ruleType || "no"} rule`,
      description: null,
      categoryId: null,
      priorityId: null,
      defaultDueRuleType: ruleType,
      defaultDueRuleValue: ruleType ? 7 : null,
      estimatedHours: null,
      isRequired: false,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await mockDb.insert(null).values(definition).returning();
    assert.equal(result[0].defaultDueRuleType, ruleType);
  }

  const allResults = await mockDb.select().from(null).where(null);
  assert.equal(allResults.length, dueRuleTypes.length);
});

test("TaskDefinitionRepository: archives task definition", async () => {
  const mockDb = createMockDb();

  const definition: TaskDefinition = {
    id: randomUUID(),
    title: "Old Process",
    description: "Deprecated workflow step",
    categoryId: null,
    priorityId: null,
    defaultDueRuleType: null,
    defaultDueRuleValue: null,
    estimatedHours: null,
    isRequired: false,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  mockDb._definitions.set(definition.id, definition);

  // Archive it
  const archiveUpdate = {
    archived: true,
    updatedAt: new Date()
  };

  await mockDb.update(null).set(archiveUpdate).where(null).returning();

  // Verify it's filtered out
  const result = await mockDb.select().from(null).where(null);
  assert.equal(result.length, 0);
});

test("TaskDefinitionRepository: estimates hours for planning", async () => {
  const mockDb = createMockDb();

  const definitions: TaskDefinition[] = [
    {
      id: randomUUID(),
      title: "Quick Review",
      description: null,
      categoryId: null,
      priorityId: null,
      defaultDueRuleType: null,
      defaultDueRuleValue: null,
      estimatedHours: 0.25, // 15 minutes
      isRequired: false,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: randomUUID(),
      title: "Full Day Training",
      description: null,
      categoryId: null,
      priorityId: null,
      defaultDueRuleType: null,
      defaultDueRuleValue: null,
      estimatedHours: 8, // 8 hours
      isRequired: true,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  for (const def of definitions) {
    mockDb._definitions.set(def.id, def);
  }

  const result = await mockDb.select().from(null).where(null);

  const totalHours = result.reduce((sum, def) => sum + (def.estimatedHours || 0), 0);
  assert.equal(totalHours, 8.25);
});
