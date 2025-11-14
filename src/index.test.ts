/**
 * @file index.test.ts
 * @description Unit tests for AsyncMux
 */

import { AsyncMux } from './index';

/**
 * Helper function to create a simple async generator
 */
async function* simpleGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe('AsyncMux', () => {
  describe('Constructor', () => {
    it('should create a new AsyncMux instance', () => {
      const mux = new AsyncMux<number>();
      expect(mux).toBeInstanceOf(AsyncMux);
    });
  });

  describe('test functionality', () => {
    it ('should support 1:1', async () => {
      const mux = new AsyncMux<number>();
      mux.in(simpleGenerator([1, 2, 3]));

      const { generator, stop } = mux.out();
      const it = generator[Symbol.asyncIterator]();

      const got: number[] = [];
      for (let i = 0; i < 3; i++) {
        const { value, done } = await it.next();
        expect(done).toBe(false);
        got.push(value as number);
      }

      expect(got).toEqual([1, 2, 3]);

      // stop the output and ensure generator completes
      stop();
      const final = await it.next();
      expect(final.done).toBe(true);
    });

    it ('should support 1:N', async () => {
      const mux = new AsyncMux<number>();
      mux.in(simpleGenerator([10, 20]));

      const out1 = mux.out();
      const out2 = mux.out();

      async function collect(gen: AsyncGenerator<number>, count: number) {
        const it = gen[Symbol.asyncIterator]();
        const arr: number[] = [];
        for (let i = 0; i < count; i++) {
          const { value, done } = await it.next();
          expect(done).toBe(false);
          arr.push(value as number);
        }
        return { it, arr };
      }

      const p1 = (async () => {
        const { it, arr } = await collect(out1.generator, 2);
        out1.stop();
        const end = await it.next();
        expect(end.done).toBe(true);
        return arr;
      })();

      const p2 = (async () => {
        const { it, arr } = await collect(out2.generator, 2);
        out2.stop();
        const end = await it.next();
        expect(end.done).toBe(true);
        return arr;
      })();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual([10, 20]);
      expect(r2).toEqual([10, 20]);
    });

    it ('should support N:1', async () => {
      const mux = new AsyncMux<number>();

      // delayed generator to control ordering
      async function* delayed(items: number[], startDelay: number) {
        for (let i = 0; i < items.length; i++) {
          await new Promise(r => setTimeout(r, startDelay + i * 10));
          yield items[i];
        }
      }

      mux.in(delayed([1, 3], 5));
      mux.in(delayed([2, 4], 10));

      const out = mux.out();
      const it = out.generator[Symbol.asyncIterator]();

      const got: number[] = [];
      for (let i = 0; i < 4; i++) {
        const { value, done } = await it.next();
        expect(done).toBe(false);
        got.push(value as number);
      }

      // merged sequence should be 1,2,3,4 with the chosen delays
      expect(got).toEqual([1, 2, 3, 4]);

      out.stop();
      const final = await it.next();
      expect(final.done).toBe(true);
    });

    it ('should support N:M', async () => {
      const mux = new AsyncMux<number>();

      async function* delayed(items: number[], startDelay: number) {
        for (let i = 0; i < items.length; i++) {
          await new Promise(r => setTimeout(r, startDelay + i * 10));
          yield items[i];
        }
      }

      mux.in(delayed([1, 3], 5));
      mux.in(delayed([2, 4], 10));

      const outA = mux.out();
      const outB = mux.out();

      async function collectAndClose(o: { generator: AsyncGenerator<number>; stop: () => void }) {
        const it = o.generator[Symbol.asyncIterator]();
        const arr: number[] = [];
        for (let i = 0; i < 4; i++) {
          const { value, done } = await it.next();
          expect(done).toBe(false);
          arr.push(value as number);
        }
        o.stop();
        const end = await it.next();
        expect(end.done).toBe(true);
        return arr;
      }

      const [rA, rB] = await Promise.all([collectAndClose(outA), collectAndClose(outB)]);
      expect(rA).toEqual([1, 2, 3, 4]);
      expect(rB).toEqual([1, 2, 3, 4]);
    });

    it ('should stop correctly', async () => {
      const mux = new AsyncMux<number>();
      const out = mux.out();

      // stopping the mux should cause in() to throw and outputs to finish
      mux.stop();

      // out generator should be already completed
      const it = out.generator[Symbol.asyncIterator]();
      const first = await it.next();
      expect(first.done).toBe(true);

      // in() should throw when mux is stopped
      expect(() => mux.in(simpleGenerator([1]))).toThrow();
    });

    it ('should support pushing values to the outputs directly', async () => {
      const mux = new AsyncMux<number>();
      const out = mux.out();

      // push directly
      mux.push(42);

      const it = out.generator[Symbol.asyncIterator]();
      const { value, done } = await it.next();
      expect(done).toBe(false);
      expect(value).toBe(42);

      // close output
      out.stop();
      const end = await it.next();
      expect(end.done).toBe(true);
    });
  });
});
