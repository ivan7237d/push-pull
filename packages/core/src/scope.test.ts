import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import {
  createRootScope,
  createScope,
  disposeScope,
  getContext,
  isScopeDisposed,
  isScopeRunning,
  onDispose,
  runInScope,
} from "./scope";
import { log, nameSymbol } from "./setupTests";

const contextKey1 = Symbol("contextKey1");
const contextKey2 = Symbol("contextKey2");

const mockMicrotaskQueue: (() => void)[] = [];
const originalQueueMicrotask = queueMicrotask;

const processMockMicrotaskQueue = () => {
  while (mockMicrotaskQueue.length) {
    mockMicrotaskQueue.shift()!();
  }
};

beforeEach(() => {
  global.queueMicrotask = (task) => mockMicrotaskQueue.push(task);
});

afterEach(() => {
  processMockMicrotaskQueue();
  global.queueMicrotask = originalQueueMicrotask;
});

// This is used for type tests in `test("getContext", ...)`.
declare module "./scope" {
  interface Scope {
    [contextKey1]?: number;
    [contextKey2]?: number | undefined;
  }
}

test("createRootScope", () => {
  // $ExpectType Scope
  const a = createRootScope();
  expect(a).toMatchInlineSnapshot(`{}`);
  const onError = () => {};
  onError[nameSymbol] = "onError";
  const b = createRootScope(onError);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(onError): [Function onError],
    }
  `);
});

test("createScope: creating linked list", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
    }
  `);

  const onError = () => {};
  onError[nameSymbol] = "onError";
  const b = runInScope(a, () => createScope(onError))!;
  (b as any)[nameSymbol] = "b";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(next): [Object b],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(onError): [Function onError],
      Symbol(name): "b",
    }
  `);

  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(next): [Object c],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object c],
      Symbol(onError): [Function onError],
      Symbol(name): "b",
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(next): [Object b],
      Symbol(name): "c",
    }
  `);
});

test("createScope: error if scope is disposed", () => {
  const a = createScope();
  runInScope(a, () => {
    onDispose(() => {
      createScope();
    });
  });
  processMockMicrotaskQueue();
  disposeScope(a);
  expect(processMockMicrotaskQueue).toThrow(
    "You cannot create a child scope in a disposed scope."
  );
});

test("getContext", () => {
  const a = createScope();
  const b = runInScope(a, createScope)!;
  const c = runInScope(b, createScope)!;
  const d = runInScope(c, createScope)!;
  b[contextKey1] = 1;
  c[contextKey1] = 2;

  // Test returned type and default value.
  expect(
    // $ExpectType number | undefined
    getContext(contextKey1)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKey2)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKey1, undefined)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKey2, undefined)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | "a"
    getContext(contextKey1, "a")
  ).toMatchInlineSnapshot(`"a"`);
  expect(
    // $ExpectType number | "a" | undefined
    getContext(contextKey2, "a")
  ).toMatchInlineSnapshot(`"a"`);

  // Test picking up the right scope.
  expect(runInScope(a, () => getContext(contextKey1))).toMatchInlineSnapshot(
    `undefined`
  );
  expect(runInScope(b, () => getContext(contextKey1))).toMatchInlineSnapshot(
    `1`
  );
  expect(runInScope(c, () => getContext(contextKey1))).toMatchInlineSnapshot(
    `2`
  );
  expect(runInScope(d, () => getContext(contextKey1))).toMatchInlineSnapshot(
    `2`
  );
});

test("runInScope: error if scope is disposed", () => {
  const a = createScope();
  disposeScope(a);
  expect(() =>
    runInScope(a, () => undefined)
  ).toThrowErrorMatchingInlineSnapshot(
    `"You cannot run a callback in a disposed scope."`
  );
});

test("runInScope: error if using the same scope or ancestor in a nested call", () => {
  const a = createScope();
  runInScope(a, () => {
    try {
      runInScope(a, () => {});
    } catch (e) {
      log(e);
    }
  });
  expect(readLog()).toMatchInlineSnapshot(
    `> [Error: In a nested \`runInScope\` call, you cannot use the same scope or an ancestor scope.]`
  );
  const b = runInScope(a, createScope)!;
  runInScope(b, () => {
    try {
      runInScope(a, () => {});
    } catch (e) {
      log(e);
    }
  });
  expect(readLog()).toMatchInlineSnapshot(
    `> [Error: In a nested \`runInScope\` call, you cannot use the same scope or an ancestor scope.]`
  );
});

test("runInScope: case of no errors", () => {
  const a = createScope();
  a[contextKey1] = 1;

  // Test returned type.

  // $ExpectType number | void
  runInScope(a, () => 1);
  // $ExpectType void
  runInScope(a, () => {});
  // $ExpectType void | undefined
  runInScope(a, () => undefined);

  const b = runInScope(a, createScope)!;
  b[contextKey1] = 2;
  const c = runInScope(b, createScope)!;

  // Make sure the callback is run in the right context, scopes are correctly
  // marked as running, and state is restored afterwards.
  runInScope(a, () => {
    runInScope(c, () => {
      expect(isScopeRunning(a)).toMatchInlineSnapshot(`true`);
      expect(isScopeRunning(b)).toMatchInlineSnapshot(`true`);
      expect(isScopeRunning(c)).toMatchInlineSnapshot(`true`);
      expect(getContext(contextKey1)).toMatchInlineSnapshot(`2`);
      // Make sure we've actually run the callbacks.
      log("done");
    });
    expect(isScopeRunning(a)).toMatchInlineSnapshot(`true`);
    expect(isScopeRunning(b)).toMatchInlineSnapshot(`false`);
    expect(isScopeRunning(c)).toMatchInlineSnapshot(`false`);
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`1`);
  });
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
  expect(isScopeRunning(a)).toMatchInlineSnapshot(`false`);
  expect(isScopeRunning(b)).toMatchInlineSnapshot(`false`);
  expect(isScopeRunning(c)).toMatchInlineSnapshot(`false`);
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);
});

test("runInScope: error handler caches the error, scope is disposed by then", () => {
  const a = createScope((error) => {
    expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
    log(error);
  });
  runInScope(a, () => {
    throw "oops";
  });
  expect(readLog()).toMatchInlineSnapshot(`> "oops"`);
});

test("runInScope: scope in which an error handler is run", () => {
  const a = createScope();
  a[contextKey1] = 1;
  const b = runInScope(a, () =>
    createScope(() => {
      log(getContext(contextKey1));
    })
  )!;
  b[contextKey1] = 2;
  const c = createScope();
  c[contextKey1] = 3;
  runInScope(c, () => {
    runInScope(b, () => {
      throw "oops";
    });
  });
  // The logged value should be the one coming from scope `a`.
  expect(readLog()).toMatchInlineSnapshot(`> 1`);
});

test("runInScope: scope which is passed to an error handler", () => {
  const a = createScope();
  const b = runInScope(a, () =>
    createScope((_, scope) => {
      log(scope === b);
    })
  )!;
  runInScope(b, () => {
    throw "oops";
  });
  expect(readLog()).toMatchInlineSnapshot(`> true`);
});

test("runInScope: error handler throws", () => {
  const a = createScope((error) => {
    log.add(label("error handled in a"))(error);
  });
  const b = runInScope(a, () =>
    createScope((error) => {
      log.add(label("error handled in b"))(error);
      throw "error thrown in error handler";
    })
  )!;
  runInScope(b, () => {
    throw "error thrown in b";
  });
  expect(readLog()).toMatchInlineSnapshot(`
    > [error handled in b] "error thrown in b"
    > [error handled in a] "error thrown in error handler"
  `);
});

test("runInScope: error re-thrown in running ancestor", () => {
  const a = createScope();
  const b = runInScope(a, createScope)!;
  runInScope(a, () => {
    try {
      runInScope(b, () => {
        throw "oops";
      });
    } catch (error) {
      log.add(label("error caught in a"))(error);
    }
  });
  expect(readLog()).toMatchInlineSnapshot(`> [error caught in a] "oops"`);

  // Make sure that the error is cleaned up after re-throwing.
  const c = runInScope(a, createScope)!;
  runInScope(a, () => {
    runInScope(c, () => {
      log("done");
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
});

test("runInScope: error re-thrown across an intermediate unrelated scope", () => {
  const a = createScope();
  const b = runInScope(a, createScope)!;
  const c = createScope();
  runInScope(a, () => {
    try {
      runInScope(c, () => {
        runInScope(b, () => {
          throw "oops";
        });
        log("no error in c");
      });
    } catch (error) {
      log.add(label("error caught in a"))(error);
    }
  });
  expect(readLog()).toMatchInlineSnapshot(`
    > "no error in c"
    > [error caught in a] "oops"
  `);
});

test("runInScope: aggregate error", () => {
  const a = createScope((error) => {
    if (error instanceof AggregateError) {
      log(error.errors);
    }
  });
  const b = runInScope(a, createScope)!;
  const c = runInScope(a, createScope)!;
  runInScope(a, () => {
    runInScope(b, () => {
      runInScope(c, () => {
        throw "error in c";
      });
      throw "error in b";
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`
    >
      [
        "error in c",
        "error in b",
      ]
  `);
});

test("runInScope: flattening of aggregate errors", () => {
  const a = createScope((error) => {
    if (error instanceof AggregateError) {
      log(error.errors);
    }
  });
  const b = runInScope(a, createScope)!;
  const c = runInScope(a, createScope)!;
  runInScope(a, () => {
    runInScope(b, () => {
      runInScope(c, () => {
        throw new AggregateError([1, 2]);
      });
      throw new AggregateError([3, 4]);
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`
    >
      [
        1,
        2,
        3,
        4,
      ]
  `);
});

test("runInScope: throwing in a microtask", () => {
  const a = createScope();
  runInScope(a, () => {
    throw "oops";
  });
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  expect(processMockMicrotaskQueue).toThrow("oops");
});

test("onDispose: updating disposables", () => {
  const a = createScope();
  runInScope(a, () => {
    const disposable = () => {};
    disposable[nameSymbol] = "a";
    onDispose(disposable);
  });
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(disposables): [Function a],
    }
  `);
  runInScope(a, () => {
    const disposable = () => {};
    disposable[nameSymbol] = "b";
    onDispose(disposable);
  });
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(disposables): [
        [Function a],
        [Function b],
      ],
    }
  `);
});

test("onDispose: error if run outside a scope", () => {
  expect(() => {
    onDispose(() => {});
  }).toThrowErrorMatchingInlineSnapshot(
    `"\`onDispose\` must be called within a \`Scope\`."`
  );
});

test("onDispose: error if the scope is disposed", () => {
  const scope = createScope();
  runInScope(scope, () => {
    onDispose(() => {
      expect(() => {
        onDispose(() => {});
      }).toThrowErrorMatchingInlineSnapshot(
        `"You cannot call \`onDispose\` in a disposed scope."`
      );
      log("done");
    });
  });
  disposeScope(scope);
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
});

test("isScopeRunning", () => {
  const a = createScope();
  expect(isScopeRunning(a)).toMatchInlineSnapshot(`false`);
  runInScope(a, () => {
    log(isScopeRunning(a));
  });
  expect(readLog()).toMatchInlineSnapshot(`> true`);
});

test("isScopeDisposed", () => {
  const a = createScope();
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`false`);
  disposeScope(a);
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
});

test("disposeScope: calling disposables", () => {
  const a = createScope();
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable in a]`);

  const b = createScope();
  runInScope(b, () => {
    onDispose(log.add(label("disposable 1 in b")));
    onDispose(log.add(label("disposable 2 in b")));
  });
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable 2 in b]
    > [disposable 1 in b]
  `);
});

test("disposeScope: scope in which disposables are called", () => {
  const a = createScope();
  a[contextKey1] = 1;
  const b = runInScope(a, createScope)!;
  b[contextKey1] = 2;
  runInScope(a, () => {
    onDispose(() =>
      log.add(label("context value in disposable in a"))(
        getContext(contextKey1)
      )
    );
  });
  runInScope(b, () => {
    onDispose(() =>
      log.add(label("context value in disposable in b"))(
        getContext(contextKey1)
      )
    );
  });
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > [context value in disposable in b] 2
    > [context value in disposable in a] 1
  `);
  // Check that scope is restored.
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);
});

test("disposeScope: handling errors in disposables", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  runInScope(a, () => {
    onDispose(() => {
      throw "error in disposable in a";
    });
  });
  disposeScope(a);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(processMockMicrotaskQueue).toThrow("error in disposable in a");

  const b = createScope();
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("first disposable in b")));
  });
  runInScope(b, () => {
    onDispose(() => {
      log.add(label("second disposable in b"))();
      throw "error in second disposable in b";
    });
  });
  runInScope(b, () => {
    onDispose(log.add(label("third disposable in b")));
  });
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [third disposable in b]
    > [second disposable in b]
    > [first disposable in b]
  `);
  expect(processMockMicrotaskQueue).toThrow("error in second disposable in b");
});

test("disposeScope: no re-dispose", () => {
  const a = createScope();
  disposeScope(a);
  expect(() => {
    disposeScope(a);
  }).toThrowErrorMatchingInlineSnapshot(`"The scope is already disposed."`);
});

test("disposeScope: no disposing from callback", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    expect(() => {
      disposeScope(a);
    }).toThrowErrorMatchingInlineSnapshot(
      `"You cannot dispose a scope while a callback is running in that scope."`
    );
    log("done");
  });
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`false`);
  expect(isScopeDisposed(b)).toMatchInlineSnapshot(`false`);
});

test("disposeScope: disposing single scope", () => {
  const a = createScope();
  disposeScope(a);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(disposed): true,
    }
  `);
});

test("disposeScope: disposing last scope", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("disposable in b")));
  });
  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  runInScope(c, () => {
    onDispose(log.add(label("disposable in c")));
  });

  disposeScope(c);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(next): [Object b],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(name): "b",
      Symbol(disposables): [Function],
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(next): [Object b],
      Symbol(name): "c",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable in c]`);
});

test("disposeScope: disposing middle scope", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("disposable in b")));
  });
  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  runInScope(c, () => {
    onDispose(log.add(label("disposable in c")));
  });

  disposeScope(b);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(next): [Object c],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object c],
      Symbol(name): "b",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(name): "c",
      Symbol(disposables): [Function],
    }
  `);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable in b]`);
});

test("disposeScope: disposing first scope", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("disposable in b")));
  });
  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  runInScope(c, () => {
    onDispose(log.add(label("disposable in c")));
  });

  disposeScope(a);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(next): [Object c],
      Symbol(disposed): true,
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object c],
      Symbol(name): "b",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(next): [Object b],
      Symbol(name): "c",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable in c]
    > [disposable in b]
    > [disposable in a]
  `);
});

test("disposeScope: re-entry", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("disposable in b")));
  });
  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  runInScope(c, () => {
    onDispose(() => {
      log.add(label("disposable in c"))();
      expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
      expect(isScopeDisposed(b)).toMatchInlineSnapshot(`true`);
      expect(isScopeDisposed(c)).toMatchInlineSnapshot(`true`);
    });
  });

  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable in c]
    > [disposable in b]
    > [disposable in a]
  `);
});
