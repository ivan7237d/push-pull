/* eslint-disable @typescript-eslint/no-confusing-void-expression */
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

import { createEffect } from "../reactivity";
import { createScope, disposeScope, onDispose, runInScope } from "../scope";

it("should be invoked when computation is disposed", () => {
  const disposeA = jest.fn();
  const disposeB = jest.fn();
  const disposeC = jest.fn();

  const scope = createScope();
  runInScope(scope, () => {
    createEffect(() => {
      onDispose(disposeA);
      onDispose(disposeB);
      onDispose(disposeC);
    });
  });

  disposeScope(scope);

  expect(disposeA).toHaveBeenCalled();
  expect(disposeB).toHaveBeenCalled();
  expect(disposeC).toHaveBeenCalled();
});

it("should not trigger wrong onCleanup", () => {
  const dispose = jest.fn();

  runInScope(createScope(), () => {
    createEffect(() => {
      onDispose(dispose);
    });

    const scope = createScope();

    runInScope(scope, () => {
      createEffect(() => {});
    });

    disposeScope(scope);

    expect(dispose).toHaveBeenCalledTimes(0);
  });
});

it("should clean up in reverse order", () => {
  const disposeParent = jest.fn();
  const disposeA = jest.fn();
  const disposeB = jest.fn();

  let calls = 0;

  const scope = createScope();
  runInScope(scope, () => {
    createEffect(() => {
      onDispose(() => disposeParent(++calls));

      createEffect(() => {
        onDispose(() => disposeA(++calls));
      });

      createEffect(() => {
        onDispose(() => disposeB(++calls));
      });
    });
  });

  disposeScope(scope);

  expect(disposeB).toHaveBeenCalled();
  expect(disposeA).toHaveBeenCalled();
  expect(disposeParent).toHaveBeenCalled();

  expect(disposeB).toHaveBeenCalledWith(1);
  expect(disposeA).toHaveBeenCalledWith(2);
  expect(disposeParent).toHaveBeenCalledWith(3);
});

it("should dispose all roots", () => {
  const disposals: string[] = [];

  const scope = createScope();
  runInScope(scope, () => {
    runInScope(createScope(), () => {
      onDispose(() => disposals.push("SUBTREE 1"));
      createEffect(() => onDispose(() => disposals.push("+A1")));
      createEffect(() => onDispose(() => disposals.push("+B1")));
      createEffect(() => onDispose(() => disposals.push("+C1")));
    });

    runInScope(createScope(), () => {
      onDispose(() => disposals.push("SUBTREE 2"));
      createEffect(() => onDispose(() => disposals.push("+A2")));
      createEffect(() => onDispose(() => disposals.push("+B2")));
      createEffect(() => onDispose(() => disposals.push("+C2")));
    });

    onDispose(() => disposals.push("ROOT"));
  });

  disposeScope(scope);

  expect(disposals).toMatchInlineSnapshot(`
    [
      "+C2",
      "+B2",
      "+A2",
      "SUBTREE 2",
      "+C1",
      "+B1",
      "+A1",
      "SUBTREE 1",
      "ROOT",
    ]
  `);
});

/* eslint-enable @typescript-eslint/no-confusing-void-expression */
