/**
 * User Identity Repository
 *
 * Manages user identities for multi-provider authentication.
 * Each user can have multiple identities (local, LDAP, OAuth providers).
 */

import { eq, and } from "drizzle-orm";
import {
  userIdentities,
  type UserIdentity,
  type InsertUserIdentity,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";

/**
 * Repository for managing user identities across multiple auth providers
 */
export class UserIdentityRepository extends BaseRepository {
  /**
   * Get a user identity by provider and external ID
   * Used during authentication to find existing accounts
   * @param provider - Authentication provider name (e.g., 'local', 'ldap', 'google')
   * @param externalId - External identifier from the provider
   * @returns User identity or undefined if not found
   */
  async getUserIdentityByProvider(
    provider: string,
    externalId: string
  ): Promise<UserIdentity | undefined> {
    const [identity] = await this.db
      .select()
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.provider, provider),
          eq(userIdentities.externalId, externalId)
        )
      );
    return identity || undefined;
  }

  /**
   * Create a new user identity
   * Links an authentication provider identity to a user account
   * @param identityData - User identity data to insert
   * @returns Created user identity
   */
  async createUserIdentity(identityData: InsertUserIdentity): Promise<UserIdentity> {
    const [identity] = await this.db
      .insert(userIdentities)
      .values(identityData)
      .returning();
    return identity;
  }

  /**
   * Update an existing user identity
   * Used to update provider-specific data like tokens or profile info
   * @param id - User identity ID
   * @param data - Partial identity data to update
   * @returns Updated user identity or undefined if not found
   */
  async updateUserIdentity(
    id: string,
    data: Partial<UserIdentity>
  ): Promise<UserIdentity | undefined> {
    const [identity] = await this.db
      .update(userIdentities)
      .set(data)
      .where(eq(userIdentities.id, id))
      .returning();
    return identity || undefined;
  }

  /**
   * Get all identities for a user
   * Returns all authentication provider links for a user
   * @param userId - User ID
   * @returns Array of user identities ordered by creation date
   */
  async getUserIdentities(userId: string): Promise<UserIdentity[]> {
    return await this.db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId))
      .orderBy(userIdentities.createdAt);
  }

  /**
   * Delete a user identity
   * Removes a link between a user and an authentication provider
   * @param id - User identity ID
   */
  async deleteUserIdentity(id: string): Promise<void> {
    await this.db
      .delete(userIdentities)
      .where(eq(userIdentities.id, id));
  }
}
