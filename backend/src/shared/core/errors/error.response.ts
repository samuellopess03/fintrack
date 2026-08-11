import type { FastifyError } from "fastify";
import { ZodError } from "zod";
import { AppError } from "@/shared/core/errors/error.classes";

export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export interface ValidationDetail {
  path: (string | number)[];
  message: string;
}

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error && "statusCode" in error;
}

function parseInstancePath(instancePath: string): (string | number)[] {
  return instancePath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const numeric = Number(segment);
      return Number.isNaN(numeric) ? segment : numeric;
    });
}

function issueToDetail(issue: { path: (string | number)[]; message: string }): ValidationDetail {
  return { path: issue.path, message: issue.message };
}

function extractValidationDetails(error: unknown): ValidationDetail[] | undefined {
  if (error instanceof ZodError) {
    return error.issues.map(issueToDetail);
  }

  if (isFastifyError(error) && "validation" in error) {
    const validation = error.validation;
    if (!validation) {
      return undefined;
    }

    return validation.map((validationError) => {
      const issue = (validationError.params as { issue?: { path: (string | number)[]; message: string } })
        ?.issue;
      return issueToDetail(
        issue ?? {
          path: parseInstancePath(validationError.instancePath),
          message: validationError.message ?? "Invalid value",
        },
      );
    });
  }

  return undefined;
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
    };
  }

  const details = extractValidationDetails(error);
  if (details !== undefined) {
    return {
      statusCode: 422,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details,
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
  };
}

export function isServerError(error: unknown): boolean {
  return toErrorResponse(error).statusCode >= 500;
}
