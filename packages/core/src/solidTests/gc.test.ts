/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * MIT License
 *
 * Copyright (c) 2016-2023 Ryan Carniato
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*
 * This file is originally from
 * https://github.com/solidjs/signals/tree/dcf7521abad59cacce53a881efd5191627cc46c6/tests
 */

import { createEffect, pull } from "../reactivity";
import { Scope, createScope, disposeScope, runInScope } from "../scope";
import { createSignal } from "../signal";

const createMemo =
  <Value>(get: () => Value): (() => Value) =>
  () =>
    pull(get);

function gc() {
  return new Promise((resolve) =>
    setTimeout(async () => {
      global.gc!();
      resolve(void 0);
    }, 0)
  );
}

if (global.gc) {
  it("should gc computed if there are no observers", async () => {
    const [$x] = createSignal(0),
      ref = new WeakRef(createMemo(() => $x()));

    await gc();
    expect(ref.deref()).toBeUndefined();
  });

  it("should _not_ gc computed if there are observers", async () => {
    let [$x] = createSignal(0),
      pointer;

    const ref = new WeakRef((pointer = createMemo(() => $x())));

    ref.deref()!();

    await gc();
    expect(ref.deref()).toBeDefined();

    pointer = undefined;
    await gc();
    expect(ref.deref()).toBeUndefined();
  });

  it("should gc root if disposed", async () => {
    let [$x] = createSignal(0),
      ref!: WeakRef<any>,
      pointer;

    const scope = createScope();
    runInScope(() => {
      ref = new WeakRef(
        (pointer = createMemo(() => {
          $x();
        }))
      );
    }, scope);

    await gc();
    expect(ref.deref()).toBeDefined();

    disposeScope(scope);
    await gc();
    expect(ref.deref()).toBeDefined();

    pointer = undefined;
    await gc();
    expect(ref.deref()).toBeUndefined();
  });

  it("should gc effect lazily", async () => {
    let [$x, setX] = createSignal(0),
      ref!: WeakRef<any>;

    let scope: Scope | undefined = createScope();
    runInScope(() => {
      createEffect(() => {
        $x();
        ref = new WeakRef(createScope());
      });
    }, scope);

    await gc();
    expect(ref.deref()).toBeDefined();

    disposeScope(scope);
    scope = undefined;
    setX(1);

    await gc();
    expect(ref.deref()).toBeUndefined();
  });
} else {
  it("", () => {});
}

/* eslint-enable prefer-arrow/prefer-arrow-functions */
/* eslint-enable prefer-const */
/* eslint-enable @typescript-eslint/no-unused-vars */
