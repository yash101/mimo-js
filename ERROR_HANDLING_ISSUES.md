# Error Handling Issues in AsyncMux

This document outlines critical error handling issues found during the code audit of the AsyncMux library. Each issue represents a potential failure mode that could affect production deployments.

---

## Issue 1: Unhandled Exceptions in Input Generators

**Severity:** High  
**Location:** `src/index.ts`, lines 54-70 (`in()` method)

### Description
The `in()` method spawns an async IIFE that iterates over input generators. If an input generator throws an exception, it is silently swallowed with no error handling, logging, or user notification.

### Current Code
```typescript
in(input: AsyncGenerator<T>): void {
  this.inputCount++;

  (async () => {
    for await (const item of input) {  // ⚠️ No try-catch
      if (this.stopFlag)
        break;
      this.push(item);
    }

    this.inputCount--;
    if (this.inputCount === 0) {
      this.stop();
    }
  })();
}
```

### Problem Scenario
```typescript
async function* faultyGenerator() {
  yield 1;
  throw new Error('Database connection failed'); // ⚠️ Error is completely silent
  yield 2;
}

const mux = new AsyncMux<number>();
mux.in(faultyGenerator());
// User has no way to know an error occurred
```

### Impact
- Errors in input generators are completely invisible to users
- The input counter is never decremented, potentially preventing proper shutdown
- Silent failures make debugging extremely difficult
- Violates principle of least surprise for library users

### Recommendations
1. Add try-catch around the for-await loop
2. Provide an error callback option in the constructor or `in()` method
3. Consider emitting error events or logging errors
4. Ensure `inputCount` is always decremented even on error
5. Document error handling behavior in the API

---

## Issue 2: Unhandled Promise Rejections in Output Generators

**Severity:** High  
**Location:** `src/index.ts`, lines 113-127 (output generator in `out()` method)

### Description
The output generator function can encounter multiple error scenarios, but none are wrapped in try-catch blocks. Unhandled promise rejections could crash the process in Node.js or cause undefined behavior.

### Current Code
```typescript
const generator: AsyncGenerator<T> =
  (async function* outputGen(this: AsyncMux<T>) {
    while (this.inputCount > 0 || queue.length > 0) {
      const item = await asyncQueue.pull();  // ⚠️ No error handling
      if (item === StopSymbol) {
        break;
      }

      yield item as T;  // ⚠️ No error handling
    }

    this.queues.delete(asyncQueue);
  })
  .call(this);
```

### Problem Scenarios
1. If `asyncQueue.pull()` somehow rejects (e.g., due to external code modification)
2. If `yield` encounters an error in the consumer
3. If `this.queues.delete()` throws (though unlikely)

### Impact
- Unhandled promise rejections can crash Node.js applications
- Errors in output consumption have no defined behavior
- Memory leaks if cleanup (`this.queues.delete()`) doesn't execute

### Recommendations
1. Wrap the generator body in try-catch or try-finally
2. Ensure cleanup always happens (use finally block)
3. Provide error propagation mechanism
4. Document error behavior for output generators

---

## Issue 3: Race Conditions with inputCount

**Severity:** Medium  
**Location:** `src/index.ts`, lines 65-68

### Description
Multiple async input processors can decrement `inputCount` concurrently without synchronization. JavaScript's single-threaded nature helps, but the async nature can still cause logical race conditions.

### Current Code
```typescript
this.inputCount--;  // ⚠️ No synchronization
if (this.inputCount === 0) {
  this.stop();
}
```

### Problem Scenario
```typescript
// Two inputs finish at nearly the same time:
// Thread 1: reads inputCount (2), decrements to 1
// Thread 2: reads inputCount (1), decrements to 0, calls stop()
// Thread 1: checks inputCount === 0, FALSE, doesn't call stop()
// This scenario is unlikely but the check-then-act pattern is fragile
```

However, more concerning:
```typescript
// If stop() is called externally while inputs are finishing:
mux.stop();  // Sets stopFlag, pushes StopSymbol
// Input finishes, decrements inputCount to 0, calls stop() AGAIN
// This pushes another StopSymbol to all queues
```

### Impact
- Multiple stop() calls push multiple StopSymbols
- Could cause outputs to receive unexpected behavior
- Inconsistent state during shutdown

### Recommendations
1. Use a flag to ensure `stop()` is only called once
2. Consider using atomic operations or proper synchronization
3. Document whether `stop()` is idempotent
4. Add tests for concurrent shutdown scenarios

---

## Issue 4: Memory Leak - No Backpressure Mechanism

**Severity:** High  
**Location:** `src/index.ts`, lines 82-89 (`pushItem` in `out()` method)

### Description
If an output is created but never consumed (or consumed slowly), the queue will grow unbounded as inputs continue producing values. There is no backpressure mechanism to slow down inputs.

### Current Code
```typescript
const pushItem = (item: T | typeof StopSymbol) => {
  queue.push(item);  // ⚠️ Unbounded queue growth
  if (resolve) {
    resolve();
    resolve = null;
    controlPromise = null;
  }
};
```

### Problem Scenario
```typescript
const mux = new AsyncMux<number>();

async function* infiniteProducer() {
  let i = 0;
  while (true) {
    yield i++;  // Produces values forever
    await new Promise(r => setTimeout(r, 1));
  }
}

mux.in(infiniteProducer());

// Create output but never consume it
const out = mux.out();
// out.generator is never iterated
// Queue grows indefinitely, causing memory leak
```

### Impact
- Memory exhaustion in production systems
- Slow consumers can cause memory pressure
- No way to detect or handle queue overflow
- Particularly dangerous with fast producers and slow consumers

### Recommendations
1. Implement queue size limits with configurable threshold
2. Add backpressure mechanism to pause inputs when queues are full
3. Provide events/callbacks when queue size exceeds threshold
4. Document memory characteristics and best practices
5. Consider dropping old items or rejecting new ones when queue is full
6. Add metrics for queue sizes

---

## Issue 5: No Error Propagation Mechanism

**Severity:** High  
**Location:** Overall architecture

### Description
The library provides no way for users to be notified of errors. There are no:
- Error callbacks
- Error events/emitters
- Ways to catch exceptions from generators
- Error state properties

### Current Behavior
```typescript
const mux = new AsyncMux<number>();

async function* errorProneInput() {
  yield 1;
  throw new Error('Critical failure');  // ⚠️ User never knows
}

mux.in(errorProneInput());

// No way to:
// - Register error handler
// - Check for errors
// - Receive error notifications
// - Distinguish between normal stop and error stop
```

### Impact
- Users cannot implement proper error handling
- Debugging is extremely difficult
- Production systems have no visibility into failures
- Cannot implement retry logic or fallback behavior
- Violates expectations for production-grade libraries

### Recommendations
1. Add error callback to constructor: `new AsyncMux<T>({ onError?: (error: Error) => void })`
2. Add error handler to `in()` method: `in(input, { onError?: (error: Error) => void })`
3. Consider using EventEmitter pattern for error events
4. Add `hasError` or `getErrors()` methods
5. Allow errors to optionally propagate to outputs
6. Provide comprehensive error handling examples in documentation

---

## Issue 6: Undefined Behavior on Multiple stop() Calls

**Severity:** Medium  
**Location:** `src/index.ts`, lines 156-159

### Description
The `stop()` method can be called multiple times, and each call pushes a `StopSymbol` to all queues. This could cause unexpected behavior in output generators.

### Current Code
```typescript
stop(): void {
  this.stopFlag = true;
  this.pushInternal(StopSymbol);  // ⚠️ No guard against multiple calls
}
```

### Problem Scenario
```typescript
const mux = new AsyncMux<number>();
const out = mux.out();

mux.stop();  // Pushes StopSymbol
mux.stop();  // Pushes StopSymbol AGAIN
mux.stop();  // Pushes StopSymbol AGAIN

// Output generator will see multiple StopSymbols in queue
// Behavior depends on implementation details
```

### Impact
- Unpredictable behavior with multiple stop calls
- Could cause outputs to behave inconsistently
- Not clear if stop() is idempotent

### Recommendations
1. Make `stop()` idempotent by checking if already stopped
2. Document whether multiple stop() calls are safe
3. Add tests for idempotency
4. Consider returning boolean indicating if stop was performed

---

## Issue 7: Type Safety Concerns with StopSymbol

**Severity:** Low  
**Location:** `src/index.ts`, lines 103, 117

### Description
The code casts `queue.shift()` directly to `T` without checking for `undefined`. While the logic appears to prevent empty queue access, race conditions or timing issues could cause problems.

### Current Code
```typescript
const pullItem = async (): Promise<T | typeof StopSymbol> => {
  if (queue.length > 0) {
    return queue.shift() as T;  // ⚠️ Could be undefined if queue emptied between check and shift
  }
  // ...
  await controlPromise;
  return queue.shift() as T;  // ⚠️ Same issue
};
```

### Problem Scenario
While unlikely due to single-threaded nature, the time between `queue.length > 0` check and `queue.shift()` could theoretically allow issues, especially with:
- Debugger breakpoints
- Very slow execution
- Future multi-threaded changes

### Impact
- Potential for undefined values to be yielded
- Type safety violations
- Hard-to-reproduce bugs in edge cases

### Recommendations
1. Add runtime checks: `const item = queue.shift(); if (item === undefined) throw new Error(...)`
2. Use non-null assertion with confidence: `queue.shift()!`
3. Restructure to eliminate the gap between check and shift
4. Document assumptions about single-threaded execution

---

## Issue 8: Lack of Input Cleanup/Cancellation

**Severity:** Medium  
**Location:** `src/index.ts`, line 54 (`in()` method return value)

### Description
The `in()` method returns `void`, but the interface suggests it should return a cleanup function (based on common patterns and TypeScript conventions). Users have no way to remove a specific input.

### Current Implementation
```typescript
in(input: AsyncGenerator<T>): void {
  // No way to cancel this specific input
}
```

### Expected Pattern
```typescript
in(input: AsyncGenerator<T>): () => void {
  // Return cleanup function
}
```

### Problem Scenario
```typescript
const mux = new AsyncMux<number>();
const cleanup = mux.in(problematicGenerator());
// Oops, cleanup is void!
// Can't remove just this input
// Must call mux.stop() which stops EVERYTHING
```

### Impact
- Cannot remove specific inputs without stopping entire mux
- Reduces flexibility for dynamic input management
- Makes resource cleanup more difficult

### Recommendations
1. Return a cleanup function from `in()`
2. Implement per-input cancellation mechanism
3. Update documentation to show cleanup pattern
4. Add tests for input removal

---

## Issue 9: No Validation of Input Parameters

**Severity:** Low  
**Location:** `src/index.ts`, multiple locations

### Description
The library does not validate input parameters. Passing `null`, `undefined`, or non-generator objects could cause cryptic errors.

### Current Code
```typescript
in(input: AsyncGenerator<T>): void {
  // No validation that input is actually an async generator
  this.inputCount++;
  (async () => {
    for await (const item of input) {  // ⚠️ Will fail cryptically if input is not iterable
      // ...
    }
  })();
}
```

### Problem Scenario
```typescript
const mux = new AsyncMux<number>();
mux.in(null);  // Type error, but might pass at runtime in JS
mux.in({ not: 'a generator' });  // Will fail with cryptic error
```

### Impact
- Cryptic error messages for users
- Harder to debug integration issues
- Poor developer experience

### Recommendations
1. Add parameter validation with clear error messages
2. Check if input has Symbol.asyncIterator
3. Throw descriptive errors for invalid inputs
4. Document parameter requirements

---

## Issue 10: Silent Failure Mode - Queue Cleanup

**Severity:** Low  
**Location:** `src/index.ts`, line 124

### Description
Queue cleanup (`this.queues.delete(asyncQueue)`) only happens if the output generator completes normally. If an exception occurs, the queue remains in the set, causing a memory leak.

### Current Code
```typescript
const generator: AsyncGenerator<T> =
  (async function* outputGen(this: AsyncMux<T>) {
    while (this.inputCount > 0 || queue.length > 0) {
      const item = await asyncQueue.pull();
      if (item === StopSymbol) {
        break;
      }
      yield item as T;
    }

    this.queues.delete(asyncQueue);  // ⚠️ Only reached if no exceptions
  })
  .call(this);
```

### Impact
- Memory leak if output generator throws
- Queue remains active even though generator stopped
- Can receive values forever

### Recommendations
1. Use try-finally to ensure cleanup
2. Test cleanup behavior with exceptions
3. Document cleanup guarantees

---

## Summary

This audit identified **10 critical error handling issues** that should be addressed to make AsyncMux production-ready:

1. ✋ **High Priority:**
   - Issue #1: Unhandled exceptions in input generators
   - Issue #2: Unhandled promise rejections in output generators
   - Issue #4: Memory leak - no backpressure mechanism
   - Issue #5: No error propagation mechanism

2. ⚠️ **Medium Priority:**
   - Issue #3: Race conditions with inputCount
   - Issue #6: Undefined behavior on multiple stop() calls
   - Issue #8: Lack of input cleanup/cancellation

3. 📝 **Low Priority:**
   - Issue #7: Type safety concerns with StopSymbol
   - Issue #9: No validation of input parameters
   - Issue #10: Silent failure mode - queue cleanup

These issues should be tracked as separate GitHub issues for proper prioritization and resolution.
