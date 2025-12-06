/**
 * UserService
 *
 * Handles user management business logic including:
 * - User creation with validation and password hashing
 * - User updates and role management
 * - User enable/disable with task reassignment
 * - User preferences management
 */

import type { User, InsertUser, UserRole, UserIdentity, InsertUserIdentity } from "@shared/schemas";
import type { UserRepository } from "../../repositories/users/UserRepository";
import type { UserIdentityRepository } from "../../repositories/users/UserIdentityRepository";
import type { AuthorizationContext } from "../authorization/policy-types";
import { eventBus, userCreated, userRoleChanged } from "../../events";

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserValidationError';
  }
}

export interface CreateUserInput {
  data: InsertUser & { passwordHash?: string; roles?: UserRole[] };
  actorId?: string;
}

export interface UpdateUserInput {
  id: string;
  data: Partial<User> & { passwordHash?: string };
  actorId?: string;
}

export interface UpdateUserRolesInput {
  userId: string;
  roles: UserRole[];
  actorId?: string;
}

export interface DisableUserInput {
  userId: string;
  reassignOpenTasksTo?: string;
  actorId?: string;
}

export interface GetUsersFilters {
  status?: string;
  role?: string;
  departmentId?: string;
  divisionId?: string;
  search?: string;
}

/**
 * UserService
 * Encapsulates user management business logic
 */
export class UserService {
  constructor(
    private userRepo: UserRepository,
    private userIdentityRepo?: UserIdentityRepository
  ) {}

  /**
   * Hash password using scrypt
   */
  private async hashPassword(password: string): Promise<string> {
    const { scrypt, randomBytes } = await import('crypto');
    const { promisify } = await import('util');
    const scryptAsync = promisify(scrypt);

    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  }

  /**
   * Create a new user
   * Business rules:
   * - Email must be unique
   * - Password is hashed if provided
   * - Roles are assigned if provided
   * - Domain event is published
   */
  async createUser(input: CreateUserInput): Promise<User> {
    const { data, actorId } = input;

    // Business Rule: Check for duplicate email
    const existingUser = await this.userRepo.getUserByEmail(data.email);
    if (existingUser) {
      throw new UserValidationError("Email already exists");
    }

    // Hash password if provided
    const userData = { ...data };
    if (userData.passwordHash) {
      userData.passwordHash = await this.hashPassword(userData.passwordHash);
    }

    // Extract roles before creating user
    const roles = userData.roles;
    delete userData.roles;

    // Create user
    const user = await this.userRepo.createUser(userData as InsertUser);

    // Set roles if provided
    if (roles && Array.isArray(roles)) {
      const roleNames = roles.map((r: any) => typeof r === "string" ? r : r.role).filter(Boolean) as string[];
      await this.userRepo.setUserRoles(user.id, roleNames);
    }

    // Publish domain event
    await eventBus.publish(userCreated(user.id, {
      email: user.email,
      role: user.role,
      invited: false
    }, {
      actorId
    }));

    return user;
  }

  /**
   * Update user
   * Business rule: Hash password if being updated
   */
  async updateUser(input: UpdateUserInput): Promise<User | undefined> {
    const { id, data, actorId } = input;

    // Hash password if being updated
    const updateData = { ...data };
    if (updateData.passwordHash) {
      updateData.passwordHash = await this.hashPassword(updateData.passwordHash);
    }

    return this.userRepo.updateUser(id, updateData);
  }

  /**
   * Update user roles
   * Publishes userRoleChanged event
   */
  async updateUserRoles(input: UpdateUserRolesInput): Promise<any> {
    const { userId, roles, actorId } = input;

    if (!Array.isArray(roles)) {
      throw new UserValidationError("Roles must be an array");
    }

    // Get existing user to track role changes
    const existingUser = await this.userRepo.getUser(userId);
    const previousRoles = existingUser ? [existingUser.role] : [];

    const roleNames = roles.map((r: any) => typeof r === "string" ? r : r.role).filter(Boolean) as string[];
    const userRoles = await this.userRepo.setUserRoles(userId, roleNames);

    // Publish domain event
    await eventBus.publish(userRoleChanged(userId, {
      previousRoles,
      newRoles: roleNames,
      changedBy: actorId || 'system'
    }, {
      actorId
    }));

    return userRoles;
  }

  /**
   * Add roles to user (without replacing existing)
   */
  async addUserRoles(userId: string, roles: string[]): Promise<any> {
    return this.userRepo.addUserRoles(userId, roles);
  }

  /**
   * Disable user
   * Business rule: Reassign open tasks if specified
   */
  async disableUser(input: DisableUserInput): Promise<{ success: boolean; tasksReassigned: number; taskCount: number }> {
    const { userId, reassignOpenTasksTo, actorId } = input;

    // Get task count before disabling
    const taskCount = await this.userRepo.getUserOpenTaskCount(userId);

    const result = await this.userRepo.disableUser(userId, reassignOpenTasksTo);

    return {
      success: result.success,
      tasksReassigned: result.tasksReassigned ?? 0,
      taskCount: (result as any).taskCount ?? 0
    };
  }

  /**
   * Enable user
   */
  async enableUser(userId: string, actorId?: string): Promise<User | undefined> {
    return this.userRepo.enableUser(userId);
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<User | undefined> {
    return this.userRepo.getUser(userId);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.userRepo.getUserByEmail(email);
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.userRepo.getUserByUsername(username);
  }

  /**
   * Get all users with filtering
   */
  async getAllUsers(filters: GetUsersFilters): Promise<User[]> {
    return this.userRepo.getAllUsers(filters);
  }


  /**
   * Get user open task count
   */
  async getUserOpenTaskCount(userId: string): Promise<number> {
    return this.userRepo.getUserOpenTaskCount(userId) as unknown as number;
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<any> {
    const repo: any = this.userRepo as any;
    if (typeof repo.getUserPreferences === "function") {
      return repo.getUserPreferences(userId);
    }
    return undefined;
  }

  /**
   * Upsert user preferences
   */
  async upsertUserPreferences(userId: string, preferences: any): Promise<any> {
    const repo: any = this.userRepo as any;
    if (typeof repo.upsertUserPreferences === "function") {
      return repo.upsertUserPreferences(userId, preferences);
    }
    return undefined;
  }

  // ============================================
  // User Identity Methods
  // ============================================

  /**
   * Get user identity by provider and external ID
   */
  async getUserIdentityByProvider(provider: string, externalId: string): Promise<UserIdentity | undefined> {
    if (!this.userIdentityRepo) {
      throw new Error("UserIdentityRepository not configured");
    }
    return this.userIdentityRepo.getUserIdentityByProvider(provider, externalId);
  }

  /**
   * Get all identities for a user
   */
  async getUserIdentities(userId: string): Promise<UserIdentity[]> {
    if (!this.userIdentityRepo) {
      throw new Error("UserIdentityRepository not configured");
    }
    return this.userIdentityRepo.getUserIdentities(userId);
  }

  /**
   * Create a user identity
   */
  async createUserIdentity(data: InsertUserIdentity): Promise<UserIdentity> {
    if (!this.userIdentityRepo) {
      throw new Error("UserIdentityRepository not configured");
    }
    return this.userIdentityRepo.createUserIdentity(data);
  }

  /**
   * Update a user identity
   */
  async updateUserIdentity(id: string, data: Partial<UserIdentity>): Promise<UserIdentity | undefined> {
    if (!this.userIdentityRepo) {
      throw new Error("UserIdentityRepository not configured");
    }
    return this.userIdentityRepo.updateUserIdentity(id, data);
  }

  /**
   * Delete a user identity
   */
  async deleteUserIdentity(id: string): Promise<void> {
    if (!this.userIdentityRepo) {
      throw new Error("UserIdentityRepository not configured");
    }
    return this.userIdentityRepo.deleteUserIdentity(id);
  }

  // ============================================
  // Authorization Scope Methods
  // ============================================

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    return this.userRepo.getUserRoles(userId);
  }

  /**
   * Get user department scope IDs
   */
  async getUserDepartmentScopeIds(userId: string): Promise<string[]> {
    return this.userRepo.getUserDepartmentScopeIds(userId);
  }

  /**
   * Get user division scope IDs
   */
  async getUserDivisionScopeIds(userId: string): Promise<string[]> {
    return this.userRepo.getUserDivisionScopeIds(userId);
  }

  /**
   * Get manager candidate scope IDs
   */
  async getManagerCandidateScopeIds(managerId: string): Promise<string[]> {
    return this.userRepo.getManagerCandidateScopeIds(managerId);
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    return this.userRepo.updateLastLogin(userId);
  }
}
