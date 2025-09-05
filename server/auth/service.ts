// Core authentication service for provider-agnostic sign-in flow

import { storage } from "../storage";
import type { User, InsertUser, UserIdentity, InsertUserIdentity } from "@shared/schema";
import type { UserProfile, AuthResult } from "./providers";

export interface SignInResult {
  success: boolean;
  user?: User;
  error?: string;
  isNewUser?: boolean;
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
  async signInWithProvider(provider: string, profile: UserProfile): Promise<SignInResult> {
    try {
      // Step 1: Normalize data
      const normalizedEmail = profile.email.toLowerCase();
      const normalizedUsername = profile.username?.toLowerCase();
      
      // Step 2: Try to find existing user
      let existingUser = await this.findExistingUser(provider, profile, normalizedEmail, normalizedUsername);
      
      if (existingUser) {
        // Step 3: Update existing user
        await this.updateExistingUser(existingUser, profile);
        
        // Check if user is disabled
        if (existingUser.status === 'disabled') {
          return { success: false, error: 'Account is disabled' };
        }
        
        // Update or create identity record
        await this.upsertUserIdentity(existingUser.id, provider, profile);
        
        // Return updated user
        const updatedUser = await storage.getUser(existingUser.id);
        return { 
          success: true, 
          user: updatedUser!,
          isNewUser: false 
        };
        
      } else {
        // Step 4: Create new user
        const newUser = await this.createNewUser(provider, profile, normalizedEmail, normalizedUsername);
        
        // Step 5: Create identity record
        await this.upsertUserIdentity(newUser.id, provider, profile);
        
        return { 
          success: true, 
          user: newUser,
          isNewUser: true 
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
    
    // Try to find by provider identity first
    const identity = await storage.getUserIdentityByProvider(provider, profile.externalId);
    if (identity) {
      return await storage.getUser(identity.userId);
    }
    
    // Try to find by username if provided and unique
    if (normalizedUsername) {
      const userByUsername = await storage.getUserByUsername(normalizedUsername);
      if (userByUsername) {
        return userByUsername;
      }
    }
    
    // Try to find by verified email (careful with email-based linking)
    if (profile.emailVerified) {
      const userByEmail = await storage.getUserByEmail(normalizedEmail);
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
    
    if (profile.email && profile.email !== user.email) {
      updateData.email = profile.email;
    }
    
    if (profile.emailVerified && !user.emailVerified) {
      updateData.emailVerified = true;
    }
    
    // Update auth provider if this is the primary identity
    if (user.authProvider === 'local' && user.authProvider !== 'local') {
      updateData.authProvider = 'local'; // Keep as local if already set
    }
    
    await storage.updateUser(user.id, updateData);
  }
  
  /**
   * Create new user from provider profile
   */
  private async createNewUser(
    provider: string, 
    profile: UserProfile, 
    normalizedEmail: string, 
    normalizedUsername?: string
  ): Promise<User> {
    
    const userData: InsertUser = {
      email: normalizedEmail,
      firstName: profile.firstName,
      lastName: profile.lastName,
      authProvider: provider,
      externalId: profile.externalId,
      username: normalizedUsername,
      emailVerified: profile.emailVerified || false,
      role: 'candidate', // Default role - can be changed by admins
      status: 'active', // Or 'invited' if approval is required
      lastLoginAt: new Date()
    };
    
    return await storage.createUser(userData);
  }
  
  /**
   * Create or update user identity record
   */
  private async upsertUserIdentity(userId: string, provider: string, profile: UserProfile): Promise<void> {
    const existingIdentity = await storage.getUserIdentityByProvider(provider, profile.externalId);
    
    if (existingIdentity) {
      // Update existing identity
      await storage.updateUserIdentity(existingIdentity.id, {
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
      
      await storage.createUserIdentity(identityData);
    }
  }
  
  /**
   * Get linked identities for a user
   */
  async getUserIdentities(userId: string): Promise<UserIdentity[]> {
    return await storage.getUserIdentities(userId);
  }
  
  /**
   * Unlink a provider identity (admin action)
   */
  async unlinkProviderIdentity(userId: string, provider: string, externalId: string): Promise<boolean> {
    const identity = await storage.getUserIdentityByProvider(provider, externalId);
    
    if (!identity || identity.userId !== userId) {
      return false;
    }
    
    // Don't allow unlinking the primary identity
    const user = await storage.getUser(userId);
    if (user && user.authProvider === provider && user.externalId === externalId) {
      return false; // Cannot unlink primary identity
    }
    
    await storage.deleteUserIdentity(identity.id);
    return true;
  }
}

// Export singleton instance
export const authService = new AuthService();