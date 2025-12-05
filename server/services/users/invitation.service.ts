/**
 * Invitation Service
 *
 * Business logic layer for user invitation management.
 * Handles invitation creation, validation, and consumption.
 */

import type { Invitation } from "@shared/schemas";
import type { InvitationRepository, InvitationWithOrganization } from "../../repositories/users/InvitationRepository";

export interface CreateInvitationInput {
  email: string;
  roles: string[];
  invitedBy?: string | null;
  expiresAt?: Date;
  departmentId?: string | null;
  divisionId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface CreateInvitationResult {
  invitation: Invitation;
  token: string;
}

/**
 * Service for invitation-related business operations
 */
export class InvitationService {
  constructor(
    private invitationRepo: InvitationRepository
  ) {}

  /**
   * Create a new invitation
   * Generates a secure token and sets expiration
   */
  async createInvitation(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    const { randomBytes } = await import('crypto');
    
    // Generate secure token
    const token = randomBytes(32).toString('hex');
    
    // Default expiration: 7 days from now
    const expiresAt = input.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.invitationRepo.createInvitation({
      email: input.email,
      roles: input.roles,
      invitedBy: input.invitedBy,
      token,
      expiresAt,
      departmentId: input.departmentId,
      divisionId: input.divisionId,
      firstName: input.firstName,
      lastName: input.lastName
    });

    return { invitation, token };
  }

  /**
   * Get an invitation by token
   * Used during registration to validate the invitation
   */
  async getInvitationByToken(token: string): Promise<Invitation | null> {
    return this.invitationRepo.getInvitationByToken(token);
  }

  /**
   * Consume an invitation when a user registers
   * Marks the invitation as used
   */
  async consumeInvitation(invitationId: string): Promise<Invitation | null> {
    return this.invitationRepo.consumeInvitation(invitationId);
  }

  /**
   * Find a valid pending invitation for an email or username
   * Used during LDAP/OAuth authentication to auto-link invitations
   */
  async findValidPendingInvite(identifier: string): Promise<Invitation | null> {
    return this.invitationRepo.findValidPendingInviteForIdentifier(identifier);
  }

  /**
   * Get pending invitations with organization details
   * Used in admin UI to display outstanding invitations
   */
  async getPendingInvitations(filters?: {
    role?: string;
    departmentId?: string;
    divisionId?: string;
    search?: string;
  }): Promise<InvitationWithOrganization[]> {
    return this.invitationRepo.getPendingInvitationsForUsersList(filters);
  }

  /**
   * Check if an invitation is valid (not expired, not consumed)
   */
  async validateInvitation(token: string): Promise<{
    valid: boolean;
    invitation?: Invitation;
    reason?: string;
  }> {
    const invitation = await this.invitationRepo.getInvitationByToken(token);
    
    if (!invitation) {
      return { valid: false, reason: 'Invitation not found' };
    }

    if (invitation.status === 'consumed' || invitation.consumedAt) {
      return { valid: false, reason: 'Invitation has already been used' };
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return { valid: false, reason: 'Invitation has expired' };
    }

    return { valid: true, invitation };
  }

  /**
   * Resend an invitation by creating a new token
   * Used when the original invitation has expired
   */
  async resendInvitation(email: string, invitedBy?: string): Promise<CreateInvitationResult | null> {
    // Find the existing invitation
    const existing = await this.invitationRepo.findValidPendingInviteForIdentifier(email);
    
    if (!existing) {
      return null;
    }

    // Create a new invitation with the same details but fresh token
    return this.createInvitation({
      email: existing.email,
      roles: existing.roles,
      invitedBy: invitedBy || existing.invitedBy,
      departmentId: existing.departmentId,
      divisionId: existing.divisionId,
      firstName: existing.firstName,
      lastName: existing.lastName
    });
  }
}
