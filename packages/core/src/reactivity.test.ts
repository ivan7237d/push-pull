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
  createEffect(
    logFunction("c", () => {
      pull(b);
    })
  );
  expect(readLog()).toMatchInlineSnapshot(`
    > [c] [call 1]
    > [b] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [1] [return] undefined
    > [c] [1] [return] undefined
  `);
});
