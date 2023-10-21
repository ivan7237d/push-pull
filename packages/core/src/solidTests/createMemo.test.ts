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

import { batch, pull } from "../reactivity";
import { createSignal } from "../signal";

const createMemo =
  <Value>(get: () => Value): (() => Value) =>
  () =>
    pull(get);

const wrapInBatch = (callback: () => void) => () => {
  batch(callback);
};

it("should store and return value on read", () => {
  const [$x] = createSignal(1);
  const [$y] = createSignal(1);

  const $a = createMemo(() => $x() + $y());

  expect($a()).toBe(2);
});

it("should update when dependency is updated", () => {
  const [$x, setX] = createSignal(1);
  const [$y, setY] = createSignal(1);

  const $a = createMemo(() => $x() + $y());

  setX(2);
  expect($a()).toBe(3);

  setY(2);
  expect($a()).toBe(4);
});

it("should update when deep dependency is updated", () => {
  const [$x, setX] = createSignal(1);
  const [$y] = createSignal(1);

  const $a = createMemo(() => $x() + $y());
  const $b = createMemo(() => $a());

  setX(2);
  expect($b()).toBe(3);
});

it("should update when deep computed dependency is updated", () => {
  const [$x, setX] = createSignal(10);
  const [$y] = createSignal(10);

  const $a = createMemo(() => $x() + $y());
  const $b = createMemo(() => $a());
  const $c = createMemo(() => $b());

  setX(20);
  expect($c()).toBe(30);
});

it(
  "should only re-compute when needed",
  wrapInBatch(() => {
    const computed = jest.fn();

    const [$x, setX] = createSignal(10);
    const [$y, setY] = createSignal(10);

    const $a = createMemo(() => computed($x() + $y()));

    expect(computed).not.toHaveBeenCalled();

    $a();
    expect(computed).toHaveBeenCalledTimes(1);
    expect(computed).toHaveBeenCalledWith(20);

    $a();
    expect(computed).toHaveBeenCalledTimes(1);

    setX(20);
    $a();
    expect(computed).toHaveBeenCalledTimes(2);

    setY(20);
    $a();
    expect(computed).toHaveBeenCalledTimes(3);

    $a();
    expect(computed).toHaveBeenCalledTimes(3);
  })
);

it(
  "should only re-compute whats needed",
  wrapInBatch(() => {
    const memoA = jest.fn((n) => n);
    const memoB = jest.fn((n) => n);

    const [$x, setX] = createSignal(10);
    const [$y, setY] = createSignal(10);

    const $a = createMemo(() => memoA($x()));
    const $b = createMemo(() => memoB($y()));
    const $c = createMemo(() => $a() + $b());

    expect(memoA).not.toHaveBeenCalled();
    expect(memoB).not.toHaveBeenCalled();

    $c();
    expect(memoA).toHaveBeenCalledTimes(1);
    expect(memoB).toHaveBeenCalledTimes(1);
    expect($c()).toBe(20);

    setX(20);

    $c();
    expect(memoA).toHaveBeenCalledTimes(2);
    expect(memoB).toHaveBeenCalledTimes(1);
    expect($c()).toBe(30);

    setY(20);

    $c();
    expect(memoA).toHaveBeenCalledTimes(2);
    expect(memoB).toHaveBeenCalledTimes(2);
    expect($c()).toBe(40);
  })
);

it("should discover new dependencies", () => {
  const [$x, setX] = createSignal(1);
  const [$y, setY] = createSignal(0);

  const $c = createMemo(() => {
    if ($x()) {
      return $x();
    } else {
      return $y();
    }
  });

  expect($c()).toBe(1);

  setX(0);
  expect($c()).toBe(0);

  setY(10);
  expect($c()).toBe(10);
});
