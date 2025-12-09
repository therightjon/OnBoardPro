/**
 * Service Factory
 * Purpose: Central DI container that wires repositories to services and provides test-swappable getters.
 * Belongs: Construction and exposure of service singletons; keep business logic in services themselves.
 * Conventions: Use activeFactory for test overrides; update constructors here when repos/services change; avoid embedding request-specific state.
 */

import { db, pool } from "../db/connection";

// Import repositories - Candidates
import { CandidateRepository } from "../repositories/candidates/CandidateRepository";
import { CandidateTaskRepository } from "../repositories/candidates/CandidateTaskRepository";
import { CandidateFollowerRepository } from "../repositories/candidates/CandidateFollowerRepository";
import { CandidateStageRepository } from "../repositories/candidates/CandidateStageRepository";

// Import repositories - Templates
import { TemplateRepository } from "../repositories/templates/TemplateRepository";
import { TemplateStageRepository } from "../repositories/templates/TemplateStageRepository";
import { TemplateTaskRepository } from "../repositories/templates/TemplateTaskRepository";

// Import repositories - Users
import { UserRepository } from "../repositories/users/UserRepository";
import { UserIdentityRepository } from "../repositories/users/UserIdentityRepository";
import { UserPreferencesRepository } from "../repositories/users/UserPreferencesRepository";
import { InvitationRepository } from "../repositories/users/InvitationRepository";

// Import repositories - Organizational
import { DepartmentRepository } from "../repositories/organizational/DepartmentRepository";
import { DivisionRepository } from "../repositories/organizational/DivisionRepository";

// Import repositories - Reference Data
import { ReferenceDataRepository } from "../repositories/reference/ReferenceDataRepository";
import { HiringStageRepository } from "../repositories/reference/HiringStageRepository";
import { TaskDefinitionRepository } from "../repositories/reference/TaskDefinitionRepository";

// Import repositories - Shared
import { NotificationRepository } from "../repositories/NotificationRepository";
import { CommentRepository } from "../repositories/CommentRepository";
import { SearchRepository } from "../repositories/SearchRepository";

// Import services
import { CandidateService } from "./candidates/candidate.service";
import { TaskService } from "./tasks/task.service";
import { TaskDueDateService } from "./tasks/task-due-date.service";
import { TemplateService } from "./templates/template.service";
import { TemplateExpansionService } from "./templates/template-expansion.service";
import { TemplateEstimationService } from "./templates/template-estimation.service";
import { UserService } from "./users/user.service";
import { InvitationService } from "./users/invitation.service";
import { OrganizationService } from "./organization/organization.service";
import { ReferenceDataService } from "./reference/reference-data.service";
import { NotificationService } from "./shared/notification.service";
import { CommentService } from "./shared/comment.service";
import { SearchService } from "./shared/search.service";
import { SystemSettingsService } from "./settings/system-settings.service";
import { AuthProviderService } from "./auth/auth-provider.service";
import { DashboardService } from "./dashboard/dashboard.service";
import { AuthorizationService } from "./authorization/AuthorizationService";

/**
 * Service factory class
 * Instantiates services with their required dependencies
 * 
 * Exported for testing purposes - allows subclassing with mock implementations
 */
export class ServiceFactory {
  // Repository instances (singletons) - Candidates
  protected candidateRepo: CandidateRepository;
  protected candidateTaskRepo: CandidateTaskRepository;
  protected candidateFollowerRepo: CandidateFollowerRepository;
  protected candidateStageRepo: CandidateStageRepository;

  // Repository instances (singletons) - Templates
  protected templateRepo: TemplateRepository;
  protected templateStageRepo: TemplateStageRepository;
  protected templateTaskRepo: TemplateTaskRepository;

  // Repository instances (singletons) - Users
  protected userRepo: UserRepository;
  protected userIdentityRepo: UserIdentityRepository;
  protected userPreferencesRepo: UserPreferencesRepository;
  protected invitationRepo: InvitationRepository;

  // Repository instances (singletons) - Organizational
  protected departmentRepo: DepartmentRepository;
  protected divisionRepo: DivisionRepository;

  // Repository instances (singletons) - Reference Data
  protected referenceDataRepo: ReferenceDataRepository;
  protected hiringStageRepo: HiringStageRepository;
  protected taskDefinitionRepo: TaskDefinitionRepository;

  // Repository instances (singletons) - Shared
  protected notificationRepo: NotificationRepository;
  protected commentRepo: CommentRepository;
  protected searchRepo: SearchRepository;

  // Service instances (singletons)
  protected candidateServiceInstance: CandidateService | null = null;
  protected taskServiceInstance: TaskService | null = null;
  protected taskDueDateServiceInstance: TaskDueDateService | null = null;
  protected templateServiceInstance: TemplateService | null = null;
  protected templateExpansionServiceInstance: TemplateExpansionService | null = null;
  protected templateEstimationServiceInstance: TemplateEstimationService | null = null;
  protected userServiceInstance: UserService | null = null;
  protected invitationServiceInstance: InvitationService | null = null;
  protected organizationServiceInstance: OrganizationService | null = null;
  protected referenceDataServiceInstance: ReferenceDataService | null = null;
  protected notificationServiceInstance: NotificationService | null = null;
  protected commentServiceInstance: CommentService | null = null;
  protected searchServiceInstance: SearchService | null = null;
  protected systemSettingsServiceInstance: SystemSettingsService | null = null;
  protected authProviderServiceInstance: AuthProviderService | null = null;
  protected dashboardServiceInstance: DashboardService | null = null;
  protected authorizationServiceInstance: AuthorizationService | null = null;

  constructor() {
    // Initialize repositories - Candidates
    this.candidateRepo = new CandidateRepository(db, pool);
    this.candidateTaskRepo = new CandidateTaskRepository(db, pool);
    this.candidateFollowerRepo = new CandidateFollowerRepository(db, pool);
    this.candidateStageRepo = new CandidateStageRepository(db, pool);

    // Initialize repositories - Templates
    this.templateRepo = new TemplateRepository(db, pool);
    this.templateStageRepo = new TemplateStageRepository(db, pool);
    this.templateTaskRepo = new TemplateTaskRepository(db, pool);

    // Initialize repositories - Users
    this.userRepo = new UserRepository(db, pool);
    this.userIdentityRepo = new UserIdentityRepository(db, pool);
    this.userPreferencesRepo = new UserPreferencesRepository(db, pool);
    this.invitationRepo = new InvitationRepository(db, pool);

    // Initialize repositories - Organizational
    this.departmentRepo = new DepartmentRepository(db, pool);
    this.divisionRepo = new DivisionRepository(db, pool);

    // Initialize repositories - Reference Data
    this.referenceDataRepo = new ReferenceDataRepository(db, pool);
    this.hiringStageRepo = new HiringStageRepository(db, pool);
    this.taskDefinitionRepo = new TaskDefinitionRepository(db, pool);

    // Initialize repositories - Shared
    this.notificationRepo = new NotificationRepository(db, pool);
    this.commentRepo = new CommentRepository(db, pool);
    this.searchRepo = new SearchRepository(db, pool);
  }

  /**
   * Get CandidateService instance
   */
  getCandidateService(): CandidateService {
    if (!this.candidateServiceInstance) {
      this.candidateServiceInstance = new CandidateService(
        this.candidateRepo,
        this.candidateTaskRepo,
        this.candidateFollowerRepo,
        this.candidateStageRepo,
        this.templateRepo
      );
    }
    return this.candidateServiceInstance;
  }

  /**
   * Get TaskService instance
   */
  getTaskService(): TaskService {
    if (!this.taskServiceInstance) {
      this.taskServiceInstance = new TaskService(
        this.candidateTaskRepo
      );
    }
    return this.taskServiceInstance;
  }

  /**
   * Get TaskDueDateService instance
   */
  getTaskDueDateService(): TaskDueDateService {
    if (!this.taskDueDateServiceInstance) {
      this.taskDueDateServiceInstance = new TaskDueDateService(
        db,
        this.candidateRepo,
        this.candidateTaskRepo
      );
    }
    return this.taskDueDateServiceInstance;
  }

  /**
   * Get TemplateService instance
   */
  getTemplateService(): TemplateService {
    if (!this.templateServiceInstance) {
      this.templateServiceInstance = new TemplateService(
        this.templateRepo,
        this.templateStageRepo,
        this.templateTaskRepo
      );
    }
    return this.templateServiceInstance;
  }

  /**
   * Get TemplateExpansionService instance
   */
  getTemplateExpansionService(): TemplateExpansionService {
    if (!this.templateExpansionServiceInstance) {
      this.templateExpansionServiceInstance = new TemplateExpansionService(
        db,
        pool,
        this.templateRepo,
        this.templateStageRepo,
        this.templateTaskRepo,
        this.candidateRepo,
        this.candidateTaskRepo,
        this.taskDefinitionRepo,
        this.referenceDataRepo
      );
    }
    return this.templateExpansionServiceInstance;
  }

  /**
   * Get TemplateEstimationService instance
   */
  getTemplateEstimationService(): TemplateEstimationService {
    if (!this.templateEstimationServiceInstance) {
      this.templateEstimationServiceInstance = new TemplateEstimationService(
        db,
        this.candidateRepo
      );
    }
    return this.templateEstimationServiceInstance;
  }

  /**
   * Get UserService instance
   */
  getUserService(): UserService {
    if (!this.userServiceInstance) {
      this.userServiceInstance = new UserService(
        this.userRepo,
        this.userIdentityRepo
      );
    }
    return this.userServiceInstance;
  }

  /**
   * Get InvitationService instance
   */
  getInvitationService(): InvitationService {
    if (!this.invitationServiceInstance) {
      this.invitationServiceInstance = new InvitationService(
        this.invitationRepo
      );
    }
    return this.invitationServiceInstance;
  }

  /**
   * Get OrganizationService instance
   */
  getOrganizationService(): OrganizationService {
    if (!this.organizationServiceInstance) {
      this.organizationServiceInstance = new OrganizationService(
        this.departmentRepo,
        this.divisionRepo
      );
    }
    return this.organizationServiceInstance;
  }

  /**
   * Get ReferenceDataService instance
   */
  getReferenceDataService(): ReferenceDataService {
    if (!this.referenceDataServiceInstance) {
      this.referenceDataServiceInstance = new ReferenceDataService(
        this.referenceDataRepo,
        this.hiringStageRepo,
        this.taskDefinitionRepo
      );
    }
    return this.referenceDataServiceInstance;
  }

  /**
   * Get NotificationService instance
   */
  getNotificationService(): NotificationService {
    if (!this.notificationServiceInstance) {
      this.notificationServiceInstance = new NotificationService(
        this.notificationRepo
      );
    }
    return this.notificationServiceInstance;
  }

  /**
   * Get CommentService instance
   */
  getCommentService(): CommentService {
    if (!this.commentServiceInstance) {
      this.commentServiceInstance = new CommentService(
        this.commentRepo
      );
    }
    return this.commentServiceInstance;
  }

  /**
   * Get SearchService instance
   */
  getSearchService(): SearchService {
    if (!this.searchServiceInstance) {
      this.searchServiceInstance = new SearchService(
        this.searchRepo
      );
    }
    return this.searchServiceInstance;
  }

  /**
   * Get SystemSettingsService instance
   */
  getSystemSettingsService(): SystemSettingsService {
    if (!this.systemSettingsServiceInstance) {
      this.systemSettingsServiceInstance = new SystemSettingsService(db);
    }
    return this.systemSettingsServiceInstance;
  }

  /**
   * Get AuthProviderService instance
   */
  getAuthProviderService(): AuthProviderService {
    if (!this.authProviderServiceInstance) {
      this.authProviderServiceInstance = new AuthProviderService(db);
    }
    return this.authProviderServiceInstance;
  }

  /**
   * Get all services
   * Useful for initializing everything at once
   */
  getAllServices() {
    return {
      candidate: this.getCandidateService(),
      task: this.getTaskService(),
      template: this.getTemplateService(),
      templateExpansion: this.getTemplateExpansionService(),
      templateEstimation: this.getTemplateEstimationService(),
      taskDueDate: this.getTaskDueDateService(),
      user: this.getUserService(),
      invitation: this.getInvitationService(),
      organization: this.getOrganizationService(),
      referenceData: this.getReferenceDataService(),
      notification: this.getNotificationService(),
      comment: this.getCommentService(),
      search: this.getSearchService(),
      systemSettings: this.getSystemSettingsService(),
      authProvider: this.getAuthProviderService(),
      dashboard: this.getDashboardService(),
      authorization: this.getAuthorizationService()
    };
  }

  /**
   * Get DashboardService instance
   */
  getDashboardService(): DashboardService {
    if (!this.dashboardServiceInstance) {
      this.dashboardServiceInstance = new DashboardService(db);
    }
    return this.dashboardServiceInstance;
  }

  /**
   * Get AuthorizationService instance
   */
  getAuthorizationService(): AuthorizationService {
    if (!this.authorizationServiceInstance) {
      this.authorizationServiceInstance = new AuthorizationService();
    }
    return this.authorizationServiceInstance;
  }
}

/**
 * Interface for testing - allows duck-typed mock factories
 */
export interface IServiceFactory {
  getCandidateService(): CandidateService;
  getTaskService(): TaskService;
  getTaskDueDateService(): TaskDueDateService;
  getTemplateService(): TemplateService;
  getTemplateExpansionService(): TemplateExpansionService;
  getTemplateEstimationService(): TemplateEstimationService;
  getUserService(): UserService;
  getInvitationService(): InvitationService;
  getOrganizationService(): OrganizationService;
  getReferenceDataService(): ReferenceDataService;
  getNotificationService(): NotificationService;
  getCommentService(): CommentService;
  getSearchService(): SearchService;
  getSystemSettingsService(): SystemSettingsService;
  getAuthProviderService(): AuthProviderService;
  getDashboardService(): DashboardService;
  getAuthorizationService(): AuthorizationService;
}

// Export a singleton instance - mutable for testing
let activeFactory: IServiceFactory = new ServiceFactory();
const defaultFactory: ServiceFactory = activeFactory as ServiceFactory;

/**
 * For testing: Replace the active service factory with a mock
 * @param mockFactory - The mock service factory to use (can be any object implementing IServiceFactory)
 */
export function setServiceFactoryForTesting(mockFactory: IServiceFactory): void {
  activeFactory = mockFactory;
}

/**
 * For testing: Reset to the default (real) service factory
 */
export function resetServiceFactory(): void {
  activeFactory = defaultFactory;
}

/**
 * Get the current active service factory (for testing inspection)
 */
export function getActiveServiceFactory(): IServiceFactory {
  return activeFactory;
}

// Export the default singleton instance (for direct access when needed)
export const serviceFactory = defaultFactory;

// Export individual service getters for convenience - use activeFactory for testability
export const getCandidateService = () => activeFactory.getCandidateService();
export const getTaskService = () => activeFactory.getTaskService();
export const getTaskDueDateService = () => activeFactory.getTaskDueDateService();
export const getTemplateService = () => activeFactory.getTemplateService();
export const getTemplateExpansionService = () => activeFactory.getTemplateExpansionService();
export const getTemplateEstimationService = () => activeFactory.getTemplateEstimationService();
export const getUserService = () => activeFactory.getUserService();
export const getInvitationService = () => activeFactory.getInvitationService();
export const getOrganizationService = () => activeFactory.getOrganizationService();
export const getReferenceDataService = () => activeFactory.getReferenceDataService();
export const getNotificationService = () => activeFactory.getNotificationService();
export const getCommentService = () => activeFactory.getCommentService();
export const getSearchService = () => activeFactory.getSearchService();
export const getSystemSettingsService = () => activeFactory.getSystemSettingsService();
export const getAuthProviderService = () => activeFactory.getAuthProviderService();
export const getDashboardService = () => activeFactory.getDashboardService();
export const getAuthorizationService = () => activeFactory.getAuthorizationService();
