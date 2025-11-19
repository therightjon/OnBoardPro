# Integration Guide

This guide demonstrates how to integrate the AuthorizationService and Domain Events system into your route handlers.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Authorization Service Integration](#authorization-service-integration)
- [Domain Events Integration](#domain-events-integration)
- [Complete Examples](#complete-examples)
- [Best Practices](#best-practices)

## Prerequisites

The integration requires the following systems to be initialized:

**Event System** (in `server/index.ts`):
```typescript
import { eventBus, registerNotificationHandlers, createLoggingMiddleware } from "./events";

// Initialize event system with logging
eventBus.use(createLoggingMiddleware({
  enabled: env.NODE_ENV === "development",
  level: "info",
  logPayload: false // Don't log payloads for privacy
}));

// Register notification handlers
registerNotificationHandlers(eventBus);
log('✓ Event system initialized');
```

This setup is already complete in the current codebase.

## Authorization Service Integration

### Pattern: Authorize Before Processing

The AuthorizationService provides role-based access control with department and division scoping.

### Basic Pattern

```typescript
import { authorizationService } from "../services/authorization";

app.get("/api/resource/:id", async (req, res) => {
  // 1. Build authorization context from authenticated user
  const authContext = authorizationService.buildContext(req.user);

  // 2. Fetch the resource
  const resource = await storage.getResource(req.params.id);
  if (!resource) {
    return res.status(404).json({ message: "Resource not found" });
  }

  // 3. Authorize access (helper sends 403 if unauthorized)
  const authorized = await authorizationService.authorizeCandidateOrRespond(
    req, res, authContext, resource, "view"
  );
  if (!authorized) {
    return; // Response already sent by helper
  }

  // 4. Process authorized request
  return res.json(resource);
});
```

### Example: GET /api/candidates/:id

**Location:** `server/routes/candidates.routes.ts:61-90`

```typescript
app.get("/api/candidates/:id", async (req: Request, res: Response) => {
  try {
    // Build authorization context
    const authContext = authorizationService.buildContext(req.user);

    // Fetch candidate
    const candidate = await storage.getCandidate(req.params.id);
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Authorize access
    const authorized = await authorizationService.authorizeCandidateOrRespond(
      req, res, authContext, candidate, "view"
    );
    if (!authorized) {
      return; // 403 response already sent
    }

    // Return authorized data
    return res.json(candidate);
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to fetch candidate",
      error: error.message
    });
  }
});
```

### Available Authorization Methods

```typescript
// For candidate resources
authorizationService.authorizeCandidateOrRespond(
  req, res, context, candidate, action
);

// For generic authorization (returns boolean)
const canAccess = await authorizationService.authorize(
  context,
  resource,
  action
);

// Build context from user
const context = authorizationService.buildContext(req.user);
```

### Authorization Actions

- `"view"` - Read access to resource
- `"edit"` - Modify resource
- `"delete"` - Delete resource
- `"create"` - Create new resource (for collections)

## Domain Events Integration

### Pattern: Publish After Successful Operations

Domain events provide decoupled notification and audit logging for important business operations.

### Basic Pattern

```typescript
import { eventBus, candidateCreated } from "../events";

app.post("/api/resource", async (req, res) => {
  // 1. Perform the operation
  const resource = await storage.createResource(req.body);

  // 2. Publish domain event with actor context
  await eventBus.publish(candidateCreated(resource.id, {
    // Event payload
    ...resourceData
  }, {
    actorId: req.user?.id // Who performed the action
  }));

  // 3. Return response
  return res.status(201).json(resource);
});
```

### Example: POST /api/candidates

**Location:** `server/routes/candidates.routes.ts:92-160`

```typescript
app.post("/api/candidates", async (req: Request, res: Response) => {
  try {
    // Validate and create candidate
    const candidateData = insertCandidateSchema.parse(req.body);
    const candidate = await storage.createCandidate(candidateData);

    // Publish candidateCreated event
    await eventBus.publish(candidateCreated(candidate.id, {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      departmentId: candidate.departmentId,
      divisionId: candidate.divisionId,
      managerId: candidate.managerId
    }, {
      actorId: req.user?.id
    }));

    return res.status(201).json(candidate);
  } catch (error) {
    // Error handling...
  }
});
```

### Example: PATCH /api/tasks/:id - Multiple Events

**Location:** `server/routes/tasks.routes.ts:283-339`

```typescript
app.patch("/api/tasks/:id", async (req: Request, res: Response) => {
  try {
    // Fetch existing task
    const existingTask = await storage.getTask(req.params.id);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Update task
    const updates = updateCandidateTaskSchema.parse(req.body);
    const task = await storage.updateTask(req.params.id, updates);

    // Publish taskAssigned event if assignment changed
    if (task.assigneeUserId && task.assigneeUserId !== existingTask.assigneeUserId) {
      await eventBus.publish(taskAssigned(task.id, {
        candidateId: task.candidateId,
        taskTitle: task.title,
        assigneeUserId: task.assigneeUserId,
        previousAssigneeId: existingTask.assigneeUserId,
        dueAt: task.dueAt
      }, {
        actorId: req.user?.id
      }));
    }

    // Publish taskStatusChanged event if status changed
    if (task.status !== existingTask.status) {
      await eventBus.publish(taskStatusChanged(task.id, {
        candidateId: task.candidateId,
        taskTitle: task.title,
        previousStatus: existingTask.status,
        newStatus: task.status,
        assigneeUserId: task.assigneeUserId
      }, {
        actorId: req.user?.id
      }));
    }

    // Publish taskCompleted event if task was completed
    if (task.status === 'done' && task.completedAt) {
      const wasOverdue = task.dueAt && task.dueAt < task.completedAt;
      await eventBus.publish(taskCompleted(task.id, {
        candidateId: task.candidateId,
        taskTitle: task.title,
        completedBy: req.user!.id,
        completedAt: task.completedAt,
        dueAt: task.dueAt,
        wasOverdue: wasOverdue
      }, {
        actorId: req.user?.id
      }));
    }

    return res.json(task);
  } catch (error) {
    // Error handling...
  }
});
```

### Available Event Factories

**Candidate Events:**
```typescript
candidateCreated(candidateId, payload, context)
candidateStatusChanged(candidateId, payload, context)
candidateStageChanged(candidateId, payload, context)
candidateTemplateApplied(candidateId, payload, context)
candidateArchived(candidateId, payload, context)
candidateRestored(candidateId, payload, context)
candidateFollowed(candidateId, payload, context)
candidateUnfollowed(candidateId, payload, context)
```

**Task Events:**
```typescript
taskCreated(taskId, payload, context)
taskAssigned(taskId, payload, context)
taskStatusChanged(taskId, payload, context)
taskCompleted(taskId, payload, context)
taskDueDateChanged(taskId, payload, context)
taskDeleted(taskId, payload, context)
```

**Comment Events:**
```typescript
commentCreated(commentId, payload, context)
```

**Template Events:**
```typescript
templateCreated(templateId, payload, context)
templateUpdated(templateId, payload, context)
templateCloned(templateId, payload, context)
```

**User Events:**
```typescript
userCreated(userId, payload, context)
userLoggedIn(userId, payload, context)
userRoleChanged(userId, payload, context)
```

See `docs/DOMAIN_EVENTS.md` for complete event type definitions.

## Complete Examples

### Example 1: Combining Authorization + Events

```typescript
import { authorizationService } from "../services/authorization";
import { eventBus, candidateStageChanged } from "../events";

app.patch("/api/candidates/:id/stage", async (req, res) => {
  try {
    // 1. Build auth context
    const authContext = authorizationService.buildContext(req.user);

    // 2. Fetch candidate
    const candidate = await storage.getCandidate(req.params.id);
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // 3. Authorize edit action
    const authorized = await authorizationService.authorizeCandidateOrRespond(
      req, res, authContext, candidate, "edit"
    );
    if (!authorized) {
      return;
    }

    // 4. Perform the update
    const { stageId } = req.body;
    const previousStageId = candidate.currentStageId;
    const updatedCandidate = await storage.updateCandidate(candidate.id, {
      currentStageId: stageId
    });

    // 5. Publish domain event
    const stage = await storage.getStage(stageId);
    await eventBus.publish(candidateStageChanged(candidate.id, {
      candidateId: candidate.id,
      previousStageId,
      newStageId: stageId,
      stageName: stage?.name || "Unknown",
      automated: false
    }, {
      actorId: req.user?.id
    }));

    // 6. Return success
    return res.json(updatedCandidate);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update candidate stage",
      error: error.message
    });
  }
});
```

### Example 2: Conditional Event Publishing

```typescript
app.patch("/api/tasks/:id", async (req, res) => {
  const existingTask = await storage.getTask(req.params.id);
  const updatedTask = await storage.updateTask(req.params.id, req.body);

  // Only publish events for meaningful changes
  if (updatedTask.assigneeUserId !== existingTask.assigneeUserId) {
    await eventBus.publish(taskAssigned(updatedTask.id, {
      candidateId: updatedTask.candidateId,
      taskTitle: updatedTask.title,
      assigneeUserId: updatedTask.assigneeUserId,
      previousAssigneeId: existingTask.assigneeUserId,
      dueAt: updatedTask.dueAt
    }, {
      actorId: req.user?.id
    }));
  }

  return res.json(updatedTask);
});
```

### Example 3: Error Handling

```typescript
app.post("/api/candidates", async (req, res) => {
  try {
    // Create candidate
    const candidate = await storage.createCandidate(req.body);

    // Publish event (errors are caught and logged, won't break flow)
    await eventBus.publish(candidateCreated(candidate.id, {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email
    }, {
      actorId: req.user?.id
    }));

    return res.status(201).json(candidate);
  } catch (error) {
    // Handle validation or database errors
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors
      });
    }

    return res.status(500).json({
      message: "Failed to create candidate"
    });
  }
});
```

## Best Practices

### Authorization

1. **Always authorize before processing** - Build context, fetch resource, authorize, then process
2. **Use appropriate action types** - `"view"` for reads, `"edit"` for updates, `"delete"` for deletes
3. **Check authorization early** - Fail fast if user lacks permission
4. **Use helper methods** - `authorizeCandidateOrRespond` handles 403 responses automatically
5. **Don't bypass authorization** - Every protected route should check permissions

### Domain Events

1. **Publish after success** - Only publish events for completed operations
2. **Include actor context** - Always pass `{ actorId: req.user?.id }` for audit trails
3. **Use appropriate event types** - Choose the most specific event for the action
4. **Include relevant data** - Provide enough context in payload for handlers to act
5. **Don't rely on event handlers for critical logic** - Events are for notifications and side effects
6. **Events are async** - They don't block the response (unless using sync mode)
7. **Let handlers fail gracefully** - Event handler errors are logged but don't break the main flow

### Combined Usage

1. **Order matters** - Authorize first, then process, then publish events
2. **Keep handlers independent** - Don't couple event handlers to request/response cycle
3. **Test both paths** - Test authorization failures and event publishing separately
4. **Log appropriately** - Use event logging middleware for observability
5. **Document event payload** - Make it clear what data each event provides

### Migration Strategy

When integrating into existing routes:

1. **Start with reads** - Add authorization to GET endpoints first (lowest risk)
2. **Add events to creates** - Publish create events for new resources
3. **Add events to updates** - Publish change events for modifications
4. **Gradually migrate notifications** - Let event handlers create notifications, then remove old code
5. **Test incrementally** - Verify each integration works before moving to next route
6. **Keep existing code** - Run both old and new systems in parallel initially

### Performance Considerations

1. **Event bus is non-blocking** - Default async mode processes events in background
2. **Concurrency limit** - EventBus limits concurrent handler execution (default: 10)
3. **Authorization caching** - Context building is lightweight, but consider caching for heavy queries
4. **Batch operations** - For bulk updates, consider publishing single event vs many
5. **Monitor event handler performance** - Use logging middleware to track slow handlers

## Troubleshooting

### Events not triggering notifications

Check:
1. Event handlers are registered: `registerNotificationHandlers(eventBus)` in server startup
2. Event type matches handler registration (case-sensitive)
3. Event payload includes required fields
4. Database has notifications table
5. Check server logs for event processing errors

### Authorization always failing

Check:
1. User context includes required fields (id, role, departmentId, divisionId)
2. Resource has required access control fields (departmentId, divisionId)
3. User has appropriate role for action
4. Department/division scoping is correct
5. Check authorization service logs

### Events causing performance issues

Check:
1. Event handlers are async and not blocking
2. Concurrency limit is appropriate for workload
3. Individual handlers complete quickly
4. Consider using sync mode only for critical operations
5. Use logging middleware to identify slow handlers

## Reference Documentation

- **Authorization Service**: See `server/services/authorization/README.md`
- **Domain Events**: See `docs/DOMAIN_EVENTS.md`
- **Event Types**: See `server/events/event-types.ts`
- **Event Factories**: See `server/events/event-factory.ts`

## Migration Checklist

- [ ] Event system initialized in server/index.ts
- [ ] Notification handlers registered
- [ ] Logging middleware configured
- [ ] Authorization service imported in routes
- [ ] Event factories imported in routes
- [ ] GET endpoints use authorization
- [ ] POST endpoints publish create events
- [ ] PATCH/PUT endpoints publish change events
- [ ] DELETE endpoints publish delete events
- [ ] Integration tests updated
- [ ] Old notification code gradually removed
- [ ] Performance monitored

## Questions?

For implementation questions or issues:
1. Check the reference documentation above
2. Review existing integration examples in candidates and tasks routes
3. Run tests to verify event system is working: `npm test`
4. Check server logs for event processing information
