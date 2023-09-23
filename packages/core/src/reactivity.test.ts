import { noopLog, resetLog } from "@1log/core";
import { getLogFunction } from "@1log/function";
import { jestPlugin, readLog } from "@1log/jest";
import { createEffect, pull, push } from "./reactivity";

const log = noopLog.add(jestPlugin());
const logFunction = getLogFunction(log);

afterEach(() => {
  resetLog();
});

test("flag graph", () => {
  //     X
  //   / |
  //  A  |
  //   \ |
  //     B
  //     |
  //     C
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    pull(a);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(b);
  });
  createEffect(c);
  expect(readLog()).toMatchInlineSnapshot(`
    > [c] [call 1]
    > [b] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [1] [return] undefined
    > [c] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [b] [call 2]
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [b] [2] [return] undefined
    > [c] [call 2]
    > [c] [2] [return] undefined
  `);
});

test("diamond graph", () => {
  //     X
  //   /   \
  //  A     B
  //   \   /
  //     C
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(a);
    pull(b);
  });
  createEffect(c);
  expect(readLog()).toMatchInlineSnapshot(`
    > [c] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [call 1]
    > [b] [1] [return] undefined
    > [c] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [c] [call 2]
    > [b] [call 2]
    > [b] [2] [return] undefined
    > [c] [2] [return] undefined
  `);
});

test("diamond graph with a tail", () => {
  //     X
  //   /   \
  //  A     B
  //   \   /
  //     C
  //     |
  //     D
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(a);
    pull(b);
    push(c);
  });
  const d = logFunction("d", () => {
    pull(c);
  });
  createEffect(d);
  expect(readLog()).toMatchInlineSnapshot(`
    > [d] [call 1]
    > [c] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [call 1]
    > [b] [1] [return] undefined
    > [c] [1] [return] undefined
    > [d] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [c] [call 2]
    > [b] [call 2]
    > [b] [2] [return] undefined
    > [c] [2] [return] undefined
    > [d] [call 2]
    > [d] [2] [return] undefined
  `);
});
