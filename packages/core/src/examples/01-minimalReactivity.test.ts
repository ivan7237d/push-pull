/**
 * This module implements the simplest version of reactivity that I can think
 * of.
 *
 * "I want the side effects of a specific ("observed") reaction to be such as if
 * all the reactions were clean"
 *
 * `push` and `pull` are two functions that take a _subject_, which can be any
 * object including a function.
 *
 * We define a _reaction_ as a `() => void` function that would not produce side
 * effects if it has been run previously and no subject pulled in the last run
 * has been pushed since the end of that run.
 *
 * This module gives you a function called `sweep` that takes a reaction and
 * whose job is to give you a guarantee that if you run the reaction immediately
 * afterwards, it would not produce side effects.
 *
 * Down below there are also examples of constructs you can build on top of
 * push/pull/sweep, and then unit tests.
 */

import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { log } from "../setupTests";

//
// Reactivity
//

const parentsSymbol = Symbol("parents");
const callbackSymbol = Symbol("callback");
const childrenSymbol = Symbol("children");
const stateSymbol = Symbol("state");
const conditionallyCleanSymbol = Symbol("conditionallyClean");
const runningSymbol = Symbol("running");
const cleanSymbol = Symbol("clean");
const unchangedChildrenCountSymbol = Symbol("unchangedChildrenCount");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: Reaction[];
}

interface Reaction extends Subject {
  [callbackSymbol]: () => void;
  [childrenSymbol]?: (Subject | Reaction)[];
  [stateSymbol]?:
    | typeof conditionallyCleanSymbol
    | typeof runningSymbol
    | typeof cleanSymbol;
  [unchangedChildrenCountSymbol]?: number;
}

let currentReaction: Reaction | undefined;

const createReaction = (callback: () => void): Reaction => ({
  [callbackSymbol]: callback,
});

/**
 * Internal.
 */
const updateParents = (
  subject: Subject,
  state?: typeof conditionallyCleanSymbol
) => {
  if (parentsSymbol in subject) {
    for (let i = 0; i < subject[parentsSymbol].length; i++) {
      const parent = subject[parentsSymbol][i]!;
      if (
        parent[stateSymbol] === cleanSymbol ||
        (!state && parent[stateSymbol] === conditionallyCleanSymbol)
      ) {
        if (state) {
          parent[stateSymbol] = state;
        } else {
          delete parent[stateSymbol];
        }
        updateParents(parent, conditionallyCleanSymbol);
      }
    }
  }
};

const push: { (subject?: object): void } = (subject?: Subject) => {
  if (currentReaction) {
    if (subject !== undefined) {
      throw new Error(
        "A reaction cannot call `push` with an argument: it can only push itself, which is done by calling `push` with no arguments."
      );
    }
    subject = currentReaction;
  } else {
    if (subject === undefined) {
      throw new Error(
        "`push` can be called without arguments only inside a reaction."
      );
    }
  }

  updateParents(subject);
};

/**
 * Internal.
 */
const removeFromChildren = (startingIndex: number) => {
  const children = currentReaction![childrenSymbol]!;
  for (let i = startingIndex; i < children.length; i++) {
    const child = children[i]!;
    const parents = child[parentsSymbol]!;
    if (parents.length === 1) {
      delete child[parentsSymbol];
    } else {
      const swap = parents.indexOf(currentReaction!);
      parents[swap] = parents[parents.length - 1]!;
      parents.pop();
    }
  }
};

/**
 * Internal.
 */
const sweep = (reaction: Reaction) => {
  if (reaction[stateSymbol] === conditionallyCleanSymbol) {
    // In this case we don't know if the reaction needs to be run, but by
    // recursively calling `sweep` for children, we'll eventually know one way
    // or the other.
    for (let i = 0; i < reaction[childrenSymbol]!.length; i++) {
      const child = reaction[childrenSymbol]![i]!;
      if (
        callbackSymbol in child &&
        (!(stateSymbol in child) ||
          child[stateSymbol] === conditionallyCleanSymbol)
      ) {
        sweep(child);
        if (!(stateSymbol in child)) {
          break;
        }
      }
    }
    // If the reaction is still not dirty, this means we never broke out of the
    // loop above and all the children are now clean, and so `reaction` is clean
    // too.
    if (reaction[stateSymbol] === conditionallyCleanSymbol) {
      reaction[stateSymbol] = cleanSymbol;
      return;
    }
  }

  const outerReaction = currentReaction;
  currentReaction = reaction;
  if (childrenSymbol in currentReaction) {
    currentReaction[unchangedChildrenCountSymbol] = 0;
  }
  currentReaction[stateSymbol] = runningSymbol;
  currentReaction[callbackSymbol]();
  const unchangedChildrenCount = currentReaction[unchangedChildrenCountSymbol];
  if (unchangedChildrenCount !== undefined) {
    removeFromChildren(unchangedChildrenCount);
    if (unchangedChildrenCount === 0) {
      delete currentReaction[childrenSymbol];
    } else {
      currentReaction[childrenSymbol]!.length = unchangedChildrenCount;
    }
    delete currentReaction[unchangedChildrenCountSymbol];
  }
  currentReaction[stateSymbol] = cleanSymbol;
  currentReaction = outerReaction;
};

const pull: { (subject: object): void } = (subject: Subject | Reaction) => {
  if (currentReaction) {
    const unchangedChildrenCount =
      currentReaction[unchangedChildrenCountSymbol];
    if (unchangedChildrenCount !== undefined) {
      if (
        currentReaction[childrenSymbol]![unchangedChildrenCount] === subject
      ) {
        currentReaction[unchangedChildrenCountSymbol]!++;
        return;
      }
      removeFromChildren(unchangedChildrenCount);
      currentReaction[childrenSymbol]!.length = unchangedChildrenCount;
      delete currentReaction[unchangedChildrenCountSymbol];
    }
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
  if (callbackSymbol in subject && subject[stateSymbol] !== cleanSymbol) {
    sweep(subject);
  }
};

//
// Abstractions on top of reactivity
//

const createSignal = <Value>(
  value: Value
): readonly [get: () => Value, set: (newValue: Value) => void] => {
  const get = () => {
    pull(get);
    return value;
  };
  return [
    get,
    (newValue: Value) => {
      if (newValue !== value) {
        value = newValue;
        push(get);
      }
    },
  ];
};

/**
 * Internal.
 */
const voidSymbol = Symbol("void");

const createMemo = <Value>(get: () => Value): (() => Value) => {
  let value: Value | typeof voidSymbol = voidSymbol;
  const reaction = createReaction(() => {
    const newValue = get();
    if (newValue !== value) {
      value = newValue;
      push();
    }
  });
  return () => {
    pull(reaction);
    return value as Value;
  };
};

//
// Tests
//

test("reaction", () => {
  const subject = {};
  const reaction = createReaction(() => {
    pull(subject);
    log("reaction");
  });
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
});

test("signal", () => {
  const [x, setX] = createSignal(0);
  expect(x()).toMatchInlineSnapshot(`0`);
  const reaction = createReaction(() => {
    log.add(label("reaction"))(x());
  });
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 0`);
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  setX(1);
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 1`);
  setX(1);
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("memo", () => {
  const [x, setX] = createSignal(0);
  const memo = createMemo(() => log.add(label("memo"))(Math.min(x() * 2, 10)));
  expect(memo()).toMatchInlineSnapshot(`0`);
  const reaction = createReaction(() => {
    log.add(label("reaction"))(memo());
  });
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`
    > [memo] 0
    > [reaction] 0
  `);
  setX(5);
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`
    > [memo] 10
    > [reaction] 10
  `);
  setX(6);
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [memo] 10`);
});

test("for an asymmetrical diamond graph there are no glitches or redundant reaction calls", () => {
  //     a
  //   /   \
  //  b     c
  //  |     |
  //  |     d
  //   \   /
  //     e
  //
  // We use this particular shape of the graph because it produces glitches with
  // simple propagation whether we go depth-first or breadth-first.

  const [a, setA] = createSignal(0);
  const b = createMemo(() => a());
  const c = createMemo(() => a());
  const d = createMemo(() => c());
  const e = createReaction(() => {
    log(b() + d());
  });
  pull(e);
  expect(readLog()).toMatchInlineSnapshot(`> 0`);
  setA(1);
  pull(e);
  expect(readLog()).toMatchInlineSnapshot(`> 2`);
});

test("cyclical pull", () => {
  let a = 2;
  const reaction = createReaction(() => {
    log.add(label("reaction start"))(a);
    if (a > 0) {
      a--;
      pull(reaction);
    }
    log.add(label("reaction end"))(a);
  });
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`
    > [reaction start] 2
    > [reaction start] 1
    > [reaction end] 0
    > [reaction end] 0
  `);
  pull(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});
