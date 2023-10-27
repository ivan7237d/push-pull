import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createScope, disposeScope, runInScope } from "../scope";
import { log } from "../setupTests";
import { lazy } from "./lazy";

const flushMicrotasks = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve);
  });
};

// DOMException was only made a global in Node v17.0.0. We use this constant to
// support Node 16.
const DOMException =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  globalThis.DOMException ??
  (() => {
    try {
      atob("~");
    } catch (err) {
      return Object.getPrototypeOf(err).constructor;
    }
  })();

test("resolve", async () => {
  const promise = lazy(async () => "value");
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")), log.add(label("reject")));
  });
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  await flushMicrotasks();
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] "value"`);
});

test("reject", async () => {
  const promise = lazy(async () => {
    throw "oops";
  });
  runInScope(createScope(), () => {
    promise(undefined, log.add(label("reject")));
  });
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  await flushMicrotasks();
  expect(readLog()).toMatchInlineSnapshot(`> [reject] "oops"`);
});

test("cancelation", async () => {
  const promise = lazy(
    async (signal) =>
      new Promise((_, reject) => {
        log("produce");
        expect(signal.aborted).toBe(false);
        signal.addEventListener("abort", () => {
          expect(signal.aborted).toBe(true);
          log.add(label("abort"))(signal.reason.toString());
          expect(signal.reason instanceof DOMException).toBe(true);
          reject(signal.reason);
        });
      })
  );
  const scope = createScope();
  runInScope(scope, () => {
    promise(log.add(label("resolve")), log.add(label("reject")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> "produce"`);
  disposeScope(scope);
  expect(readLog()).toMatchInlineSnapshot(
    `> [abort] "AbortError: The lazy promise no longer has any subscribers."`
  );
  await flushMicrotasks();
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")), log.add(label("reject")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> "produce"`);
  await flushMicrotasks();
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});
