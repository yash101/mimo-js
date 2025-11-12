# Test Documentation for mimo-js

## Overview

Comprehensive unit test suite for the `AsyncMux` class - a multi-input, multi-output async generator multiplexer.

## Test Setup

### Dependencies
- **Jest**: Testing framework
- **ts-jest**: TypeScript support for Jest
- **@types/jest**: TypeScript type definitions

### Installation
```bash
npm install --save-dev jest @types/jest ts-jest
```

### Configuration
- `jest.config.js`: Jest configuration for TypeScript
- Test files: `*.test.ts` pattern
- Tests excluded from build output in `tsconfig.json`

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### Test File: `src/index.test.ts`

The test suite is organized into the following sections:

#### 1. Constructor Tests
- Verifies `AsyncMux` instance creation

#### 2. `in()` Method Tests
- Accepts async generators as input
- Returns cleanup function for input removal
- Prevents adding inputs after stop
- Handles multiple simultaneous inputs

#### 3. `out()` Method Tests
- Returns generator and stop function
- Emits values from input generators
- Supports multiple outputs receiving same values
- Allows individual output termination

#### 4. `push()` Method Tests
- Pushes values to all outputs
- Handles push after stop gracefully
- Distributes values to multiple outputs

#### 5. `stop()` Method Tests
- Stops the mux cleanly
- Idempotent (can be called multiple times)
- Prevents new inputs after stop
- Terminates all outputs

#### 6. Integration Tests
- Complex M:N (multiple input to multiple output) scenarios
- Mixed push and input generator usage
- Empty input handling
- Error handling in generators
- High-volume rapid push operations
- Cleanup function behavior

#### 7. Edge Cases
- Output created after inputs added
- Zero outputs scenario
- Output stopped before mux

## Test Coverage

Current coverage: **95%**

| Metric | Coverage |
|--------|----------|
| Statements | 95% |
| Branches | 85% |
| Functions | 100% |
| Lines | 94.73% |

### Uncovered Lines
- Line 89: Error catch block in input processor
- Line 100: Queue resolution edge case
- Line 130: Generator catch block

These are primarily error handling paths that are difficult to trigger in tests.

## Helper Functions

### `simpleGenerator<T>(items: T[])`
Creates a basic async generator from an array.

### `delayedGenerator<T>(items: T[], delayMs: number)`
Creates an async generator with configurable delays between items.

### `collectItems<T>(generator: AsyncGenerator<T>, maxItems?: number)`
Collects items from an async generator into an array.

## Key Test Patterns

### Filtering null values
Due to the implementation detail where `stop()` pushes `null` to unblock waiting generators, tests filter out `null` values when checking expected results:

```typescript
const filtered = items.filter(item => item !== null);
expect(filtered).toEqual(expectedItems);
```

### Timing management
Tests use `setTimeout` to coordinate async operations:

```typescript
setTimeout(() => mux.stop(), 50);
```

### Concurrent collection
Multiple outputs are tested concurrently using `Promise.all`:

```typescript
const [items1, items2] = await Promise.all([
  collectItems(output1.generator, 3),
  collectItems(output2.generator, 3)
]);
```

## Best Practices

1. **Always cleanup**: Call `mux.stop()` or `output.stop()` in tests to prevent hanging promises
2. **Use appropriate timeouts**: Balance between test speed and reliability
3. **Test both sync and async paths**: Cover immediate and delayed operations
4. **Verify error handling**: Ensure errors don't crash the mux
5. **Test edge cases**: Empty inputs, zero outputs, rapid operations

## Future Test Enhancements

Potential areas for additional testing:
- Memory leak detection under high load
- Backpressure scenarios
- Very large data volumes
- Performance benchmarking
- Concurrent add/remove operations

## Contributing

When adding new features to `AsyncMux`, ensure:
1. New tests cover the feature
2. All existing tests still pass
3. Coverage remains above 90%
4. Tests are documented if behavior is non-obvious
