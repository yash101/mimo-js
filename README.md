# mimo-js

[![npm version](https://badge.fury.io/js/mimo.svg)](https://badge.fury.io/js/mimo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Multi-in, multi-out, MIMO. Simple. Elegant. Easy. AsyncGenerators made easy!**

`AsyncMux` is a powerful TypeScript/JavaScript library that provides a **M:N async generator multiplexer**. It allows you to easily combine multiple async generators into multiple outputs, creating a flexible broadcasting system for async data streams.

## ✨ Features

- 🚀 **M:N Multiplexing**: Multiple inputs to multiple outputs, thus the name "MIMO"
- 🔄 **Async Generator Support**: Works seamlessly with async generators
- 📡 **Broadcast Pattern**: All inputs are replicated to all outputs
- 🛡️ **Type Safe**: Full TypeScript support with generics
- 🧹 **Memory Efficient**: Automatic cleanup and resource management
- ⚡ **Non-blocking**: Asynchronous operations don't block each other
- 🎯 **Simple API**: Easy to use with minimal boilerplate

## ⁉️ What is an Async Generator?

Async generators in JavaScript are special functions with fancy syntax which allow you to produce sequences of values asynchronously.

The example below shows a simple async generator that yields numbers from 0 to 4, waiting 1 second between each yield:

```javascript
async function* asyncGeneratorExample() {
  for (let i = 0; i < 5; i++) {
    // Simulate an asynchronous operation
    await new Promise(resolve => setTimeout(resolve, 1000));
    yield i; // Yield the next value in the sequence
  }
}
```

## 🛠️ Why Use AsyncMux?

A single async generator is easy to work with. But it can be only consumed by one consumer at a time. But sometimes we want more complex patterns:

Perhaps we're reading data from a streaming API and want to broadcast that data to multiple consumers? In this situation, JavaScript's async generators 
and async APIs fall short. Achieving bug-free multiplexing with async generators is tricky, error prone, and makes multi-threading in C and assembly look
easy.

It's JavaScript after all. It should be simple and elegant. I made it simple and elegant with `AsyncMux`!

## 📦 Installation

```bash
npm install mimo
```

Installation couldn't be easier! Just use npm to install the `mimo` package into your project.

Or if you're a risky cowboy, just copy and paste `src/index.ts` into your codebase, rename it something useful, and call it a day!

## 🚀 Quick Start

```typescript
import AsyncMux from 'mimo';

// Create an AsyncMux
const mux = new AsyncMux<number>();

// Add some async generators as inputs
async function* numbers() {
  for (let i = 1; i <= 3; i++) {
    yield i;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function* letters() {
  const chars = ['a', 'b', 'c'];
  for (const char of chars) {
    yield char;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}

// Add inputs to the mux
mux.in(numbers());
mux.in(letters());

// Create multiple outputs
const output1 = mux.out();
const output2 = mux.out();

// Consume from outputs
(async () => {
  for await (const item of output1.generator) {
    console.log('Output 1:', item);
  }
})();

(async () => {
  for await (const item of output2.generator) {
    console.log('Output 2:', item);
  }
})();

// Later, stop the mux
setTimeout(() => mux.stop(), 2000);
```

**Output:**
```
Output 1: 1
Output 2: 1
Output 1: a
Output 2: a
Output 1: 2
Output 2: 2
Output 1: b
Output 2: b
Output 1: 3
Output 2: 3
Output 1: c
Output 2: c
```

## 📚 Learning the Library

The best way to learn how to use `AsyncMux` is to read its unit tests in `src/index.test.ts`. The unit tests each build on one feature at a time
demonstrating multiple useage patterns.

## 📚 API Reference

### `AsyncMux<T>`

The main multiplexer class that handles async generator multiplexing.

#### Constructor

```typescript
const mux = new AsyncMux<T>();
```

Creates a new multiplexer instance.

#### `in(input: AsyncGenerator<T>): () => void`

Adds an async generator as an input source.

**Parameters:**
- `input`: Async generator to add as input

**Returns:** Cleanup function to remove the input

**Example:**
```typescript
mux.in(myAsyncGenerator);
```

#### `out(): { generator: AsyncGenerator<T>, stop: () => void }`

Creates a new output that receives all values from all inputs.

**Returns:** Object containing:
- `generator`: Async generator that yields values
- `stop`: Function to stop this specific output

**Example:**
```typescript
const { generator, stop } = mux.out();

for await (const value of generator) {
  console.log(value);
}

// Stop this output specifically
stop();
```

#### `push(item: T): void`

Pushes a value directly to all outputs (bypassing inputs).

**Parameters:**
- `item`: Value to push to all outputs

**Example:**
```typescript
mux.push('hello');
mux.push(42);
```

#### `stop(): void`

Stops the multiplexer and all inputs/outputs.

**Example:**
```typescript
mux.stop();
```

## 🎯 Use Cases

### 1. **Event Aggregation**
Combine multiple event sources into a single stream:

```typescript
const eventMux = new AsyncMux<Event>();

// Add different event sources
eventMux.in(mouseEvents());
eventMux.in(keyboardEvents());
eventMux.in(networkEvents());

// Single output handles all events
const { generator } = eventMux.out();
for await (const event of generator) {
  handleEvent(event);
}
```

### 2. **Data Replication**
Replicate data streams to multiple consumers:

```typescript
const dataMux = new AsyncMux<Data>();

// Single data source
dataMux.in(sensorReadings());

// Multiple consumers get identical data streams
const storage = dataMux.out();    // Store all readings
const monitoring = dataMux.out(); // Real-time monitoring
const analytics = dataMux.out();  // Analytics processing

// All consumers receive every single data point
```

### 3. **Real-time Dashboard**
Feed data sources to multiple dashboard components:

```typescript
const dashboardMux = new AsyncMux<Metric>();

// Add metric sources
dashboardMux.in(systemMetrics());
dashboardMux.in(userActivity());

// All dashboard components receive ALL metrics
const chartOutput = dashboardMux.out();    // Charts component
const alertOutput = dashboardMux.out();    // Alerts component
const logOutput = dashboardMux.out();      // Logging component

// Every component gets every metric from every source
```

### 4. **Event Broadcasting**
Broadcast events to multiple subscribers:

```typescript
const eventMux = new AsyncMux<Event>();

// Single event source
eventMux.in(userActions());

// Multiple subscribers get ALL events
const logger = eventMux.out();      // Logs all events
const analytics = eventMux.out();   // Tracks analytics
const notifications = eventMux.out(); // Sends notifications

// All three outputs receive every single event
```

## 🔧 Advanced Usage

### Error Handling

Inputs that throw errors are automatically removed from the mux:

```typescript
async function* faultyGenerator() {
  yield 1;
  yield 2;
  throw new Error('Something went wrong');
  yield 3; // Never reached
}

mux.in(faultyGenerator()); // Error is caught internally
```

### Cleanup

Always clean up resources when done:

```typescript
const mux = new AsyncMux<number>();

// Add inputs
mux.in(generator1()),
mux.in(generator2()),

// Create outputs
const outputs = [
  mux.out(),
  mux.out(),
];

// Cleanup function
const cleanup = () => {
  outputs.forEach(output => output.stop());
  mux.stop();
};

// Use cleanup when done
process.on('SIGINT', cleanup);
```

### Performance Considerations

- **Memory**: Queues are processed efficiently, but very high-frequency inputs may accumulate
- **Concurrency**: Multiple inputs/outputs work simultaneously without blocking
- **Cleanup**: Always call `stop()` to prevent resource leaks

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## ✅ Behavior verified by automated tests

The project contains unit tests in `src/index.test.ts` that verify the core behaviors of `AsyncMux`. The tests exercise representative usage patterns and ensure the mux behaves as documented. Here's a short summary of what the tests cover (useful when reading the test file or adding more tests):

- Constructor: creating a new `AsyncMux<T>()` returns a usable instance.
- 1:1 (single producer -> single consumer): adding one async generator with `in()` and consuming from `out()` yields the generator's sequence.
- 1:N (single producer -> many consumers): multiple calls to `out()` receive the entire input sequence (fan-out behavior).
- N:1 (many producers -> single consumer): multiple inputs added via `in()` are merged into a single stream; order may vary depending on timing but all values are delivered.
- N:M (many producers -> many consumers): merged inputs are broadcast to every output produced by `out()` (merge + fan-out combined).
- stop() and push(): stopping the mux via `stop()` cancels inputs/outputs; `push(item)` allows pushing items directly to all outputs (bypassing inputs) and is verified alongside stop behavior.
- Exiting outputs: if no inputs are present, outputs created with `out()` will exit/complete immediately (the tests assert that an output with no inputs yields no values and finishes).

These tests are a small, runnable specification of expected behavior. If you modify the mux implementation, run the test suite to verify these behaviors remain intact.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yash101/mimo-js/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yash101/mimo-js/discussions)

## 🙏 Acknowledgments

Inspired by the elegance of async generators and the need for simple multiplexing in modern JavaScript applications.

---

**Made with ❤️ by [yash101](https://github.com/yash101**
