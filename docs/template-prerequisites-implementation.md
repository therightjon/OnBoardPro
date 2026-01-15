# Template Prerequisites Implementation Guide

## Overview

This document describes the implementation of **template prerequisites** - tasks that can be configured in templates to expand immediately upon candidate creation (before LOO acceptance) when certain conditions are met.

### Use Case

For Associate Professor and higher faculty positions, a Promotion & Tenure (P&T) approval process must occur BEFORE the Letter of Offer (LOO) can be issued. Since P&T takes ~30 days, these tasks need to be created when the candidate record is created (using LOI date), not when LOO is accepted.

### Solution

Templates can define **prerequisite tasks** that:
- Are configured as part of the template (not hardcoded)
- Expand immediately on candidate creation when conditions are met
- Use LOI date as their anchor (not LOO date)
- Are separate from the main template expansion
- Support conditional logic (e.g., "only for Associate Professor+")

---

## Database Schema Changes

### 1. Add Fields to `template_tasks` Table

```sql
-- Add prerequisite fields
ALTER TABLE template_tasks
ADD COLUMN is_prerequisite BOOLEAN DEFAULT false,
ADD COLUMN prerequisite_condition VARCHAR(50);

-- Add index for efficient prerequisite queries
CREATE INDEX idx_template_tasks_prerequisites 
ON template_tasks(template_id, is_prerequisite) 
WHERE is_prerequisite = true;

-- Add comment for documentation
COMMENT ON COLUMN template_tasks.is_prerequisite IS 
  'If true, this task expands immediately on candidate creation (not on LOO acceptance)';

COMMENT ON COLUMN template_tasks.prerequisite_condition IS 
  'Condition that must be met for prerequisite task to be created. Options: requires_pt, international_md, research_faculty, always, never';
```

### 2. Add Fields to `candidates` Table

```sql
-- Track prerequisite expansion separately from main template expansion
ALTER TABLE candidates
ADD COLUMN template_prerequisites_expanded_at TIMESTAMP,
ADD COLUMN loi_date DATE;

-- Add comments
COMMENT ON COLUMN candidates.template_prerequisites_expanded_at IS 
  'Timestamp when prerequisite tasks were created for this candidate';

COMMENT ON COLUMN candidates.loi_date IS 
  'Letter of Intent date - used as anchor for prerequisite task due dates';
```

### 3. Add Flag to `candidate_tasks` Table

```sql
-- Distinguish prerequisite tasks from regular template tasks
ALTER TABLE candidate_tasks
ADD COLUMN is_prerequisite_task BOOLEAN DEFAULT false;

-- Index for filtering
CREATE INDEX idx_candidate_tasks_prerequisite 
ON candidate_tasks(candidate_id, is_prerequisite_task);

COMMENT ON COLUMN candidate_tasks.is_prerequisite_task IS 
  'If true, this task was created from a template prerequisite (expanded on candidate creation)';
```

---

## Type Definitions

### 1. Prerequisite Condition Type

```typescript
// shared/types/prerequisite-conditions.types.ts

export type PrerequisiteCondition = 
  | 'requires_pt'           // Associate Professor or higher
  | 'international_md'      // Foreign medical graduate
  | 'research_faculty'      // Research faculty type
  | 'always'               // Always apply prerequisites
  | 'never';               // Never apply (effectively disabled)

export interface PrerequisiteConditionMetadata {
  condition: PrerequisiteCondition;
  label: string;
  description: string;
  evaluator: (candidate: Candidate) => boolean;
}
```

### 2. Update Template Task Type

```typescript
// shared/types/template-task.types.ts

export interface TemplateTask {
  id: string;
  templateId: string;
  templateStageId: string;
  taskDefId: string;
  orderIndex: number;
  dueRuleType: DueRuleType;
  dueRuleValue: number | null;
  fixedDate: Date | null;
  defaultAssigneeKind: 'user' | 'role';
  defaultAssigneeUserId: string | null;
  defaultAssigneeRole: string | null;
  defaultPriorityId: string;
  defaultCategoryId: string | null;
  isActive: boolean;
  
  // NEW: Prerequisite fields
  isPrerequisite: boolean;
  prerequisiteCondition: PrerequisiteCondition | null;
}
```

### 3. Update Due Rule Types

```typescript
// shared/types/due-rule.types.ts

export type DueRuleType = 
  // LOI-based rules (for prerequisites)
  | 'on_loi_date'          // NEW
  | 'days_after_loi'       // NEW
  | 'days_before_loi'      // NEW (rare, but for completeness)
  
  // LOO-based rules
  | 'on_loo_date'
  | 'days_before_loo'
  | 'days_after_loo'
  
  // Start date-based rules
  | 'on_start_date'
  | 'days_before_start'
  | 'days_after_start'
  
  // Special rules
  | 'credentialing_window'
  | 'fixed_date';
```

### 4. Update Candidate Type

```typescript
// shared/types/candidate.types.ts

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  rank: string;  // e.g., "Assistant Professor", "Associate Professor", etc.
  candidateTypeId: string;
  
  // Template tracking
  templateAppliedFromId: string | null;
  templateAppliedAt: Date | null;
  templatePrerequisitesExpandedAt: Date | null;  // NEW
  templateLocked: boolean;
  
  // Key dates
  loiDate: Date | null;  // NEW
  offerLetterIssuedAt: Date | null;
  offerLetterAcceptedAt: Date | null;
  anticipatedStartDate: Date | null;
  actualStartDate: Date | null;
  
  // ... other fields
}
```

---

## Service Implementation

### 1. Prerequisite Conditions Service

```typescript
// server/services/templates/prerequisite-conditions.service.ts

import { Candidate } from '@/shared/types/candidate.types';
import { PrerequisiteCondition, PrerequisiteConditionMetadata } from '@/shared/types/prerequisite-conditions.types';

export class PrerequisiteConditionsService {
  
  /**
   * Evaluate whether a prerequisite condition is met for a candidate
   */
  evaluateCondition(
    condition: PrerequisiteCondition,
    candidate: Candidate
  ): boolean {
    switch (condition) {
      case 'requires_pt':
        return this.requiresPTApproval(candidate.rank);
      
      case 'international_md':
        return candidate.isInternationalMD === true;
      
      case 'research_faculty':
        return candidate.candidateType === 'Research Faculty';
      
      case 'always':
        return true;
      
      case 'never':
        return false;
      
      default:
        console.warn(`Unknown prerequisite condition: ${condition}`);
        return false;
    }
  }
  
  /**
   * Check if candidate rank requires P&T approval
   */
  private requiresPTApproval(rank: string): boolean {
    const ptRequiredRanks = [
      'Associate Professor',
      'Professor', 
      'Distinguished Professor'
    ];
    
    return ptRequiredRanks.includes(rank);
  }
  
  /**
   * Get metadata for all available prerequisite conditions
   */
  getAvailableConditions(): PrerequisiteConditionMetadata[] {
    return [
      {
        condition: 'requires_pt',
        label: 'Requires P&T Approval',
        description: 'Task only created for Associate Professor or higher ranks',
        evaluator: (candidate) => this.requiresPTApproval(candidate.rank)
      },
      {
        condition: 'international_md',
        label: 'International Medical Graduate',
        description: 'Task only created for international medical graduates',
        evaluator: (candidate) => candidate.isInternationalMD === true
      },
      {
        condition: 'research_faculty',
        label: 'Research Faculty Only',
        description: 'Task only created for research faculty',
        evaluator: (candidate) => candidate.candidateType === 'Research Faculty'
      },
      {
        condition: 'always',
        label: 'Always Apply',
        description: 'Task always created regardless of candidate attributes',
        evaluator: () => true
      }
    ];
  }
}
```

### 2. Update Template Expansion Service

```typescript
// server/services/templates/template-expansion.service.ts

import { PrerequisiteConditionsService } from './prerequisite-conditions.service';

export class TemplateExpansionService {
  private prerequisiteConditionsService: PrerequisiteConditionsService;
  
  constructor() {
    this.prerequisiteConditionsService = new PrerequisiteConditionsService();
  }
  
  /**
   * Expand prerequisite tasks immediately on candidate creation
   * 
   * @param candidateId - ID of the candidate
   * @param templateId - ID of the template to expand prerequisites from
   * @param loiDate - Letter of Intent date (anchor for prerequisite due dates)
   * @returns Object containing number of tasks created and conditions met
   */
  async expandPrerequisites(
    candidateId: string,
    templateId: string,
    loiDate: Date
  ): Promise<{
    tasksCreated: number;
    conditionsMet: string[];
    tasksSkipped: number;
  }> {
    
    // Get candidate to evaluate conditions
    const candidate = await this.getCandidate(candidateId);
    
    // Prevent duplicate expansion
    if (candidate.templatePrerequisitesExpandedAt) {
      throw new Error('Template prerequisites already expanded for this candidate');
    }
    
    // Get all prerequisite tasks from template
    const prereqTasks = await db.query(`
      SELECT 
        tt.*,
        td.name as task_name,
        td.description as task_description,
        ts.stage_id,
        ts.order_index as stage_order_index
      FROM template_tasks tt
      JOIN task_definitions td ON tt.task_def_id = td.id
      JOIN template_stages ts ON tt.template_stage_id = ts.id
      WHERE tt.template_id = $1 
        AND tt.is_prerequisite = true
        AND tt.is_active = true
      ORDER BY ts.order_index, tt.order_index
    `, [templateId]);
    
    if (prereqTasks.length === 0) {
      return { tasksCreated: 0, conditionsMet: [], tasksSkipped: 0 };
    }
    
    // Filter by conditions that apply to this candidate
    const applicableTasks: typeof prereqTasks = [];
    const conditionsMet = new Set<string>();
    let tasksSkipped = 0;
    
    for (const task of prereqTasks) {
      const conditionMet = this.prerequisiteConditionsService.evaluateCondition(
        task.prerequisite_condition,
        candidate
      );
      
      if (conditionMet) {
        applicableTasks.push(task);
        conditionsMet.add(task.prerequisite_condition);
      } else {
        tasksSkipped++;
      }
    }
    
    if (applicableTasks.length === 0) {
      // No conditions met, nothing to create
      await this.markPrerequisitesExpanded(candidateId, loiDate);
      return { 
        tasksCreated: 0, 
        conditionsMet: [], 
        tasksSkipped 
      };
    }
    
    // Create tasks using LOI as anchor
    const tasksToCreate = applicableTasks.map(task => ({
      candidateId,
      taskDefId: task.task_def_id,
      name: task.task_name,
      description: task.task_description,
      dueDate: this.computeDueFromRule(
        task.due_rule_type,
        task.due_rule_value,
        task.fixed_date,
        null,           // No LOO date yet
        null,           // No start date yet
        null,           // No stage date
        loiDate         // LOI as anchor for prerequisites
      ),
      assigneeUserId: this.resolveAssignee(task, candidateId),
      priorityId: task.default_priority_id,
      categoryId: task.default_category_id,
      stageId: task.stage_id,
      stageOrderIndex: task.stage_order_index,
      isFromTemplate: true,
      isPrerequisiteTask: true,  // Mark as prerequisite
      templateTaskId: task.id,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    // Bulk insert tasks
    await this.bulkCreateTasks(tasksToCreate);
    
    // Mark prerequisites as expanded
    await this.markPrerequisitesExpanded(candidateId, loiDate);
    
    // Log activity
    await this.logActivity({
      candidateId,
      action: 'template_prerequisites_expanded',
      metadata: {
        templateId,
        tasksCreated: tasksToCreate.length,
        conditionsMet: Array.from(conditionsMet)
      }
    });
    
    return { 
      tasksCreated: tasksToCreate.length,
      conditionsMet: Array.from(conditionsMet),
      tasksSkipped
    };
  }
  
  /**
   * Mark prerequisites as expanded for a candidate
   */
  private async markPrerequisitesExpanded(
    candidateId: string,
    loiDate: Date
  ): Promise<void> {
    await db.query(`
      UPDATE candidates 
      SET 
        template_prerequisites_expanded_at = NOW(),
        loi_date = $2
      WHERE id = $1
    `, [candidateId, loiDate]);
  }
  
  /**
   * Main template expansion - expands all NON-prerequisite tasks
   * 
   * This remains mostly unchanged from existing implementation,
   * just adds filter to exclude prerequisite tasks
   */
  async expandTemplate(
    candidateId: string,
    templateId: string,
    looDate: Date,
    startDate: Date | null
  ): Promise<TemplateExpansionResult> {
    
    // Existing validation...
    const candidate = await this.validateTemplateExpansion(candidateId, templateId);
    
    // Get all NON-prerequisite tasks (key change)
    const tasks = await db.query(`
      SELECT 
        tt.*,
        td.name as task_name,
        td.description as task_description,
        ts.stage_id,
        ts.order_index as stage_order_index
      FROM template_tasks tt
      JOIN task_definitions td ON tt.task_def_id = td.id
      JOIN template_stages ts ON tt.template_stage_id = ts.id
      WHERE tt.template_id = $1 
        AND tt.is_prerequisite = false  -- ← KEY: Skip prerequisites
        AND tt.is_active = true
      ORDER BY ts.order_index, tt.order_index
    `, [templateId]);
    
    // Rest of expansion logic remains the same...
    // Create tasks using LOO/Start anchors
    // Create stage snapshots
    // Update candidate
    // etc.
  }
  
  /**
   * Compute due date from rule - enhanced to support LOI anchor
   */
  private computeDueFromRule(
    ruleType: DueRuleType,
    ruleValue: number | null,
    fixedDate: Date | null,
    looAnchor: Date | null,
    startAnchor: Date | null,
    stageDate: Date | null,
    loiAnchor?: Date | null  // NEW parameter
  ): Date | null {
    
    switch (ruleType) {
      // NEW: LOI-based rules
      case 'on_loi_date':
        return loiAnchor || null;
      
      case 'days_after_loi':
        return loiAnchor && ruleValue !== null 
          ? addDays(loiAnchor, ruleValue) 
          : null;
      
      case 'days_before_loi':
        return loiAnchor && ruleValue !== null 
          ? subDays(loiAnchor, Math.abs(ruleValue)) 
          : null;
      
      // Existing LOO-based rules
      case 'on_loo_date':
        return looAnchor;
      
      case 'days_after_loo':
        return looAnchor && ruleValue !== null
          ? addDays(looAnchor, ruleValue)
          : null;
      
      case 'days_before_loo':
        return looAnchor && ruleValue !== null
          ? subDays(looAnchor, Math.abs(ruleValue))
          : null;
      
      // Existing Start-based rules
      case 'on_start_date':
        return startAnchor;
      
      case 'days_after_start':
        return startAnchor && ruleValue !== null
          ? addDays(startAnchor, ruleValue)
          : null;
      
      case 'days_before_start':
        return startAnchor && ruleValue !== null
          ? subDays(startAnchor, Math.abs(ruleValue))
          : null;
      
      // Existing special rules
      case 'credentialing_window':
        return this.computeCredentialingWindowDate(looAnchor, startAnchor);
      
      case 'fixed_date':
        return fixedDate;
      
      default:
        return null;
    }
  }
}
```

---

## API Endpoint Updates

### 1. Update Candidate Creation Endpoint

```typescript
// server/routes/candidates.routes.ts

router.post('/candidates', async (req, res) => {
  const { 
    rank, 
    loiDate, 
    templateId, 
    offerLetterAcceptedAt,
    anticipatedStartDate,
    ...candidateData 
  } = req.body;
  
  try {
    // Create candidate
    const candidate = await candidateService.create({
      ...candidateData,
      rank,
      loiDate,
      templateAppliedFromId: templateId,
      templateLocked: !!templateId
    });
    
    // Expand prerequisite tasks if LOI date and template provided
    let prereqResult = null;
    if (templateId && loiDate) {
      prereqResult = await templateExpansionService.expandPrerequisites(
        candidate.id,
        templateId,
        new Date(loiDate)
      );
    }
    
    // Full template expansion if LOO already accepted
    let expansionResult = null;
    if (templateId && offerLetterAcceptedAt) {
      expansionResult = await templateExpansionService.expandTemplate(
        candidate.id,
        templateId,
        new Date(offerLetterAcceptedAt),
        anticipatedStartDate ? new Date(anticipatedStartDate) : null
      );
    }
    
    return res.status(201).json({
      candidate,
      prerequisiteTasksCreated: prereqResult?.tasksCreated || 0,
      conditionsMet: prereqResult?.conditionsMet || [],
      prerequisiteTasksSkipped: prereqResult?.tasksSkipped || 0,
      templateTasksCreated: expansionResult?.tasksCreated || 0
    });
    
  } catch (error) {
    console.error('Error creating candidate:', error);
    return res.status(500).json({ 
      error: 'Failed to create candidate',
      details: error.message 
    });
  }
});
```

### 2. Add Prerequisite Preview Endpoint

```typescript
// server/routes/templates.routes.ts

/**
 * Preview prerequisite tasks for a template given candidate attributes
 * 
 * GET /api/templates/:id/prerequisite-preview
 * Query params: rank, candidateType, isInternationalMD
 */
router.get('/:id/prerequisite-preview', async (req, res) => {
  const { id: templateId } = req.params;
  const { rank, candidateType, isInternationalMD } = req.query;
  
  try {
    // Get prerequisite tasks from template
    const prereqTasks = await db.query(`
      SELECT 
        tt.*,
        td.name as task_name,
        td.description as task_description
      FROM template_tasks tt
      JOIN task_definitions td ON tt.task_def_id = td.id
      WHERE tt.template_id = $1 
        AND tt.is_prerequisite = true
        AND tt.is_active = true
      ORDER BY tt.order_index
    `, [templateId]);
    
    // Create mock candidate for condition evaluation
    const mockCandidate = {
      rank: rank as string,
      candidateType: candidateType as string,
      isInternationalMD: isInternationalMD === 'true'
    };
    
    const conditionsService = new PrerequisiteConditionsService();
    
    // Evaluate which tasks would be created
    const preview = prereqTasks.map(task => ({
      taskId: task.id,
      taskName: task.task_name,
      description: task.task_description,
      prerequisiteCondition: task.prerequisite_condition,
      conditionMet: conditionsService.evaluateCondition(
        task.prerequisite_condition,
        mockCandidate as any
      ),
      dueRuleType: task.due_rule_type,
      dueRuleValue: task.due_rule_value
    }));
    
    const tasksToCreate = preview.filter(t => t.conditionMet).length;
    const tasksToSkip = preview.filter(t => !t.conditionMet).length;
    
    return res.json({
      templateId,
      totalPrerequisiteTasks: prereqTasks.length,
      tasksToCreate,
      tasksToSkip,
      preview
    });
    
  } catch (error) {
    console.error('Error previewing prerequisites:', error);
    return res.status(500).json({ 
      error: 'Failed to preview prerequisites',
      details: error.message 
    });
  }
});
```

---

## Frontend Components

### 1. Update Add Task Dialog

```typescript
// client/src/features/templates/components/AddTaskDialog.tsx

export function AddTaskDialog({ templateId, onSuccess }: AddTaskDialogProps) {
  const [isPrerequisite, setIsPrerequisite] = useState(false);
  const [prerequisiteCondition, setPrerequisiteCondition] = useState<PrerequisiteCondition>('requires_pt');
  const [dueRuleType, setDueRuleType] = useState<DueRuleType>('days_after_loo');
  
  // When task type changes, update available due rule options
  const availableDueRules = useMemo(() => {
    if (isPrerequisite) {
      return [
        { value: 'on_loi_date', label: 'On LOI Date' },
        { value: 'days_after_loi', label: 'Days After LOI' },
        { value: 'days_before_loi', label: 'Days Before LOI' }
      ];
    }
    return [
      { value: 'on_loo_date', label: 'On LOO Date' },
      { value: 'days_after_loo', label: 'Days After LOO' },
      { value: 'days_before_loo', label: 'Days Before LOO' },
      { value: 'on_start_date', label: 'On Start Date' },
      { value: 'days_after_start', label: 'Days After Start' },
      { value: 'days_before_start', label: 'Days Before Start' },
      { value: 'credentialing_window', label: 'Credentialing Window' },
      { value: 'fixed_date', label: 'Fixed Date' }
    ];
  }, [isPrerequisite]);
  
  return (
    <Dialog>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Task to Template</DialogTitle>
        </DialogHeader>
        
        <Form>
          {/* Task Definition Selector */}
          <FormField name="taskDefId">
            <FormLabel>Task</FormLabel>
            <Select>
              {/* Task definitions dropdown */}
            </Select>
          </FormField>
          
          {/* Stage Selector */}
          <FormField name="templateStageId">
            <FormLabel>Stage</FormLabel>
            <Select>
              {/* Stages dropdown */}
            </Select>
          </FormField>
          
          {/* Task Type Selection */}
          <FormField name="taskType">
            <FormLabel>Task Type</FormLabel>
            <RadioGroup 
              value={isPrerequisite ? "prerequisite" : "regular"}
              onValueChange={(value) => {
                setIsPrerequisite(value === "prerequisite");
                // Reset due rule when switching types
                setDueRuleType(value === "prerequisite" ? "on_loi_date" : "on_loo_date");
              }}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="regular" id="regular" />
                <Label htmlFor="regular">Regular Task</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prerequisite" id="prerequisite" />
                <Label htmlFor="prerequisite">Prerequisite Task</Label>
              </div>
            </RadioGroup>
            <FormDescription>
              {isPrerequisite 
                ? "Prerequisite tasks expand immediately on candidate creation (before LOO acceptance)"
                : "Regular tasks expand when Letter of Offer is accepted"
              }
            </FormDescription>
          </FormField>
          
          {/* Prerequisite Condition (only shown for prerequisites) */}
          {isPrerequisite && (
            <FormField name="prerequisiteCondition">
              <FormLabel>Prerequisite Condition</FormLabel>
              <Select 
                value={prerequisiteCondition}
                onValueChange={(value) => setPrerequisiteCondition(value as PrerequisiteCondition)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requires_pt">
                    <div>
                      <div className="font-medium">Requires P&T Approval</div>
                      <div className="text-sm text-muted-foreground">
                        Associate Professor or higher
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="international_md">
                    <div>
                      <div className="font-medium">International Medical Graduate</div>
                      <div className="text-sm text-muted-foreground">
                        Foreign medical graduates only
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="research_faculty">
                    <div>
                      <div className="font-medium">Research Faculty Only</div>
                      <div className="text-sm text-muted-foreground">
                        Research faculty type
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="always">
                    <div>
                      <div className="font-medium">Always Apply</div>
                      <div className="text-sm text-muted-foreground">
                        Create for all candidates
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Task will only be created if this condition is met for the candidate
              </FormDescription>
            </FormField>
          )}
          
          {/* Due Date Rule */}
          <FormField name="dueRuleType">
            <FormLabel>Due Date Rule</FormLabel>
            <Select value={dueRuleType} onValueChange={setDueRuleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableDueRules.map(rule => (
                  <SelectItem key={rule.value} value={rule.value}>
                    {rule.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              {isPrerequisite 
                ? "Prerequisite tasks use LOI date as anchor"
                : "Regular tasks use LOO or Start date as anchor"
              }
            </FormDescription>
          </FormField>
          
          {/* Days offset (if applicable) */}
          {dueRuleType.includes('days_') && (
            <FormField name="dueRuleValue">
              <FormLabel>Days Offset</FormLabel>
              <Input type="number" placeholder="e.g., 30" />
            </FormField>
          )}
          
          {/* Rest of form fields... */}
          {/* Assignee, Priority, Category, etc. */}
          
          <DialogFooter>
            <Button type="submit">Add Task</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

### 2. Update Candidate Creation Dialog

```typescript
// client/src/features/candidates/components/NewCandidateDialog.tsx

export function NewCandidateDialog({ onSuccess }: NewCandidateDialogProps) {
  const [loiDate, setLoiDate] = useState<Date | null>(null);
  const [rank, setRank] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [prerequisitePreview, setPrerequisitePreview] = useState<any[]>([]);
  
  // Fetch prerequisite preview when inputs change
  useEffect(() => {
    if (selectedTemplate && rank && loiDate) {
      fetchPrerequisitePreview();
    }
  }, [selectedTemplate, rank, loiDate]);
  
  const fetchPrerequisitePreview = async () => {
    const params = new URLSearchParams({
      rank,
      // Add other candidate attributes as needed
    });
    
    const response = await fetch(
      `/api/templates/${selectedTemplate}/prerequisite-preview?${params}`
    );
    const data = await response.json();
    setPrerequisitePreview(data.preview);
  };
  
  return (
    <Dialog>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Candidate</DialogTitle>
        </DialogHeader>
        
        <Form>
          {/* Basic candidate fields */}
          <FormField name="firstName">
            <FormLabel>First Name</FormLabel>
            <Input />
          </FormField>
          
          <FormField name="lastName">
            <FormLabel>Last Name</FormLabel>
            <Input />
          </FormField>
          
          {/* Rank Selection */}
          <FormField name="rank">
            <FormLabel>Faculty Rank</FormLabel>
            <Select value={rank} onValueChange={setRank}>
              <SelectTrigger>
                <SelectValue placeholder="Select rank" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Instructor">Instructor</SelectItem>
                <SelectItem value="Assistant Professor">Assistant Professor</SelectItem>
                <SelectItem value="Associate Professor">Associate Professor</SelectItem>
                <SelectItem value="Professor">Professor</SelectItem>
                <SelectItem value="Distinguished Professor">Distinguished Professor</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          
          {/* LOI Date */}
          <FormField name="loiDate">
            <FormLabel>Letter of Intent Date</FormLabel>
            <DatePicker 
              date={loiDate} 
              onDateChange={setLoiDate}
            />
            <FormDescription>
              Date the Letter of Intent was executed
            </FormDescription>
          </FormField>
          
          {/* LOO Date (optional at creation) */}
          <FormField name="offerLetterAcceptedAt">
            <FormLabel>Letter of Offer Accepted Date (Optional)</FormLabel>
            <DatePicker />
            <FormDescription>
              If LOO already accepted, template will expand immediately
            </FormDescription>
          </FormField>
          
          {/* Template Selection */}
          <FormField name="templateId">
            <FormLabel>Onboarding Template</FormLabel>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {/* Template options */}
              </SelectContent>
            </Select>
          </FormField>
          
          {/* Prerequisite Preview */}
          {selectedTemplate && loiDate && prerequisitePreview.length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Prerequisite Tasks
              </h4>
              <p className="text-sm text-muted-foreground mb-3">
                These tasks will be created immediately upon candidate creation:
              </p>
              
              <div className="space-y-2">
                {prerequisitePreview.map((task, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      "flex items-start gap-2 text-sm py-2 px-3 rounded",
                      task.conditionMet 
                        ? "bg-green-50 border border-green-200" 
                        : "bg-gray-50 border border-gray-200 opacity-50"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {task.conditionMet ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{task.taskName}</div>
                      <div className="text-xs text-muted-foreground">
                        Condition: {task.prerequisiteCondition} 
                        {task.conditionMet ? ' ✓' : ' (not met)'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-3 text-sm">
                <span className="font-medium">
                  {prerequisitePreview.filter(t => t.conditionMet).length} tasks
                </span>
                {' '}will be created immediately
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button type="submit">Create Candidate</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

### 3. Template Tasks Table - Show Prerequisite Badge

```typescript
// client/src/features/templates/components/TemplateTasksTable.tsx

export function TemplateTasksTable({ tasks }: TemplateTasksTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Due Rule</TableHead>
          <TableHead>Assignee</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>
              <div>
                <div className="font-medium">{task.name}</div>
                {task.description && (
                  <div className="text-sm text-muted-foreground">
                    {task.description}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell>{task.stageName}</TableCell>
            <TableCell>
              {task.isPrerequisite ? (
                <Badge variant="secondary" className="gap-1">
                  <Zap className="h-3 w-3" />
                  Prerequisite
                </Badge>
              ) : (
                <Badge variant="outline">Regular</Badge>
              )}
            </TableCell>
            <TableCell>
              <div>
                <div className="font-mono text-xs">
                  {task.dueRuleType}
                </div>
                {task.isPrerequisite && (
                  <div className="text-xs text-muted-foreground">
                    Condition: {task.prerequisiteCondition}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell>{task.assigneeName || task.assigneeRole}</TableCell>
            <TableCell>
              <DropdownMenu>
                {/* Edit/Delete actions */}
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## Example Template Configuration

Here's how the Clinical Faculty template would be configured with prerequisites:

```typescript
// Clinical Faculty Template - Stage 1: Letter of Offer

const stage1Tasks = [
  // ===== PREREQUISITE TASKS (expand on candidate creation) =====
  {
    taskDefId: "check-pt-required",
    templateStageId: "stage-1-uuid",
    orderIndex: 1,
    isPrerequisite: true,
    prerequisiteCondition: "requires_pt",
    dueRuleType: "on_loi_date",
    dueRuleValue: null,
    defaultAssigneeKind: "role",
    defaultAssigneeRole: "Chair's Office Admin Support",
    defaultPriorityId: "high",
    isActive: true
  },
  {
    taskDefId: "initiate-pt-process",
    templateStageId: "stage-1-uuid",
    orderIndex: 2,
    isPrerequisite: true,
    prerequisiteCondition: "requires_pt",
    dueRuleType: "days_after_loi",
    dueRuleValue: 1,
    defaultAssigneeKind: "role",
    defaultAssigneeRole: "Chair's Office Admin Support",
    defaultPriorityId: "high",
    isActive: true
  },
  {
    taskDefId: "pt-approval-received",
    templateStageId: "stage-1-uuid",
    orderIndex: 3,
    isPrerequisite: true,
    prerequisiteCondition: "requires_pt",
    dueRuleType: "days_after_loi",
    dueRuleValue: 30,
    defaultAssigneeKind: "role",
    defaultAssigneeRole: "HSOM Faculty Affairs",
    defaultPriorityId: "high",
    isActive: true
  },
  {
    taskDefId: "draft-loo",
    templateStageId: "stage-1-uuid",
    orderIndex: 4,
    isPrerequisite: true,
    prerequisiteCondition: "requires_pt",
    dueRuleType: "days_after_loi",
    dueRuleValue: 32,
    defaultAssigneeKind: "role",
    defaultAssigneeRole: "OBGYN HR",
    defaultPriorityId: "high",
    isActive: true
  },
  {
    taskDefId: "issue-loo",
    templateStageId: "stage-1-uuid",
    orderIndex: 5,
    isPrerequisite: true,
    prerequisiteCondition: "requires_pt",
    dueRuleType: "days_after_loi",
    dueRuleValue: 35,
    defaultAssigneeKind: "role",
    defaultAssigneeRole: "OBGYN HR",
    defaultPriorityId: "high",
    isActive: true
  },
  
  // ===== REGULAR TASK (expands on LOO acceptance) =====
  {
    taskDefId: "loo-accepted",
    templateStageId: "stage-1-uuid",
    orderIndex: 6,
    isPrerequisite: false,
    prerequisiteCondition: null,
    dueRuleType: "on_loo_date",
    dueRuleValue: null,
    defaultAssigneeKind: "role",
    defaultAssigneeRole: "candidate.self",
    defaultPriorityId: "high",
    isActive: true
  }
];
```

---

## Testing Checklist

### Unit Tests

- [ ] PrerequisiteConditionsService.evaluateCondition() for each condition type
- [ ] TemplateExpansionService.expandPrerequisites() with various candidate attributes
- [ ] computeDueFromRule() with LOI-based rules
- [ ] Condition evaluation edge cases (null values, unknown ranks, etc.)

### Integration Tests

- [ ] Create Associate Professor candidate with LOI date → prerequisite tasks created
- [ ] Create Assistant Professor candidate with LOI date → no prerequisite tasks created
- [ ] Create candidate without LOI date → no prerequisite tasks created
- [ ] Create candidate with LOI and LOO dates → both prerequisite and regular tasks created
- [ ] Prevent duplicate prerequisite expansion
- [ ] Verify prerequisite tasks have correct due dates based on LOI anchor
- [ ] Verify regular tasks use LOO/Start anchors (not affected by prerequisites)

### E2E Tests

- [ ] Full workflow: Create candidate → Prerequisite tasks appear → Accept LOO → Regular tasks appear
- [ ] Template editor: Add prerequisite task with condition
- [ ] Template editor: Edit prerequisite task
- [ ] Candidate creation dialog: Preview shows correct prerequisite tasks
- [ ] Candidate tasks list: Filter by prerequisite vs regular tasks
- [ ] Timeline validation with P&T: 100-120 day minimum enforced

---

## Migration Script

```sql
-- Migration: Add prerequisite fields to template system
-- Run date: [DATE]

BEGIN;

-- 1. Add columns to template_tasks
ALTER TABLE template_tasks
ADD COLUMN is_prerequisite BOOLEAN DEFAULT false,
ADD COLUMN prerequisite_condition VARCHAR(50);

-- 2. Add columns to candidates
ALTER TABLE candidates
ADD COLUMN template_prerequisites_expanded_at TIMESTAMP,
ADD COLUMN loi_date DATE;

-- 3. Add column to candidate_tasks
ALTER TABLE candidate_tasks
ADD COLUMN is_prerequisite_task BOOLEAN DEFAULT false;

-- 4. Create indexes
CREATE INDEX idx_template_tasks_prerequisites 
ON template_tasks(template_id, is_prerequisite) 
WHERE is_prerequisite = true;

CREATE INDEX idx_candidate_tasks_prerequisite 
ON candidate_tasks(candidate_id, is_prerequisite_task);

-- 5. Add comments
COMMENT ON COLUMN template_tasks.is_prerequisite IS 
  'If true, this task expands immediately on candidate creation (not on LOO acceptance)';

COMMENT ON COLUMN template_tasks.prerequisite_condition IS 
  'Condition that must be met for prerequisite task to be created. Options: requires_pt, international_md, research_faculty, always, never';

COMMENT ON COLUMN candidates.template_prerequisites_expanded_at IS 
  'Timestamp when prerequisite tasks were created for this candidate';

COMMENT ON COLUMN candidates.loi_date IS 
  'Letter of Intent date - used as anchor for prerequisite task due dates';

COMMENT ON COLUMN candidate_tasks.is_prerequisite_task IS 
  'If true, this task was created from a template prerequisite (expanded on candidate creation)';

COMMIT;
```

---

## Summary

This implementation adds template-driven prerequisite functionality that:

1. **Allows templates to define tasks that expand before LOO acceptance**
2. **Uses conditional logic to only create relevant tasks** (e.g., P&T tasks only for Associate+ faculty)
3. **Uses LOI date as anchor for prerequisite due dates**
4. **Maintains clean separation** between prerequisites and regular template expansion
5. **Is fully template-configurable** - no hardcoded P&T logic
6. **Can be extended** for other prerequisite scenarios (international MDs, research faculty, etc.)

The key insight is that prerequisites are just special template tasks with:
- `isPrerequisite: true` flag
- A `prerequisiteCondition` that gates creation
- LOI-based due rules instead of LOO/Start-based rules
- Immediate expansion on candidate creation instead of deferred

This approach gives maximum flexibility while keeping the implementation clean and maintainable.
