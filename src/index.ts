/**
 * @file index.ts
 * @description M:N async generator multiplexer
 * @author yash101 - Devyash Lodha<rud@devya.sh>
 * 
 * @summary AsyncMux is a multiplexer for async generators
 * 
 * @license MIT
 * 
 * Copyright (c) 2025 Devyash Lodha
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * 
 */

const StopSymbol: Symbol = Symbol('STOP');

interface AsyncQueue<T> {
  push: (item: T | typeof StopSymbol) => void;
  pull: () => Promise<T | typeof StopSymbol>;
}

export interface AsyncMuxOut<T> {
  generator: AsyncGenerator<T>;
  stop: () => void;
}

export default class AsyncMux<T> {
  inputCount: number = 0;
  stopFlag: boolean = false;
  queues: Set<AsyncQueue<T>> = new Set();

  /**
   * Async generator input. Pass it an async generator to watch
   * 
   * @param input async generator to add
   */
  in(input: AsyncGenerator<T>): void {
    this.inputCount++;

    // Data ingest: literally just iterate the input AsyncGenerator and push items!
    (async () => {
      for await (const item of input) {
        if (this.stopFlag) // stoppability
          break;
        this.push(item);
      }

      this.inputCount--;
      if (this.inputCount === 0) {
        this.stop();
      }
    })();
  }

  /**
   * Get an async generator output which captures all events
   * 
   * @returns AsyncGenerator which captures all the events
   */
  out(): AsyncMuxOut<T> {
    const queue: (T | Symbol)[] = [];
    let controlPromise: Promise<void> | null = null;
    let resolve: any = null;

    const pushItem = (item: T | typeof StopSymbol) => {
      queue.push(item);
      if (resolve) {
        resolve();
        resolve = null;
        controlPromise = null;
      }
    };

    const pullItem = async (): Promise<T | typeof StopSymbol> => {
      if (queue.length > 0) {
        return queue.shift() as T;
      }

      if (!controlPromise) {
        controlPromise = new Promise((res) => {
          resolve = res;
        });
      }

      await controlPromise;
      return queue.shift() as T;
    };

    const asyncQueue: AsyncQueue<T> = {
      push: pushItem,
      pull: pullItem
    };

    this.queues.add(asyncQueue);

    const generator: AsyncGenerator<T> =
      (async function* outputGen(this: AsyncMux<T>) {
        while (this.inputCount > 0 || queue.length > 0) {
          const item = await asyncQueue.pull();
          if (item === StopSymbol) {
            break;
          }

          yield item as T;
        }

        this.queues.delete(asyncQueue);
      })
      .call(this);

    const stop = () => {
      pushItem(StopSymbol);
    };

    return {
      generator,
      stop
    };
  }

  /**
   * Push an item to all outputs
   * 
   * @param item 
   */
  private pushInternal(item: T | typeof StopSymbol): void {
    for (const q of this.queues) {
      q.push(item);
    }
  }

  push(item: T): void {
    this.pushInternal(item);
  }

  /**
   * Stop the mux and all inputs/outputs
   */
  stop(): void {
    this.stopFlag = true;
    this.pushInternal(StopSymbol);
  }

  readerCount(): number {
    return this.inputCount;
  }

  writerCount(): number {
    return this.queues.size;
  }
}
