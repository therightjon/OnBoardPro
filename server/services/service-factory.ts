/**
 * Service Factory
 *
 * Creates and manages service instances with proper dependency injection
 * This acts as a simple dependency injection container
 */

import { db, pool } from "../db/connection";

// Import repositories
import { CandidateRepository } from "../repositories/candidates/CandidateRepository";
import { CandidateTaskRepository } from "../repositories/candidates/CandidateTaskRepository";
import { CandidateFollowerRepository } from "../repositories/candidates/CandidateFollowerRepository";
import { TemplateRepository } from "../repositories/templates/TemplateRepository";
import { TemplateStageRepository } from "../repositories/templates/TemplateStageRepository";
import { TemplateTaskRepository } from "../repositories/templates/TemplateTaskRepository";
import { UserRepository } from "../repositories/users/UserRepository";

// Import services
import { CandidateService } from "./candidates/candidate.service";
import { TaskService } from "./tasks/task.service";
import { TemplateService } from "./templates/template.service";
import { UserService } from "./users/user.service";

/**
 * Service factory class
 * Instantiates services with their required dependencies
 */
class ServiceFactory {
  // Repository instances (singletons)
  private candidateRepo: CandidateRepository;
  private candidateTaskRepo: CandidateTaskRepository;
  private candidateFollowerRepo: CandidateFollowerRepository;
  private templateRepo: TemplateRepository;
  private templateStageRepo: TemplateStageRepository;
  private templateTaskRepo: TemplateTaskRepository;
  private userRepo: UserRepository;

  // Service instances (singletons)
  private candidateServiceInstance: CandidateService | null = null;
  private taskServiceInstance: TaskService | null = null;
  private templateServiceInstance: TemplateService | null = null;
  private userServiceInstance: UserService | null = null;

  constructor() {
    // Initialize repositories
    this.candidateRepo = new CandidateRepository(db, pool);
    this.candidateTaskRepo = new CandidateTaskRepository(db, pool);
    this.candidateFollowerRepo = new CandidateFollowerRepository(db, pool);
    this.templateRepo = new TemplateRepository(db, pool);
    this.templateStageRepo = new TemplateStageRepository(db, pool);
    this.templateTaskRepo = new TemplateTaskRepository(db, pool);
    this.userRepo = new UserRepository(db, pool);
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
   * Get UserService instance
   */
  getUserService(): UserService {
    if (!this.userServiceInstance) {
      this.userServiceInstance = new UserService(
        this.userRepo
      );
    }
    return this.userServiceInstance;
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
      user: this.getUserService()
    };
  }
}

// Export a singleton instance
export const serviceFactory = new ServiceFactory();

// Export individual service getters for convenience
export const getCandidateService = () => serviceFactory.getCandidateService();
export const getTaskService = () => serviceFactory.getTaskService();
export const getTemplateService = () => serviceFactory.getTemplateService();
export const getUserService = () => serviceFactory.getUserService();
