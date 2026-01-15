/**
 * Invitation Repository
 *
 * Manages user invitations for account registration.
 * Handles invitation creation, validation, and consumption.
 */

import { eq, and, or, gt, desc, sql } from "drizzle-orm";
import {
  invitations,
  departments,
  divisions,
  type Invitation,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";

/**
 * Extended invitation type with joined department and division data
 */
export type InvitationWithOrganization = Invitation & {
  department?: { id: string; name: string } | null;
  division?: { id: string; name: string } | null;
};

/**
 * Repository for managing user invitations
 */
export class InvitationRepository extends BaseRepository {
  /**
   * Create or update an invitation
   * If an invitation for the email already exists, updates it with new data
   * @param params - Invitation parameters
   * @returns Created or updated invitation
   */
  async createInvitation(params: {
    email: string;
    roles: string[];
    invitedBy?: string | null;
    token: string;
    expiresAt: Date;
    departmentId?: string | null;
    divisionId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<Invitation> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const usernameLocal = normalizedEmail.includes("@")
      ? normalizedEmail.split("@")[0]
      : normalizedEmail;
    const roles = Array.from(new Set(params.roles.map(role => role.trim()).filter(Boolean)));
    const now = new Date();
    const expiresAt = new Date(params.expiresAt);

    return await this.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.email, normalizedEmail))
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await tx
          .update(invitations)
          .set({
            email: normalizedEmail,
            username: usernameLocal,
            roles,
            firstName: params.firstName ?? null,
            lastName: params.lastName ?? null,
            token: params.token,
            status: "pending",
            expiresAt,
            consumedAt: null,
            invitedBy: params.invitedBy ?? existing[0].invitedBy ?? null,
            departmentId: params.departmentId ?? null,
            divisionId: params.divisionId ?? null,
            updatedAt: now
          })
          .where(eq(invitations.id, existing[0].id))
          .returning();
        return updated;
      }

      const [created] = await tx
        .insert(invitations)
        .values({
          email: normalizedEmail,
          username: usernameLocal,
          roles,
          firstName: params.firstName ?? null,
          lastName: params.lastName ?? null,
          token: params.token,
          status: "pending",
          expiresAt,
          consumedAt: null,
          invitedBy: params.invitedBy ?? null,
          departmentId: params.departmentId ?? null,
          divisionId: params.divisionId ?? null,
          createdAt: now,
          updatedAt: now
        })
        .returning();
      return created;
    });
  }

  /**
   * Get an invitation by token
   * Used to validate invitation tokens during registration
   * @param token - Invitation token
   * @returns Invitation or null if not found
   */
  async getInvitationByToken(token: string): Promise<Invitation | null> {
    const [invite] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1);
    return invite ?? null;
  }

  /**
   * Mark an invitation as consumed
   * Called after successful user registration
   * @param id - Invitation ID
   * @returns Updated invitation or null if not found
   */
  async consumeInvitation(id: string): Promise<Invitation | null> {
    const [updated] = await this.db
      .update(invitations)
      .set({
        status: "consumed",
        consumedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(invitations.id, id))
      .returning();
    return updated ?? null;
  }

  /**
   * Find a valid pending invitation for an email or username
   * Matches on email or username, must be pending and not expired
   * @param identifier - Email address or username
   * @returns Valid invitation or null if not found
   */
  async findValidPendingInviteForIdentifier(identifier: string): Promise<Invitation | null> {
    const normalized = identifier.trim().toLowerCase();
    const usernameLocal = normalized.includes("@") ? normalized.split("@")[0] : normalized;
    const now = new Date();

    const [invite] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.status, "pending"),
          gt(invitations.expiresAt, now),
          or(
            eq(invitations.email, normalized),
            eq(invitations.username, usernameLocal)
          )
        )
      )
      .orderBy(desc(invitations.updatedAt))
      .limit(1);

    return invite ?? null;
  }

  /**
   * Get all pending invitations for the users list page
   * Includes department and division information via joins
   * @param filters - Optional filters for role, department, division, and search
   * @returns Array of pending invitations with organization data
   */
  async getPendingInvitationsForUsersList(filters?: {
    role?: string;
    departmentId?: string;
    divisionId?: string;
    search?: string
  }): Promise<InvitationWithOrganization[]> {
    const where: any[] = [
      eq(invitations.status, 'pending')
    ];

    if (filters?.role) {
      // roles is text[]; use sql to check if role is in array
      where.push(sql`${filters.role} = ANY(${invitations.roles})`);
    }

    if (filters?.departmentId) {
      where.push(eq(invitations.departmentId, filters.departmentId));
    }

    if (filters?.divisionId) {
      where.push(eq(invitations.divisionId, filters.divisionId));
    }

    if (filters?.search) {
      const q = `%${filters.search.toLowerCase()}%`;
      where.push(sql`lower(${invitations.email}) like ${q}`);
    }

    const rows = await this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        username: invitations.username,
        firstName: invitations.firstName,
        lastName: invitations.lastName,
        roles: invitations.roles,
        token: invitations.token,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        consumedAt: invitations.consumedAt,
        invitedBy: invitations.invitedBy,
        departmentId: invitations.departmentId,
        divisionId: invitations.divisionId,
        createdAt: invitations.createdAt,
        updatedAt: invitations.updatedAt,
        department: {
          id: departments.id,
          name: departments.name
        },
        division: {
          id: divisions.id,
          name: divisions.name
        }
      })
      .from(invitations)
      .leftJoin(departments, eq(invitations.departmentId, departments.id))
      .leftJoin(divisions, eq(invitations.divisionId, divisions.id))
      .where(and(...where))
      .orderBy(desc(invitations.updatedAt));

    return rows as InvitationWithOrganization[];
  }

  /**
   * Delete an invitation
   * Used to cancel a pending invitation
   * @param id - Invitation ID
   * @returns Deleted invitation or null if not found
   */
  async deleteInvitation(id: string): Promise<Invitation | null> {
    const [deleted] = await this.db
      .delete(invitations)
      .where(eq(invitations.id, id))
      .returning();
    return deleted ?? null;
  }
}
