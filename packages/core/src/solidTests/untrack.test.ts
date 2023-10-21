/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
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

import { batch, createEffect, pull, untrack } from "../reactivity";
import { createScope, disposeScope, onDispose, runInScope } from "../scope";
import { createSignal } from "../signal";

const createMemo =
  <Value>(get: () => Value): (() => Value) =>
  () =>
    pull(get);

const wrapInBatch = (callback: () => void) => () => {
  batch(callback);
};

it("should not create dependency", () => {
  const effect = jest.fn();
  const memo = jest.fn();

  const [$x, setX] = createSignal(10);

  const $a = createMemo(() => $x() + 10);
  const $b = createMemo(() => {
    memo();
    return untrack($a) + 10;
  });

  runInScope(createScope(), () => {
    createEffect(() => {
      effect();
      expect(untrack($x)).toBe(10);
      expect(untrack($a)).toBe(20);
      expect(untrack($b)).toBe(30);
    });
  });

  expect(effect).toHaveBeenCalledTimes(1);
  expect(memo).toHaveBeenCalledTimes(1);

  setX(20);
  expect(effect).toHaveBeenCalledTimes(1);
  expect(memo).toHaveBeenCalledTimes(1);
});

it(
  "should not affect deep dependency being created",
  wrapInBatch(() => {
    const effect = jest.fn();
    const memo = jest.fn();

    const [$x, setX] = createSignal(10);
    const [$y, setY] = createSignal(10);
    const [$z, setZ] = createSignal(10);

    const $a = createMemo(() => {
      memo();
      return $x() + untrack($y) + untrack($z) + 10;
    });

    runInScope(createScope(), () => {
      createEffect(() => {
        effect();
        expect(untrack($x)).toBe(10);
        expect(untrack($a)).toBe(40);
      });
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect($a()).toBe(40);
    expect(memo).toHaveBeenCalledTimes(1);

    setX(20);
    expect(effect).toHaveBeenCalledTimes(1);
    expect($a()).toBe(50);
    expect(memo).toHaveBeenCalledTimes(2);

    setY(20);
    expect(effect).toHaveBeenCalledTimes(1);
    expect($a()).toBe(50);
    expect(memo).toHaveBeenCalledTimes(2);

    setZ(20);
    expect(effect).toHaveBeenCalledTimes(1);
    expect($a()).toBe(50);
    expect(memo).toHaveBeenCalledTimes(2);
  })
);

it("should track owner across peeks", () => {
  const [$x, setX] = createSignal(0);

  const childCompute = jest.fn();
  const childDispose = jest.fn();

  function createChild() {
    const $a = createMemo(() => $x() * 2);
    createEffect(() => {
      childCompute($a());
      onDispose(childDispose);
    });
  }

  const scope = createScope();
  runInScope(scope, () => {
    untrack(() => createChild());
  });

  setX(1);
  expect(childCompute).toHaveBeenCalledWith(2);
  expect(childDispose).toHaveBeenCalledTimes(1);

  disposeScope(scope);
  expect(childDispose).toHaveBeenCalledTimes(2);

  setX(2);
  expect(childCompute).not.toHaveBeenCalledWith(4);
  expect(childDispose).toHaveBeenCalledTimes(2);
});

/* eslint-enable @typescript-eslint/no-confusing-void-expression */
/* eslint-enable prefer-arrow/prefer-arrow-functions */
