/**
 * Service Factory
 *
 * Creates and manages service instances with proper dependency injection
 * This acts as a simple dependency injection container
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
 */
class ServiceFactory {
  // Repository instances (singletons) - Candidates
  private candidateRepo: CandidateRepository;
  private candidateTaskRepo: CandidateTaskRepository;
  private candidateFollowerRepo: CandidateFollowerRepository;
  private candidateStageRepo: CandidateStageRepository;

  // Repository instances (singletons) - Templates
  private templateRepo: TemplateRepository;
  private templateStageRepo: TemplateStageRepository;
  private templateTaskRepo: TemplateTaskRepository;

  // Repository instances (singletons) - Users
  private userRepo: UserRepository;
  private userIdentityRepo: UserIdentityRepository;
  private userPreferencesRepo: UserPreferencesRepository;
  private invitationRepo: InvitationRepository;

  // Repository instances (singletons) - Organizational
  private departmentRepo: DepartmentRepository;
  private divisionRepo: DivisionRepository;

  // Repository instances (singletons) - Reference Data
  private referenceDataRepo: ReferenceDataRepository;
  private hiringStageRepo: HiringStageRepository;
  private taskDefinitionRepo: TaskDefinitionRepository;

  // Repository instances (singletons) - Shared
  private notificationRepo: NotificationRepository;
  private commentRepo: CommentRepository;
  private searchRepo: SearchRepository;

  // Service instances (singletons)
  private candidateServiceInstance: CandidateService | null = null;
  private taskServiceInstance: TaskService | null = null;
  private taskDueDateServiceInstance: TaskDueDateService | null = null;
  private templateServiceInstance: TemplateService | null = null;
  private templateExpansionServiceInstance: TemplateExpansionService | null = null;
  private templateEstimationServiceInstance: TemplateEstimationService | null = null;
  private userServiceInstance: UserService | null = null;
  private invitationServiceInstance: InvitationService | null = null;
  private organizationServiceInstance: OrganizationService | null = null;
  private referenceDataServiceInstance: ReferenceDataService | null = null;
  private notificationServiceInstance: NotificationService | null = null;
  private commentServiceInstance: CommentService | null = null;
  private searchServiceInstance: SearchService | null = null;
  private systemSettingsServiceInstance: SystemSettingsService | null = null;
  private authProviderServiceInstance: AuthProviderService | null = null;
  private dashboardServiceInstance: DashboardService | null = null;
  private authorizationServiceInstance: AuthorizationService | null = null;

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

// Export a singleton instance
export const serviceFactory = new ServiceFactory();

// Export individual service getters for convenience
export const getCandidateService = () => serviceFactory.getCandidateService();
export const getTaskService = () => serviceFactory.getTaskService();
export const getTaskDueDateService = () => serviceFactory.getTaskDueDateService();
export const getTemplateService = () => serviceFactory.getTemplateService();
export const getTemplateExpansionService = () => serviceFactory.getTemplateExpansionService();
export const getTemplateEstimationService = () => serviceFactory.getTemplateEstimationService();
export const getUserService = () => serviceFactory.getUserService();
export const getInvitationService = () => serviceFactory.getInvitationService();
export const getOrganizationService = () => serviceFactory.getOrganizationService();
export const getReferenceDataService = () => serviceFactory.getReferenceDataService();
export const getNotificationService = () => serviceFactory.getNotificationService();
export const getCommentService = () => serviceFactory.getCommentService();
export const getSearchService = () => serviceFactory.getSearchService();
export const getSystemSettingsService = () => serviceFactory.getSystemSettingsService();
export const getAuthProviderService = () => serviceFactory.getAuthProviderService();
export const getDashboardService = () => serviceFactory.getDashboardService();
export const getAuthorizationService = () => serviceFactory.getAuthorizationService();
