import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createScope, disposeScope, onDispose, runInScope } from "../scope";
import { log } from "../setupTests";
import { createLazyPromise } from "./lazyPromise";

test("types: erroring promise", () => {
  const promise = createLazyPromise<string, number>(() => {});
  runInScope(createScope(), () => {
    promise(
      (value) => {
        // $ExpectType string
        value;
      },
      (error) => {
        // $ExpectType number
        error;
      }
    );

    // Resolve callback can be omitted.
    promise(undefined, () => {});

    // @ts-expect-error No error handler provided, so we get "Expected 2
    // arguments, but got 1".
    promise(() => {});
  });
});

test("types: non-erroring promise", () => {
  // Error type defaults to `never`.
  // $ExpectType LazyPromise<string, never>
  const promise = createLazyPromise<string>(() => {});
  runInScope(createScope(), () => {
    // No error handler required if error type is `never`.
    promise(() => {});
    promise(() => {}, undefined);
    promise(undefined);
    promise();

    promise(
      () => {},
      // @ts-expect-error Error handler will never be run, so we get "Argument
      // of type '() => void' is not assignable to parameter of type
      // 'undefined'".
      () => {}
    );
  });
});

test("async resolve", () => {
  let resolve: (value: string) => void;
  const promise = createLazyPromise<string>((newResolve) => {
    resolve = newResolve;
  });
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")));
  });
  resolve!("value");
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] "value"`);
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
  let reject: (value: string) => void;
  const promise = createLazyPromise<unknown, string>((_, newReject) => {
    reject = newReject;
  });
  runInScope(createScope(), () => {
    promise(undefined, log.add(label("reject")));
  });
  reject!("oops");
  expect(readLog()).toMatchInlineSnapshot(`> [reject] "oops"`);
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
