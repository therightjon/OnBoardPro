/**
 * Express type augmentations for OnBoardPro
 */

import type { User as SelectUser } from "@shared/schemas";

declare global {
  namespace Express {
    interface Request {
      // Request ID set by request-id middleware
      id: string;
      correlationId?: string;
      
      // User type definition
      user?: SelectUser & {
        roles: string[];
        departmentScopes: string[];
        divisionScopes: string[];
        managedCandidateIds: string[];
      };
    }

    interface User extends SelectUser {
      roles: string[];
      departmentScopes: string[];
      divisionScopes: string[];
      managedCandidateIds: string[];
    }
  }
}

export {};
