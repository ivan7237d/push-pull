import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createEffect, pull } from "../reactivity";
import { createScope, disposeScope, onDispose, runInScope } from "../scope";
import { log } from "../setupTests";
import { createSignal } from "../signal";
import { createLazyPromise, isLazyPromise, never } from "./lazyPromise";

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

test("async resolve", () => {
  const promise = createLazyPromise<string>((resolve) => {
    setTimeout(() => {
      resolve("value");
    }, 1000);
  });
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")));
  });
  log("start");
  jest.runAllTimers();
  expect(readLog()).toMatchInlineSnapshot(`
    > "start"
    > [resolve] +1s "value"
  `);
});

test("sync resolve", () => {
  const promise = createLazyPromise<string>((resolve) => {
    resolve("value");
  });
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] "value"`);
});

test("async reject", () => {
  const promise = createLazyPromise<unknown, string>((_, reject) => {
    setTimeout(() => {
      reject("oops");
    }, 1000);
  });
  runInScope(createScope(), () => {
    promise(undefined, log.add(label("reject")));
  });
  log("start");
  jest.runAllTimers();
  expect(readLog()).toMatchInlineSnapshot(`
    > "start"
    > [reject] +1s "oops"
  `);
});

test("sync reject", () => {
  const promise = createLazyPromise<unknown, string>((_, reject) => {
    reject("oops");
  });
  runInScope(createScope(), () => {
    promise(undefined, log.add(label("reject")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> [reject] "oops"`);
});

test("cancelation", () => {
  const promise = createLazyPromise<string>(() => {
    onDispose(log.add(label("onDispose")));
  });
  const a = createScope();
  runInScope(a, () => {
    promise();
  });
  const b = createScope();
  runInScope(b, () => {
    promise();
  });
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`> [onDispose]`);
});

test("error in produce function", () => {
  const promise = createLazyPromise(() => {
    throw "oops";
  });
  runInScope(
    createScope((error) => log.add(label("error handler"))(error)),
    () => {
      promise();
    }
  );
  expect(readLog()).toMatchInlineSnapshot(`> [error handler] "oops"`);
});

test("error in a consumer function", () => {
  const promise = createLazyPromise<string>((resolve) => {
    log("produce");
    resolve("value");
  });
  runInScope(
    createScope((error) => log.add(label("error handler"))(error)),
    () => {
      promise(() => {
        throw "oops";
      });
    }
  );
  expect(readLog()).toMatchInlineSnapshot(`
    > "produce"
    > [error handler] "oops"
  `);

  // The promise itself is not affected.
  runInScope(createScope(), () => {
    promise((value) => {
      log(value);
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> "value"`);
});

test("unhandled rejection", () => {
  const promise = createLazyPromise<unknown, string>((_, reject) => {
    reject("oops");
  });
  runInScope(
    createScope((error) => log.add(label("error handler"))(error)),
    () => {
      promise();
    }
  );
  expect(readLog()).toMatchInlineSnapshot(`> [error handler] "oops"`);
});

test("already resolved or rejected", () => {
  const promise1 = createLazyPromise((resolve) => {
    resolve(1);
    resolve(2);
  });
  runInScope(
    createScope((error) => log.add(label("error handler"))(error)),
    () => {
      promise1();
    }
  );
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler] [Error: You cannot resolve a lazy promise that has already resolved or rejected.]`
  );

  const promise2 = createLazyPromise<unknown, unknown>((_, reject) => {
    reject(1);
    reject(2);
  });
  runInScope(
    createScope((error) => log.add(label("error handler"))(error)),
    () => {
      promise2();
    }
  );
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler] [Error: You cannot reject a lazy promise that has already resolved or rejected.]`
  );
});

test("never", () => {
  expect(isLazyPromise(never)).toMatchInlineSnapshot(`true`);
  runInScope(createScope(), () => {
    never(log.add(label("resolve")), log.add(label("reject")));
  });
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("isLazyPromise", () => {
  expect(isLazyPromise(undefined)).toMatchInlineSnapshot(`false`);
  expect(isLazyPromise(null)).toMatchInlineSnapshot(`false`);
  expect(isLazyPromise(() => {})).toMatchInlineSnapshot(`false`);
  expect(isLazyPromise(createLazyPromise(() => {}))).toMatchInlineSnapshot(
    `true`
  );
});

test("signal of a synchronously resolved promise", () => {
  const [a, setA] = createSignal(
    createLazyPromise<number>((resolve) => {
      resolve(0);
    })
  );

  runInScope(createScope(), () => {
    createEffect(() => {
      a()(log.add(label("resolve")));
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] 0`);
  setA(
    createLazyPromise<number>((resolve) => {
      resolve(1);
    })
  );
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] 1`);
});

test("signal of a synchronously resolved promise + memo", () => {
  const [a, setA] = createSignal(
    createLazyPromise<number>((resolve) => {
      resolve(0);
    })
  );

  const createMemo =
    <Value>(get: () => Value): (() => Value) =>
    () =>
      pull(get);

  const b = createMemo(() => {
    const promise = a();
    return createLazyPromise<number>((resolve) => {
      promise((value) => {
        resolve(value);
      });
    });
  });

  runInScope(createScope(), () => {
    createEffect(() => {
      b()(log.add(label("resolve")));
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] 0`);
  setA(
    createLazyPromise<number>((resolve) => {
      resolve(1);
    })
  );
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] 1`);
});
