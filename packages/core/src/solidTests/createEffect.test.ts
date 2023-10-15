/* eslint-disable arrow-body-style */
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
 * https://github.com/solidjs/signals/blob/dcf7521abad59cacce53a881efd5191627cc46c6/tests/createEffect.test.ts
 */

import { createEffect, pull } from "../reactivity";
import { createScope, disposeScope, onDispose, runInScope } from "../scope";
import { createSignal } from "../signal";

const createMemo =
  <Value>(get: () => Value): (() => Value) =>
  () =>
    pull(get);

it("should run effect", () => {
  const [$x, setX] = createSignal(0),
    effect = jest.fn(() => void $x());

  runInScope(() => {
    createEffect(effect);
  }, createScope());
  expect(effect).toHaveBeenCalledTimes(1);

  setX(1);
  expect(effect).toHaveBeenCalledTimes(2);
});

it("should run effect on change", () => {
  const effect = jest.fn();

  const [$x, setX] = createSignal(10);
  const [$y, setY] = createSignal(10);

  const $a = createMemo(() => $x() + $y());
  const $b = createMemo(() => $a());

  runInScope(() => {
    createEffect(() => effect($b()));
  }, createScope());

  expect(effect).toHaveBeenCalledTimes(1);

  setX(20);
  expect(effect).toHaveBeenCalledTimes(2);

  setY(20);
  expect(effect).toHaveBeenCalledTimes(3);

  setX(20);
  setY(20);
  expect(effect).toHaveBeenCalledTimes(3);
});

it("should handle nested effect", () => {
  const [$x, setX] = createSignal(0);
  const [$y, setY] = createSignal(0);

  const outerEffect = jest.fn();
  const innerEffect = jest.fn();
  const innerDispose = jest.fn();

  const scope = createScope();
  runInScope(() => {
    createEffect(() => {
      $x();
      outerEffect();
      createEffect(() => {
        $y();
        innerEffect();
        onDispose(innerDispose);
      });
    });
  }, scope);

  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(1);
  expect(innerDispose).toHaveBeenCalledTimes(0);

  setY(1);
  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(2);
  expect(innerDispose).toHaveBeenCalledTimes(1);

  setY(2);
  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(3);
  expect(innerDispose).toHaveBeenCalledTimes(2);

  innerEffect.mockReset();
  innerDispose.mockReset();

  setX(1);
  expect(outerEffect).toHaveBeenCalledTimes(2);
  expect(innerEffect).toHaveBeenCalledTimes(1); // new one is created
  expect(innerDispose).toHaveBeenCalledTimes(1);

  setY(3);
  expect(outerEffect).toHaveBeenCalledTimes(2);
  expect(innerEffect).toHaveBeenCalledTimes(2);
  expect(innerDispose).toHaveBeenCalledTimes(2);

  disposeScope(scope);
  setX(10);
  setY(10);
  expect(outerEffect).toHaveBeenCalledTimes(2);
  expect(innerEffect).toHaveBeenCalledTimes(2);
  expect(innerDispose).toHaveBeenCalledTimes(3);
});

it("should stop effect", () => {
  const effect = jest.fn();

  const [$x, setX] = createSignal(10);

  const scope = createScope();
  runInScope(() => {
    createEffect(() => effect($x()));
  }, scope);

  disposeScope(scope);

  setX(20);
  expect(effect).toHaveBeenCalledTimes(1);
});

it("should run all disposals before each new run", () => {
  const effect = jest.fn();
  const disposeA = jest.fn();
  const disposeB = jest.fn();

  function fnA() {
    onDispose(disposeA);
  }

  function fnB() {
    onDispose(disposeB);
  }

  const [$x, setX] = createSignal(0);

  runInScope(() => {
    createEffect(() => {
      effect();
      fnA(), fnB(), $x();
    });
  }, createScope());

  expect(effect).toHaveBeenCalledTimes(1);
  expect(disposeA).toHaveBeenCalledTimes(0);
  expect(disposeB).toHaveBeenCalledTimes(0);

  for (let i = 1; i <= 3; i += 1) {
    setX(i);
    expect(effect).toHaveBeenCalledTimes(i + 1);
    expect(disposeA).toHaveBeenCalledTimes(i);
    expect(disposeB).toHaveBeenCalledTimes(i);
  }
});

it("should dispose of nested effect", () => {
  const [$x, setX] = createSignal(0);
  const innerEffect = jest.fn();

  const scope = createScope();
  runInScope(() => {
    createEffect(() => {
      createEffect(() => {
        innerEffect($x());
      });
    });
  }, scope);

  disposeScope(scope);

  setX(10);
  expect(innerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).not.toHaveBeenCalledWith(10);
});

it("should conditionally observe", () => {
  const [$x, setX] = createSignal(0);
  const [$y, setY] = createSignal(0);
  const [$condition, setCondition] = createSignal(true);

  const $a = createMemo(() => ($condition() ? $x() : $y()));
  const effect = jest.fn();

  runInScope(() => {
    createEffect(() => effect($a()));
  }, createScope());

  expect(effect).toHaveBeenCalledTimes(1);

  setY(1);
  expect(effect).toHaveBeenCalledTimes(1);

  setX(1);
  expect(effect).toHaveBeenCalledTimes(2);

  setCondition(false);
  expect(effect).toHaveBeenCalledTimes(2);

  setY(2);
  expect(effect).toHaveBeenCalledTimes(3);

  setX(3);
  expect(effect).toHaveBeenCalledTimes(3);
});

it("should dispose of nested conditional effect", () => {
  const [$condition, setCondition] = createSignal(true);

  const disposeA = jest.fn();
  const disposeB = jest.fn();

  function fnA() {
    createEffect(() => {
      onDispose(disposeA);
    });
  }

  function fnB() {
    createEffect(() => {
      onDispose(disposeB);
    });
  }

  runInScope(() => {
    createEffect(() => ($condition() ? fnA() : fnB()));
  }, createScope());

  setCondition(false);
  expect(disposeA).toHaveBeenCalledTimes(1);
});

// https://github.com/preactjs/signals/issues/152
it("should handle looped effects", () => {
  let values: number[] = [],
    loop = 2;

  const [$value, setValue] = createSignal(0);

  runInScope(() => {
    createEffect(() => {
      values.push($value());
      for (let i = 0; i < loop; i++) {
        createEffect(() => {
          values.push($value() + i);
        });
      }
    });
  }, createScope());

  expect(values).toHaveLength(3);
  expect(values.join(",")).toBe("0,0,1");

  loop = 1;
  values = [];
  setValue(1);

  expect(values).toHaveLength(2);
  expect(values.join(",")).toBe("1,1");

  values = [];
  setValue(2);

  expect(values).toHaveLength(2);
  expect(values.join(",")).toBe("2,2");
});

// This is essentially run top - we need to solve it.
it.skip("should run parent effect before child effect", () => {
  const [$x, setX] = createSignal(0);
  const $condition = createMemo(() => $x());

  let calls = 0;

  runInScope(() => {
    createEffect(() => {
      createEffect(() => {
        $x();
        calls++;
      });

      $condition();
    });
  }, createScope());

  setX(1);
  expect(calls).toBe(2);
});
