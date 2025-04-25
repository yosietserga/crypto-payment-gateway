# Crypto Payment Gateway Testing

This directory contains tests for the Crypto Payment Gateway system.

## Test Structure

- `e2e/`: End-to-end tests for API endpoints
- `unit/`: Unit tests for individual components
- `integration/`: Integration tests for connected components
- `setup.ts`: TypeScript setup for tests with TypeORM mocks and entities
- `reflect-metadata.js`: Simple reflect-metadata loader for non-TypeScript tests
- `run-api-tests.js`: Script to run API tests with server management

## Running Tests

### Full Test Suite

```bash
npm test
```

### API Tests

```bash
# Run with TypeScript validation
npm run test:api

# Run simplified version (just health check) to verify API is running
npm run test:api-no-ts
```

### Integration Tests

```bash
npm run test:integration
```

### Unit Tests

```bash
npm run test:unit
```

## Troubleshooting

### TypeScript Errors

If you encounter TypeScript errors related to entity imports or circular dependencies, you can:

1. Use the `--no-ts-check` flag with the API tests script:
   ```bash
   npm run test:api-no-ts
   ```

2. Fix the circular dependencies in the setup.ts file by:
   - Mocking problematic entities with jest.mock
   - Using proper export syntax
   - Breaking circular dependencies between entities

### Server Issues

If the server fails to start during testing:

1. Check if you have a server already running on port 3000
2. Verify database connection settings
3. Check if RabbitMQ is available if required
4. Look for errors in the server startup logs
5. Try running the server manually with `npm run dev` and debug

## Writing Tests

When writing tests, follow these guidelines:

1. Use descriptive test names
2. Isolate tests from external services when possible
3. Mock external dependencies
4. Clean up test data after tests
5. For end-to-end tests, ensure the server is running before tests execute 