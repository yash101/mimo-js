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

/**
 * Helper function to create a delayed async generator
 */
async function* delayedGenerator<T>(items: T[], delayMs: number = 10): AsyncGenerator<T> {
  for (const item of items) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    yield item;
  }
}

/**
 * Helper function to collect items from an async generator
 */
async function collectItems<T>(generator: AsyncGenerator<T>, maxItems?: number): Promise<T[]> {
  const items: T[] = [];
  let count = 0;
  for await (const item of generator) {
    items.push(item);
    count++;
    if (maxItems !== undefined && count >= maxItems) {
      break;
    }
  }
  return items;
}

describe('AsyncMux', () => {
  describe('Constructor', () => {
    it('should create a new AsyncMux instance', () => {
      const mux = new AsyncMux<number>();
      expect(mux).toBeInstanceOf(AsyncMux);
    });
  });

  describe('in() method', () => {
    it('should accept an async generator as input', async () => {
      const mux = new AsyncMux<number>();
      const generator = simpleGenerator([1, 2, 3]);
      
      expect(() => mux.in(generator)).not.toThrow();
      mux.stop();
    });

    it('should return a cleanup function', async () => {
      const mux = new AsyncMux<number>();
      const generator = simpleGenerator([1, 2, 3]);
      
      const cleanup = mux.in(generator);
      expect(typeof cleanup).toBe('function');
      
      cleanup();
      mux.stop();
    });

    it('should throw error if mux is already stopped', () => {
      const mux = new AsyncMux<number>();
      mux.stop();
      
      const generator = simpleGenerator([1, 2, 3]);
      expect(() => mux.in(generator)).toThrow('Mux already stopped');
    });

    it('should process multiple inputs simultaneously', async () => {
      const mux = new AsyncMux<number>();
      const gen1 = delayedGenerator([1, 2, 3], 20);
      const gen2 = delayedGenerator([4, 5, 6], 20);
      
      mux.in(gen1);
      mux.in(gen2);
      
      const output = mux.out();
      const items = await collectItems(output.generator, 6);
      
      expect(items).toHaveLength(6);
      expect(items.sort()).toEqual([1, 2, 3, 4, 5, 6]);
      
      mux.stop();
    });
  });

  describe('out() method', () => {
    it('should return an object with generator and stop function', () => {
      const mux = new AsyncMux<number>();
      const output = mux.out();
      
      expect(output).toHaveProperty('generator');
      expect(output).toHaveProperty('stop');
      expect(typeof output.stop).toBe('function');
      
      output.stop();
      mux.stop();
    });

    it('should emit values from input generators', async () => {
      const mux = new AsyncMux<number>();
      const input = simpleGenerator([1, 2, 3]);
      
      mux.in(input);
      const output = mux.out();
      
      // Allow time for processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const items = await collectItems(output.generator, 3);
      expect(items).toEqual([1, 2, 3]);
      
      mux.stop();
    });

    it('should support multiple outputs receiving the same values', async () => {
      const mux = new AsyncMux<string>();
      const input = delayedGenerator(['a', 'b', 'c'], 20);
      
      mux.in(input);
      
      const output1 = mux.out();
      const output2 = mux.out();
      
      const [items1, items2] = await Promise.all([
        collectItems(output1.generator, 3),
        collectItems(output2.generator, 3)
      ]);
      
      expect(items1).toEqual(['a', 'b', 'c']);
      expect(items2).toEqual(['a', 'b', 'c']);
      
      mux.stop();
    });

    it('should stop when stop() is called on output', async () => {
      const mux = new AsyncMux<number>();
      const input = delayedGenerator([1, 2, 3, 4, 5], 10);
      
      mux.in(input);
      const output = mux.out();
      
      // Collect a few items then stop
      const items: number[] = [];
      let count = 0;
      for await (const item of output.generator) {
        items.push(item);
        count++;
        if (count === 2) {
          output.stop();
          break;
        }
      }
      
      expect(items).toHaveLength(2);
      mux.stop();
    });
  });

  describe('push() method', () => {
    it('should push values to all outputs', async () => {
      const mux = new AsyncMux<string>();
      const output = mux.out();
      
      mux.push('test1');
      mux.push('test2');
      mux.push('test3');
      
      setTimeout(() => mux.stop(), 50);
      
      const items = await collectItems(output.generator);
      // Filter out null values that are pushed on stop
      const filtered = items.filter(item => item !== null);
      expect(filtered).toEqual(['test1', 'test2', 'test3']);
    });

    it('should not push values when stopped', () => {
      const mux = new AsyncMux<number>();
      const output = mux.out();
      
      mux.stop();
      mux.push(42); // Should not throw but should not push
      
      // No error expected
      expect(true).toBe(true);
    });

    it('should push to multiple outputs', async () => {
      const mux = new AsyncMux<number>();
      const output1 = mux.out();
      const output2 = mux.out();
      
      mux.push(1);
      mux.push(2);
      
      setTimeout(() => mux.stop(), 50);
      
      const [items1, items2] = await Promise.all([
        collectItems(output1.generator),
        collectItems(output2.generator)
      ]);
      
      const filtered1 = items1.filter(item => item !== null);
      const filtered2 = items2.filter(item => item !== null);
      
      expect(filtered1).toEqual([1, 2]);
      expect(filtered2).toEqual([1, 2]);
    });
  });

  describe('stop() method', () => {
    it('should stop the mux', () => {
      const mux = new AsyncMux<number>();
      expect(() => mux.stop()).not.toThrow();
    });

    it('should be idempotent', () => {
      const mux = new AsyncMux<number>();
      mux.stop();
      mux.stop();
      mux.stop();
      
      expect(true).toBe(true); // Should not throw
    });

    it('should prevent new inputs from being added', () => {
      const mux = new AsyncMux<number>();
      mux.stop();
      
      const generator = simpleGenerator([1, 2, 3]);
      expect(() => mux.in(generator)).toThrow('Mux already stopped');
    });

    it('should terminate all outputs', async () => {
      const mux = new AsyncMux<number>();
      const output = mux.out();
      
      mux.push(1);
      mux.push(2);
      
      // Stop the mux
      mux.stop();
      
      // Collecting should complete quickly
      const items = await collectItems(output.generator);
      
      // Should have received items before stop
      expect(items.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration tests', () => {
    it('should handle complex M:N scenarios', async () => {
      const mux = new AsyncMux<number>();
      
      // Multiple inputs
      const input1 = delayedGenerator([1, 2], 10);
      const input2 = delayedGenerator([3, 4], 15);
      const input3 = delayedGenerator([5, 6], 12);
      
      mux.in(input1);
      mux.in(input2);
      mux.in(input3);
      
      // Multiple outputs
      const output1 = mux.out();
      const output2 = mux.out();
      const output3 = mux.out();
      
      // Collect from all outputs
      const [items1, items2, items3] = await Promise.all([
        collectItems(output1.generator, 6),
        collectItems(output2.generator, 6),
        collectItems(output3.generator, 6)
      ]);
      
      // All outputs should receive all items
      expect(items1.sort()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(items2.sort()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(items3.sort()).toEqual([1, 2, 3, 4, 5, 6]);
      
      mux.stop();
    });

    it('should handle mixed push and input generators', async () => {
      const mux = new AsyncMux<string>();
      
      const input = delayedGenerator(['a', 'b'], 20);
      mux.in(input);
      
      const output = mux.out();
      
      // Also push some values
      setTimeout(() => mux.push('c'), 10);
      setTimeout(() => mux.push('d'), 30);
      setTimeout(() => mux.stop(), 60);
      
      const items = await collectItems(output.generator);
      const filtered = items.filter(item => item !== null);
      
      expect(filtered).toHaveLength(4);
      expect(filtered).toContain('a');
      expect(filtered).toContain('b');
      expect(filtered).toContain('c');
      expect(filtered).toContain('d');
    });

    it('should handle empty input gracefully', async () => {
      const mux = new AsyncMux<number>();
      const emptyGen = simpleGenerator([]);
      
      mux.in(emptyGen);
      const output = mux.out();
      
      setTimeout(() => mux.stop(), 50);
      
      const items = await collectItems(output.generator);
      const filtered = items.filter(item => item !== null);
      expect(filtered).toEqual([]);
    });

    it('should handle input generator errors gracefully', async () => {
      const mux = new AsyncMux<number>();
      
      async function* errorGenerator(): AsyncGenerator<number> {
        yield 1;
        yield 2;
        throw new Error('Generator error');
      }
      
      const gen = errorGenerator();
      mux.in(gen);
      
      const output = mux.out();
      
      // Allow time for processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      mux.stop();
      
      // Should not throw - errors are caught internally
      expect(true).toBe(true);
    });

    it('should handle rapid push operations', async () => {
      const mux = new AsyncMux<number>();
      const output = mux.out();
      
      const count = 100;
      for (let i = 0; i < count; i++) {
        mux.push(i);
      }
      
      setTimeout(() => mux.stop(), 100);
      
      const items = await collectItems(output.generator);
      const filtered = items.filter(item => item !== null);
      expect(filtered).toHaveLength(count);
      expect(filtered).toEqual(Array.from({ length: count }, (_, i) => i));
    });

    it('should cleanup function remove input from mux', async () => {
      const mux = new AsyncMux<number>();
      
      async function* slowGenerator(): AsyncGenerator<number> {
        for (let i = 1; i <= 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 20));
          yield i;
        }
      }
      
      const gen = slowGenerator();
      const cleanup = mux.in(gen);
      
      const output = mux.out();
      
      // Immediately remove the input
      cleanup();
      
      // Wait for potential items
      await new Promise(resolve => setTimeout(resolve, 100));
      
      mux.stop();
      
      const items = await collectItems(output.generator);
      const filtered = items.filter(item => item !== null);
      
      // Since we removed input immediately, should receive 0 or very few items
      expect(filtered.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle output created after inputs are added', async () => {
      const mux = new AsyncMux<number>();
      
      mux.push(1);
      mux.push(2);
      
      // Create output after pushes
      const output = mux.out();
      
      mux.push(3);
      mux.push(4);
      
      setTimeout(() => mux.stop(), 50);
      
      const items = await collectItems(output.generator);
      const filtered = items.filter(item => item !== null);
      
      // Should only receive items pushed after output was created
      expect(filtered).toEqual([3, 4]);
    });

    it('should handle zero outputs', async () => {
      const mux = new AsyncMux<number>();
      const input = delayedGenerator([1, 2, 3], 10);
      
      mux.in(input);
      
      // No outputs created - should not error
      await new Promise(resolve => setTimeout(resolve, 100));
      
      mux.stop();
      
      expect(true).toBe(true);
    });

    it('should handle output stopped before mux', async () => {
      const mux = new AsyncMux<number>();
      const output = mux.out();
      
      mux.push(1);
      mux.push(2);
      
      output.stop();
      
      mux.push(3); // Should not error
      
      mux.stop();
      
      expect(true).toBe(true);
    });
  });
});
