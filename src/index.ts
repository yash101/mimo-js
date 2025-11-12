/**
 * @file index.ts
 * @description M:N async generator multiplexer
 * @author yash101 - Devyash Lodha<rud@devya.sh>
 * 
 * @summary AsyncMux is a multiplexer for async generators
 * 
 * @license MIT
 * 
 * Copyright (c) 2024 Devyash Lodha
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
export class AsyncMux<T> {
  private stopped = false;
  private stoppedResolve!: () => void;
  private stoppedPromise: Promise<void>;
  private inputs: Set<AsyncGenerator<T>> = new Set();
  private queues: Set<{ push: (val: T) => void; pull: () => Promise<T> }> = new Set();

  /**
   * Constructor
   */
  constructor() {
    this.stoppedPromise = new Promise<void>(resolve => (this.stoppedResolve = resolve));
  }

  /**
   * Async generator input. Pass it an async generator to watch
   * 
   * @param input async generator to add
   * @returns 
   */
  in(input: AsyncGenerator<T>): () => void {
    if (this.stopped)
      throw new Error("Mux already stopped");

    this.inputs.add(input);
    (async () => {
      try {
        for await (const item of input) {
          if (this.stopped)
            break;

          for (const q of this.queues)
            q.push(item);
        }
      } catch (err) {
      } finally {
        this.inputs.delete(input);
      }
    })();

    return () => this.inputs.delete(input);
  }

  /**
   * Get an async generator output which captures all events
   * 
   * @returns AsyncGenerator which captures all the events
   */
  out(): {
    generator: AsyncGenerator<T>;
    stop: () => void
  } {
    const queue: T[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const push = (val: T) => {
      if (done)
        return;
      queue.push(val);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    const pull = async (): Promise<T> => {
      while (queue.length === 0) {
        if (this.stopped || done)
          throw new Error("Stopped");
        await new Promise<void>(r => (resolve = r));
      }
      return queue.shift()!;
    };

    const q = {
      push,
      pull
    };
    this.queues.add(q);

    const generator =
      (async function* (this: AsyncMux<T>) {
        try {
          while (!this.stopped && !done) {
            yield await q.pull();
          }
        } catch {
          // Generator closed or mux stopped
        } finally {
          this.queues.delete(q);
        }
      })
      .call(this);

    const stop = () => {
      done = true;
      this.queues.delete(q);
      if (resolve)
        resolve();
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
  push(item: T): void {
    if (this.stopped)
      return;

    for (const q of this.queues)
      q.push(item);
  }

  /**
   * Stop the mux and all inputs/outputs
   */
  stop(): void {
    if (this.stopped)
      return;
    this.stopped = true;
    this.stoppedResolve();
    
    for (const q of this.queues)
      q.push(null as any); // Unblock all
    this.queues.clear();
  }
}
