// Core authentication service for provider-agnostic sign-in flow

import type { User, InsertUser, UserIdentity, InsertUserIdentity, Invitation } from "@shared/schemas";
import type { UserProfile } from "./providers";
import { getUserService, getInvitationService } from "../../../services/service-factory";

export interface SignInResult {
  success: boolean;
  user?: User;
  error?: string;
  isNewUser?: boolean;
  statusCode?: number;
  consumedInvitationId?: string;
  assignedRoles?: string[];
}

export class AuthService {
  
  /**
   * Common sign-in flow for all providers
   * 1) Normalize username and email to lower case
   * 2) Try to find existing user by identity, username, or verified email
   * 3) If found, update user info and set last_login_at
   * 4) If not found, create new user with provider info
   * 5) Insert or update user_identities linking
   * 6) Return local user for session
   */
  async signInWithProvider(
    provider: string,
    profile: UserProfile,
    options?: { inviteToken?: string | null }
  ): Promise<SignInResult> {
    try {
      // Step 1: Normalize data
      const normalizedEmail = (profile.email ?? "").trim().toLowerCase();
      const normalizedUsername = profile.username ? profile.username.trim().toLowerCase() : undefined;
      
      // Step 2: Try to find existing user
      const existingUser = await this.findExistingUser(provider, profile, normalizedEmail, normalizedUsername);
      
      if (existingUser) {
        // Step 3: Update existing user
        await this.updateExistingUser(existingUser, profile);
        
        // Check if user is disabled
        if (existingUser.status === 'disabled') {
          return { success: false, error: 'Account is disabled', statusCode: 403 };
        }
        
        // Update or create identity record
        await this.upsertUserIdentity(existingUser.id, provider, profile);
        
        // Return updated user
        const userService = getUserService();
        const updatedUser = await userService.getUser(existingUser.id);
        return { 
          success: true, 
          user: updatedUser!,
          isNewUser: false 
        };
        
      } else {
        const invitation = await this.resolveInvitation({
          normalizedEmail,
          normalizedUsername,
          inviteToken: options?.inviteToken ?? null
        });

        if (!invitation) {
          return {
            success: false,
            error: 'You must be invited to use this application.',
            statusCode: 403
          };
        }

        // Step 4: Create new user anchored to invitation details
        const newUser = await this.createNewUser(
          provider,
          profile,
          invitation.email.toLowerCase(),
          invitation.username.toLowerCase(),
          invitation
        );
        
        // Step 5: Create identity record with invitation fallbacks
        const identityProfile: UserProfile = {
          ...profile,
          email: profile.email || invitation.email,
          username: profile.username || invitation.username
        };
        await this.upsertUserIdentity(newUser.id, provider, identityProfile);

        if (invitation.roles?.length) {
          const userService = getUserService();
          await userService.addUserRoles(newUser.id, invitation.roles);
        }

        const invitationService = getInvitationService();
        await invitationService.consumeInvitation(invitation.id);

        const userService = getUserService();
        const hydratedUser = await userService.getUser(newUser.id);

        return { 
          success: true, 
          user: hydratedUser ?? newUser,
          isNewUser: true,
          consumedInvitationId: invitation.id,
          assignedRoles: invitation.roles
        };
      }
      
    } catch (error) {
      console.error('Sign-in error:', error);
      return { 
        success: false, 
        error: 'Authentication failed' 
      };
    }
  }
  
  /**
   * Find existing user by provider identity, username, or verified email
   */
  private async findExistingUser(
    provider: string, 
    profile: UserProfile, 
    normalizedEmail: string, 
    normalizedUsername?: string
  ): Promise<User | undefined> {
    const userService = getUserService();
    
    // Try to find by provider identity first
    const identity = await userService.getUserIdentityByProvider(provider, profile.externalId);
    if (identity) {
      return await userService.getUser(identity.userId);
    }
    
    // Try to find by username if provided and unique
    if (normalizedUsername) {
      const userByUsername = await userService.getUserByUsername(normalizedUsername);
      if (userByUsername) {
        return userByUsername;
      }
    }
    
    // Try to find by verified email (careful with email-based linking)
    if (profile.emailVerified && normalizedEmail) {
      const userByEmail = await userService.getUserByEmail(normalizedEmail);
      if (userByEmail && userByEmail.emailVerified) {
        return userByEmail;
      }
    }
    
    return undefined;
  }
  
  /**
   * Update existing user with latest provider information
   */
  private async updateExistingUser(user: User, profile: UserProfile): Promise<void> {
    const userService = getUserService();
    const updateData: Partial<User> = {
      lastLoginAt: new Date()
    };
    
    // Update user info if provider has more recent data
    if (profile.firstName && profile.firstName !== user.firstName) {
      updateData.firstName = profile.firstName;
    }
    
    if (profile.lastName && profile.lastName !== user.lastName) {
      updateData.lastName = profile.lastName;
    }
    
    if (profile.email) {
      const candidateEmail = profile.email.trim().toLowerCase();
      if (candidateEmail && candidateEmail !== user.email?.toLowerCase()) {
        updateData.email = candidateEmail;
      }
    }
    
    if (profile.emailVerified && !user.emailVerified) {
      updateData.emailVerified = true;
    }
    
    // Update auth provider if this is the primary identity
    if (user.authProvider === 'local' && user.authProvider !== 'local') {
      updateData.authProvider = 'local'; // Keep as local if already set
    }
    
    await userService.updateUser({ id: user.id, data: updateData });
  }
  
  /**
   * Create new user from provider profile
   */
  private async createNewUser(
    provider: string, 
    profile: UserProfile, 
    normalizedEmail: string, 
    normalizedUsername?: string,
    invitation?: Invitation
  ): Promise<User> {
    const email = (invitation?.email ?? normalizedEmail).trim().toLowerCase();
    const username = (invitation?.username ?? normalizedUsername)?.trim().toLowerCase();
    const primaryRole = invitation?.roles?.[0] ?? 'candidate';
    const firstName = (invitation?.firstName ?? profile.firstName)?.trim() || username || email.split('@')[0] || 'Invited';
    const lastName = (invitation?.lastName ?? profile.lastName)?.trim() || 'User';

    const userData: InsertUser = {
      email,
      firstName,
      lastName,
      authProvider: provider,
      externalId: profile.externalId,
      username,
      emailVerified: profile.emailVerified ?? true,
      role: primaryRole as User['role'],
      status: 'active',
      departmentId: invitation?.departmentId ?? undefined,
      divisionId: invitation?.divisionId ?? undefined,
      lastLoginAt: new Date()
    };
    
    const userService = getUserService();
    return await userService.createUser({ data: userData });
  }

  private invitationMatches(
    invitation: Invitation,
    normalizedEmail: string,
    normalizedUsername?: string
  ): boolean {
    // NOTE: If the email alias differs from the canonical LDAP username, this lookup fails by default.
    // Future strategies:
    //   a) allow admins to override the username at invite acceptance time;
    //   b) resolve the canonical username from the directory when creating invitations.
    const emailCandidate = normalizedEmail?.trim();
    const usernameCandidate = normalizedUsername?.trim();
    const invitedEmail = invitation.email.trim().toLowerCase();
    const invitedUsername = invitation.username.trim().toLowerCase();

    if (emailCandidate && invitedEmail === emailCandidate) {
      return true;
    }

    if (emailCandidate && emailCandidate.includes('@')) {
      const localPart = emailCandidate.split('@')[0];
      if (localPart && invitedUsername === localPart) {
        return true;
      }
    }

    if (usernameCandidate && invitedUsername === usernameCandidate) {
      return true;
    }

    return false;
  }

  private async resolveInvitation(params: {
    normalizedEmail: string;
    normalizedUsername?: string;
    inviteToken?: string | null;
  }): Promise<Invitation | null> {
    const now = new Date();
    const invitationService = getInvitationService();

    if (params.inviteToken) {
      const invitation = await invitationService.getInvitationByToken(params.inviteToken);
      if (!invitation || invitation.status !== 'pending') {
        return null;
      }

      const expiresAt = new Date(invitation.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
        return null;
      }

      return this.invitationMatches(invitation, params.normalizedEmail, params.normalizedUsername)
        ? invitation
        : null;
    }

    const identifiers = new Set<string>();
    if (params.normalizedEmail) identifiers.add(params.normalizedEmail);
    if (params.normalizedUsername) identifiers.add(params.normalizedUsername);

    for (const identifier of identifiers) {
      const invitation = await invitationService.findValidPendingInvite(identifier);
      if (!invitation) {
        continue;
      }

      if (invitation.status !== 'pending') {
        continue;
      }

      const expiresAt = new Date(invitation.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
        continue;
      }

      if (this.invitationMatches(invitation, params.normalizedEmail, params.normalizedUsername)) {
        return invitation;
      }
    }

    return null;
  }
  
  /**
   * Create or update user identity record
   */
  private async upsertUserIdentity(userId: string, provider: string, profile: UserProfile): Promise<void> {
    const userService = getUserService();
    const existingIdentity = await userService.getUserIdentityByProvider(provider, profile.externalId);
    
    if (existingIdentity) {
      // Update existing identity
      await userService.updateUserIdentity(existingIdentity.id, {
        email: profile.email,
        username: profile.username
      });
    } else {
      // Create new identity
      const identityData: InsertUserIdentity = {
        userId,
        provider,
        externalId: profile.externalId,
        email: profile.email,
        username: profile.username
      };
      
      await userService.createUserIdentity(identityData);
    }
  }
  
  /**
   * Get linked identities for a user
   */
  async getUserIdentities(userId: string): Promise<UserIdentity[]> {
    const userService = getUserService();
    return await userService.getUserIdentities(userId);
  }
  
  /**
   * Unlink a provider identity (admin action)
   */
  async unlinkProviderIdentity(userId: string, provider: string, externalId: string): Promise<boolean> {
    const userService = getUserService();
    const identity = await userService.getUserIdentityByProvider(provider, externalId);
    
    if (!identity || identity.userId !== userId) {
      return false;
    }
    
    // Don't allow unlinking the primary identity
    const user = await userService.getUser(userId);
    if (user && user.authProvider === provider && user.externalId === externalId) {
      return false; // Cannot unlink primary identity
    }
    
    await userService.deleteUserIdentity(identity.id);
    return true;
  }
}

// Export singleton instance
export const authService = new AuthService();
