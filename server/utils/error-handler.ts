import type { Request, Response, NextFunction } from "express";
import { getRequestId } from "../middleware/request-id";

/**
 * Custom API Error class for structured error handling
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create a 400 Bad Request error
   */
  static badRequest(message: string, details?: any): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  /**
   * Create a 401 Unauthorized error
   */
  static unauthorized(message: string = "Authentication required"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  /**
   * Create a 403 Forbidden error
   */
  static forbidden(message: string = "Insufficient permissions"): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  /**
   * Create a 404 Not Found error
   */
  static notFound(resource: string = "Resource"): ApiError {
    return new ApiError(404, "NOT_FOUND", `${resource} not found`);
  }

  /**
   * Create a 409 Conflict error
   */
  static conflict(message: string, details?: any): ApiError {
    return new ApiError(409, "CONFLICT", message, details);
  }

  /**
   * Create a 422 Unprocessable Entity error
   */
  static validationError(message: string, details?: any): ApiError {
    return new ApiError(422, "VALIDATION_ERROR", message, details);
  }

  /**
   * Create a 500 Internal Server Error
   */
  static internal(message: string = "Internal server error"): ApiError {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}

/**
 * Express error handler middleware
 * Must be registered after all routes
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = getRequestId(req);

  // Handle ApiError instances
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
        requestId
      }
    });
    return;
  }

  // Handle Zod validation errors
  if (err.name === "ZodError") {
    res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.errors,
        requestId
      }
    });
    return;
  }

  // Log unexpected errors
  console.error("Unexpected error:", {
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Return generic error for unexpected errors
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : err.message,
      requestId
    }
  });
}

/**
 * Async handler wrapper to catch promise rejections
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
