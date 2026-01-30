# Enterprise Patterns Reference

> **Load when:** User asks about error handling, validation, migration strategies, or large-scale TypeScript patterns.

Proven patterns for building maintainable TypeScript applications.

## Contents

- [Error Handling](#error-handling)
- [Validation Patterns](#validation-patterns)
- [Project Organization](#project-organization)
- [Migration Strategies](#migration-strategies)
- [Security Patterns](#security-patterns)

---

## Error Handling

### Result Type Pattern

Instead of throwing exceptions, return typed results:

```typescript
// Define Result type
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Helper functions
function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// Usage
interface ValidationError {
  field: string;
  message: string;
}

function parseEmail(input: string): Result<string, ValidationError> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(input)) {
    return err({ field: "email", message: "Invalid email format" });
  }

  return ok(input.toLowerCase());
}

// Consuming Result
const result = parseEmail(userInput);

if (result.success) {
  console.log(`Valid email: ${result.data}`);
} else {
  console.error(`Error in ${result.error.field}: ${result.error.message}`);
}
```

### Typed Error Classes

```typescript
// Base application error
abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error types
class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly statusCode = 404;

  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`);
  }
}

class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR";
  readonly statusCode = 400;

  constructor(
    message: string,
    public readonly fields: Record<string, string[]>
  ) {
    super(message);
  }
}

class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";
  readonly statusCode = 401;

  constructor(message = "Authentication required") {
    super(message);
  }
}

// Type guard for app errors
function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// Error handler
function handleError(error: unknown): { status: number; body: object } {
  if (isAppError(error)) {
    return {
      status: error.statusCode,
      body: {
        code: error.code,
        message: error.message,
        ...(error instanceof ValidationError && { fields: error.fields })
      }
    };
  }

  console.error("Unexpected error:", error);
  return {
    status: 500,
    body: { code: "INTERNAL_ERROR", message: "Internal server error" }
  };
}
```

---

## Validation Patterns

### Branded Types for Validation

```typescript
// Branded/Nominal types
declare const EmailBrand: unique symbol;
type Email = string & { readonly [EmailBrand]: true };

declare const UserIdBrand: unique symbol;
type UserId = string & { readonly [UserIdBrand]: true };

// Validation functions that return branded types
function validateEmail(input: string): Email {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input)) {
    throw new ValidationError("Invalid email", { email: ["Invalid format"] });
  }
  return input as Email;
}

function validateUserId(input: string): UserId {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(input)) {
    throw new ValidationError("Invalid user ID", { id: ["Must be UUID"] });
  }
  return input as UserId;
}

// Usage: Functions require validated types
function sendEmail(to: Email, subject: string): void {
  // to is guaranteed to be valid email
}

function getUser(id: UserId): Promise<User> {
  // id is guaranteed to be valid UUID
}

// Compiler enforces validation
sendEmail("invalid", "Hello");           // Error: string not assignable to Email
sendEmail(validateEmail("a@b.com"), "Hello"); // OK
```

---

## Migration Strategies

### Incremental Migration from JavaScript

**Phase 1: Enable TypeScript alongside JavaScript**

```json
// tsconfig.json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "outDir": "./dist",
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": false,
    "noImplicitAny": false
  },
  "include": ["src/**/*"]
}
```

**Phase 2: Rename files gradually**

```bash
# Convert one file at a time
mv src/utils/helpers.js src/utils/helpers.ts

# Add minimal type annotations
# Fix any type errors
# Run tests to verify
```

**Phase 3: Enable stricter checks incrementally**

```json
// Progression of strict options
{
  "compilerOptions": {
    // Step 1: Basic strictness
    "noImplicitAny": true,

    // Step 2: Null safety
    "strictNullChecks": true,

    // Step 3: Full strict mode
    "strict": true,

    // Step 4: Extra safety (optional)
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### JSDoc for Gradual Typing

```javascript
// Before full migration, use JSDoc
/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 */

/**
 * Find user by ID
 * @param {string} id - User ID
 * @returns {Promise<User | null>}
 */
async function findUser(id) {
  // implementation
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T | undefined}
 */
function first(items) {
  return items[0];
}
```

### CommonJS to ESM Migration

```json
// package.json
{
  "type": "module"
}
```

```typescript
// Before (CommonJS)
const express = require('express');
const { UserService } = require('./user.service');
module.exports = { router };

// After (ESM)
import express from 'express';
import { UserService } from './user.service.js'; // Note .js extension
export { router };
```
