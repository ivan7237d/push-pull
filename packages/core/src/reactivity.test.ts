import { noopLog, resetLog } from "@1log/core";
import { getLogFunction } from "@1log/function";
import { jestPlugin, readLog } from "@1log/jest";
import { createEffect, pull, push } from "./reactivity";

const log = noopLog.add(jestPlugin());
const logFunction = getLogFunction(log);

afterEach(() => {
  resetLog();
});

test("flag", () => {
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
