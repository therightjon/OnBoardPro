import { test } from "node:test";
import assert from "node:assert/strict";
import { TemplateReadinessError, TemplateService } from "../../services/templates/template.service";

function createService(params: {
  stages: any[];
  tasks: any[];
}) {
  const templateRepo = {} as any;
  const stageRepo = {
    getTemplateStages: async (_templateId: string) => params.stages,
  } as any;
  const taskRepo = {
    getTemplateTasks: async (_templateId: string) => params.tasks,
  } as any;

  return new TemplateService(templateRepo, stageRepo, taskRepo);
}

test("TemplateService.checkTemplateReadiness: not ready when no stages", async () => {
  const service = createService({ stages: [], tasks: [] });
  const result = await service.checkTemplateReadiness("template-1");
  assert.deepEqual(result, { ready: false, reason: "Template must have at least one stage" });
});

test("TemplateService.checkTemplateReadiness: not ready when a stage has no tasks", async () => {
  const stages = [{ id: "ts-1" }];
  const service = createService({ stages, tasks: [] });
  const result = await service.checkTemplateReadiness("template-1");
  assert.deepEqual(result, { ready: false, reason: "Each stage should have at least one task" });
});

test("TemplateService.checkTemplateReadiness: ready when tasks have no default assignee user", async () => {
  const stages = [{ id: "ts-1" }];
  const tasks = [
    {
      templateStageId: "ts-1",
      dueRuleType: "on_start_date",
      dueRuleValue: null,
      fixedDate: null,
      defaultAssigneeKind: "user",
      defaultAssigneeUserId: null,
      defaultAssigneeRole: null,
    },
  ];
  const service = createService({ stages, tasks });
  const result = await service.checkTemplateReadiness("template-1");
  assert.deepEqual(result, { ready: true });
});

test("TemplateService.checkTemplateReadiness: not ready when fixed-date tasks are missing a fixed date", async () => {
  const stages = [{ id: "ts-1" }];
  const tasks = [
    {
      templateStageId: "ts-1",
      dueRuleType: "fixed_date",
      dueRuleValue: null,
      fixedDate: null,
      defaultAssigneeKind: "user",
      defaultAssigneeUserId: null,
      defaultAssigneeRole: null,
    },
  ];
  const service = createService({ stages, tasks });
  const result = await service.checkTemplateReadiness("template-1");
  assert.deepEqual(result, { ready: false, reason: "Fixed-date tasks must include a date" });
});

test("TemplateService.checkTemplateReadiness: ready when relative due rules have value 0", async () => {
  const stages = [{ id: "ts-1" }];
  const tasks = [
    {
      templateStageId: "ts-1",
      dueRuleType: "days_after_start",
      dueRuleValue: 0,
      fixedDate: null,
      defaultAssigneeKind: "user",
      defaultAssigneeUserId: null,
      defaultAssigneeRole: null,
    },
  ];
  const service = createService({ stages, tasks });
  const result = await service.checkTemplateReadiness("template-1");
  assert.deepEqual(result, { ready: true });
});

test("TemplateService.checkTemplateReadiness: ready when relative due rules omit values (treated as 0)", async () => {
  const stages = [{ id: "ts-1" }];
  const tasks = [
    {
      templateStageId: "ts-1",
      dueRuleType: "days_after_start",
      dueRuleValue: null,
      fixedDate: null,
      defaultAssigneeKind: "user",
      defaultAssigneeUserId: null,
      defaultAssigneeRole: null,
    },
  ];
  const service = createService({ stages, tasks });
  const result = await service.checkTemplateReadiness("template-1");
  assert.deepEqual(result, { ready: true });
});

test("TemplateService.activateTemplate: throws TemplateReadinessError when not ready", async () => {
  const stages = [];
  const service = createService({ stages, tasks: [] });
  await assert.rejects(async () => service.activateTemplate("template-1"), (err: any) => {
    assert.ok(err instanceof TemplateReadinessError);
    assert.equal(err.message, "Template must have at least one stage");
    return true;
  });
});
