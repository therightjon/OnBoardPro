/**
 * Request validation middleware using Zod schemas
 * 
 * Provides consistent validation and error handling across all routes.
 * Replaces the duplicated ZodError handling pattern found in route files.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Middleware to validate request body against a Zod schema
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware that validates req.body and attaches validated data to req.validatedBody
 * 
 * @example
 * ```typescript
 * router.post("/users", 
 *   requireAuth, 
 *   validateBody(insertUserSchema), 
 *   async (req, res, next) => {
 *     // req.validatedBody is typed and validated
 *     const user = await userService.create(req.validatedBody);
 *     res.status(201).json(user);
 *   }
 * );
 * ```
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid data",
        errors: result.error.issues
      });
    }
    
    // Attach validated data to request for type-safe access in handlers
    (req as Request & { validatedBody: T }).validatedBody = result.data;
    next();
  };
}

/**
 * Middleware to validate query parameters against a Zod schema
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware that validates req.query and attaches validated data to req.validatedQuery
 * 
 * @example
 * ```typescript
 * const querySchema = z.object({
 *   page: z.coerce.number().min(1).default(1),
 *   limit: z.coerce.number().min(1).max(100).default(20)
 * });
 * 
 * router.get("/users",
 *   validateQuery(querySchema),
 *   async (req, res, next) => {
 *     const { page, limit } = req.validatedQuery;
 *     // ...
 *   }
 * );
 * ```
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid query parameters",
        errors: result.error.issues
      });
    }
    
    (req as Request & { validatedQuery: T }).validatedQuery = result.data;
    next();
  };
}

/**
 * Middleware to validate URL parameters against a Zod schema
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware that validates req.params and attaches validated data to req.validatedParams
 * 
 * @example
 * ```typescript
 * const paramsSchema = z.object({
 *   id: z.string().uuid()
 * });
 * 
 * router.get("/users/:id",
 *   validateParams(paramsSchema),
 *   async (req, res, next) => {
 *     const { id } = req.validatedParams;
 *     // ...
 *   }
 * );
 * ```
 */
export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid URL parameters",
        errors: result.error.issues
      });
    }
    
    (req as Request & { validatedParams: T }).validatedParams = result.data;
    next();
  };
}

/**
 * Helper to check if an error is a ZodError
 * Useful for catch blocks that still need manual ZodError handling
 * (e.g., when validation happens inside business logic)
 * 
 * @param error - Error to check
 * @returns True if error is a ZodError
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/**
 * Helper to format a ZodError into a standard error response
 * Useful for manual error handling in service layers
 * 
 * @param error - ZodError to format
 * @returns Formatted error response object
 */
export function formatZodError(error: ZodError): { message: string; errors: typeof error.issues } {
  return {
    message: "Invalid data",
    errors: error.issues
  };
}

/**
 * Express response helper for ZodError handling in catch blocks
 * Use this when validation happens inside the handler (e.g., with .partial())
 * 
 * @param res - Express Response object
 * @param error - ZodError to handle
 * @returns Response with 400 status
 * 
 * @example
 * ```typescript
 * } catch (error) {
 *   if (isZodError(error)) {
 *     return handleZodError(res, error);
 *   }
 *   next(error);
 * }
 * ```
 */
export function handleZodError(res: Response, error: ZodError): Response {
  return res.status(400).json(formatZodError(error));
}
