import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { log } from "../setupTests";

const parentsSymbol = Symbol("parents");
const childrenSymbol = Symbol("children");
const continuationSymbol = Symbol("continuation");
const disposablesSymbol = Symbol("disposables");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: Reaction[];
}

interface Reaction {
  (): Reaction | void;
  [childrenSymbol]?: Subject[];
  [continuationSymbol]?: Reaction;
  [disposablesSymbol]?: (() => void) | (() => void)[];
}

let currentReaction: Reaction | undefined;

const pull = (subject: Subject) => {
  if (currentReaction) {
    if (parentsSymbol in subject) {
      subject[parentsSymbol].push(currentReaction);
    } else {
      subject[parentsSymbol] = [currentReaction];
    }
    if (childrenSymbol in currentReaction) {
      currentReaction[childrenSymbol].push(subject);
    } else {
      currentReaction[childrenSymbol] = [subject];
    }
  }
};

export const onDispose = (disposable: () => void) => {
  if (currentReaction) {
    if (disposablesSymbol in currentReaction) {
      if (Array.isArray(currentReaction[disposablesSymbol])) {
        currentReaction[disposablesSymbol].push(disposable);
      } else {
        currentReaction[disposablesSymbol] = [
          currentReaction[disposablesSymbol],
          disposable,
        ];
      }
    } else {
      currentReaction[disposablesSymbol] = disposable;
    }
  }
};

const createReaction = (reaction: Reaction) => {
  const outerReaction = currentReaction;
  currentReaction = reaction;
  const continuation = reaction();
  currentReaction = outerReaction;
  onDispose(() => {
    // eslint-disable-next-line no-use-before-define
    disposeReaction(reaction);
  });
  if (continuation) {
    reaction[continuationSymbol] = continuation;
    createReaction(continuation);
  }
};

const disposeReaction = (reaction: Reaction) => {
  if (continuationSymbol in reaction) {
    disposeReaction(reaction[continuationSymbol]);
  }
  if (childrenSymbol in reaction) {
    for (let i = 0; i < reaction[childrenSymbol].length; i++) {
      const child = reaction[childrenSymbol][i]!;
      const parents: Reaction[] = child[parentsSymbol]!;
      if (parents.length === 1) {
        delete child[parentsSymbol];
      } else {
        const swap = parents.indexOf(reaction);
        parents[swap] = parents[parents.length - 1]!;
        parents.pop();
      }
    }
    delete reaction[childrenSymbol];
  }
  if (disposablesSymbol in reaction) {
    if (Array.isArray(reaction[disposablesSymbol])) {
      for (let i = 0; i < reaction[disposablesSymbol].length; i++) {
        reaction[disposablesSymbol][i]!();
      }
    } else {
      reaction[disposablesSymbol]();
    }
    delete reaction[disposablesSymbol];
  }
};

const push = (subject: Subject) => {
  if (parentsSymbol in subject) {
    const parentsCopy = [...subject[parentsSymbol]];
    for (let i = 0; i < parentsCopy.length; i++) {
      const parent = parentsCopy[i]!;
      disposeReaction(parent);
      createReaction(parent);
    }
  }
};

const createSignal = <Value>(
  value: Value
): readonly [get: () => Value, set: (newValue: Value) => void] => {
  const subject = {};
  return [
    () => {
      pull(subject);
      return value;
    },
    (newValue: Value) => {
      if (newValue !== value) {
        value = newValue;
        push(subject);
      }
    },
  ];
};

const createMemo = <Value>(
  get: () => Value,
  initialValue?: Value
): (() => Value) => {
  const subject = {};
  createReaction(() => {
    const newValue = get();
    if (newValue !== initialValue) {
      initialValue = newValue;
      push(subject);
    }
  });
  return () => {
    pull(subject);
    return initialValue as Value;
  };
};

test("reaction", () => {
  const subject = {};
  const callback = () => {
    pull(subject);
    log("reaction");
  };
  createReaction(callback);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  disposeReaction(callback);
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("signal", () => {
  const [x, setX] = createSignal(0);
  expect(x()).toMatchInlineSnapshot(`0`);
  createReaction(() => {
    log.add(label("reaction"))(x());
  });
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 0`);
  setX(1);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 1`);
  setX(1);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("memo", () => {
  const [x, setX] = createSignal(0);
  const memo = createMemo(() => Math.min(x() * 2, 10));
  createReaction(() => {
    log.add(label("reaction"))(memo());
  });
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 0`);
  setX(5);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 10`);
  setX(6);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("diamond problem is not solved", () => {
  const [a, setA] = createSignal(0);
  const b = createMemo(() => a());
  const c = createMemo(() => a());
  createReaction(() => {
    log(b() + c());
  });
  expect(readLog()).toMatchInlineSnapshot(`> 0`);
  setA(1);
  expect(readLog()).toMatchInlineSnapshot(`
    > 1
    > 2
  `);
});

test("diamond problem on reaction level", () => {
  const a = {};
  const b = {};
  const c = {};
  createReaction(() => {
    log("reaction b");
    pull(a);
    push(b);
  });
  createReaction(() => {
    log("reaction c");
    pull(a);
    push(c);
  });
  createReaction(() => {
    log("reaction d");
    pull(b);
    pull(c);
  });
  expect(readLog()).toMatchInlineSnapshot(`
    > "reaction b"
    > "reaction c"
    > "reaction d"
  `);
  push(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > "reaction b"
    > "reaction d"
    > "reaction c"
    > "reaction d"
  `);
});

test("continuation", () => {
  const a = {};
  const b = {};
  createReaction(() => {
    log("reaction");
    pull(a);
    return () => {
      log("continuation");
      pull(b);
    };
  });
  expect(readLog()).toMatchInlineSnapshot(`
    > "reaction"
    > "continuation"
  `);
  push(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > "reaction"
    > "continuation"
  `);
  push(b);
  expect(readLog()).toMatchInlineSnapshot(`> "continuation"`);
});
