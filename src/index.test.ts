/**
 * @file index.test.ts
 * @description Unit tests for AsyncMux
 */

import AsyncMux from './index';

/**
 * Helper function to create a simple async generator
 */
async function* simpleGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}
describe('AsyncMux — examples and usage', () => {
  /**
   * Quick smoke: constructor returns an object of the right type.
   * This demonstrates how to create a mux before using it.
   * Example:
   * const mux = new AsyncMux<number>();
   */
  it('constructor: creates an AsyncMux instance', () => {
    const mux = new AsyncMux<number>();
    expect(mux).toBeInstanceOf(AsyncMux);
  });

  /**
   * Example 1: 1 producer -> 1 consumer (1:1)
   * This shows the minimal flow: call `in()` with an async generator,
   * call `out()` to get a generator you can iterate, then stop the
   * output when done.
   */
  it('example: 1:1 flow', async () => {
    const mux = new AsyncMux<number>();
    mux.in(simpleGenerator([1, 2, 3]));
    
    const out = mux.out();
    const vals = [];
    for await (const value of out.generator) {
      vals.push(value);
    }

    expect(vals).toEqual([1, 2, 3]);
  });

  /**
   * Example 2: 1 producer -> N consumers (1:N)
   * Demonstrates that multiple outputs see the entire sequence.
   */
  it('example: 1:N (fan-out)', async () => {
    const mux = new AsyncMux<number>();
    mux.in(simpleGenerator([10, 20, 30]));
    const outs = [ mux.out(), mux.out(), mux.out() ];

    await Promise.all(outs.map(async out => {
      const vals = [];
      for await (const value of out.generator) {
        vals.push(value);
      }

      expect(vals).toEqual([10, 20, 30]);
    }));
  });

  /**
   * Example 3: N producers -> 1 consumer (N:1)
   * Show merging behavior where inputs interleave depending on timing.
   */
  it('example: N:1 (merge)', async () => {
    const mux = new AsyncMux<number>();

    let mult = 1;
    async function* testGen() {
      const m = mult++;
      for (let i = 1; i <= 3; i++) {
        yield i * m;
      }
    }

    mux.in(testGen());
    mux.in(testGen());
    mux.in(testGen());

    const out = mux.out();
    const result: number[] = [];
    for await (const value of out.generator) {
      result.push(value);
    }

    // The exact order may vary due to async timing, but all values should be present
    expect(result.sort()).toEqual([1, 2, 3, 2, 4, 6, 3, 6, 9].sort());
  });

  /**
   * Example 4: N producers -> M consumers (N:M)
   * Each output sees the same merged event stream.
   */
  it('example: N:M (merge + fan-out)', async () => {
    const mux = new AsyncMux<number>();

    let mult = 1;
    async function* testGen() {
      const m = mult++;
      for (let i = 1; i <= 3; i++) {
        yield i * m;
      }
    }

    mux.in(testGen());
    mux.in(testGen());
    mux.in(testGen());

    const outs = [ mux.out(), mux.out() ];

    await Promise.all(outs.map(async out => {
      const result: number[] = [];
      for await (const value of out.generator) {
        result.push(value);
      }
      
      // The exact order may vary due to async timing, but all values should be present
      expect(result.sort()).toEqual([1, 2, 3, 2, 4, 6, 3, 6, 9].sort());
    }));
  });

  /**
   * Example 5: stop behavior and direct push()
   * Demonstrates calling `stop()` on the mux and pushing values directly.
   */
  it('example: stop and push', async () => {
    const mux = new AsyncMux<number>();

    const testGen = async function* () {
      for (let i = 1; i <= 5; i++) {
        await new Promise(res => setTimeout(res, 10));
        yield i;
      }
    };
    mux.in(testGen());

    const out = mux.out();
    const result: number[] = [];
    const consumer = (async () => {
      for await (const value of out.generator) {
        result.push(value);
      }
    })();

    // Let it run a bit, then push directly and stop
    await new Promise(res => setTimeout(res, 25));
    mux.stop();

    await consumer;

    // Should have received some values before stopping
    expect(result.length).toBeGreaterThan(0);
    // Should not have all values since we stopped early
    expect(result).not.toEqual([1, 2, 3, 4, 5]);
  });

  it('should return exiting generators when no inputs are present', async () => {
    const mux = new AsyncMux<number>();
    const out = mux.out();
    const result: number[] = [];
    let resolve: any = null;

    const consumer = (async () => {
      for await (const value of out.generator) {
        result.push(value);
      }

      if (resolve) { // short circuit to make test faster
        (resolve as () => {})();
      }
    })();

    // Wait a bit to ensure the generator has time to exit
    await new Promise(res => {
      setTimeout(res, 50);
      resolve = res;
    });

    await consumer;
    expect(result).toEqual([]);
  });
});
