/**
 * UserService
 *
 * Handles user management business logic including:
 * - User creation with validation and password hashing
 * - User updates and role management
 * - User enable/disable with task reassignment
 * - User preferences management
 */

import type { User, InsertUser, UserRole } from "@shared/schemas";
import type { UserRepository } from "../../repositories/users/UserRepository";
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
    private userRepo: UserRepository
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
      await this.userRepo.setUserRoles(user.id, roles);
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

    const userRoles = await this.userRepo.setUserRoles(userId, roles);

    // Publish domain event
    await eventBus.publish(userRoleChanged(userId, {
      previousRoles,
      newRoles: roles,
      changedBy: actorId || 'system'
    }, {
      actorId
    }));

    return userRoles;
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
      tasksReassigned: result.tasksReassigned,
      taskCount
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
   * Get all users with filtering
   */
  async getAllUsers(filters: GetUsersFilters): Promise<User[]> {
    return this.userRepo.getAllUsers(filters);
  }

  /**
   * Get managers by department
   */
  async getManagersByDepartment(
    departmentId: string,
    divisionId?: string,
    search?: string,
    limit?: number,
    offset?: number
  ): Promise<User[]> {
    return this.userRepo.getManagersByDepartment(departmentId, divisionId, search, limit, offset);
  }

  /**
   * Get user open task count
   */
  async getUserOpenTaskCount(userId: string): Promise<number> {
    return this.userRepo.getUserOpenTaskCount(userId);
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<any> {
    return this.userRepo.getUserPreferences(userId);
  }

  /**
   * Upsert user preferences
   */
  async upsertUserPreferences(userId: string, preferences: any): Promise<any> {
    return this.userRepo.upsertUserPreferences(userId, preferences);
  }
}
