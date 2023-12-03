/**
 * This module implements the simplest version of reactivity that I can think
 * of. Down below there are also signal and memo implemented on top, and then
 * unit tests.
 *
 * A _subject_ is a JavaScript object (possibly a function) with which we
 * associate an imaginary comparator function that takes two states of the
 * program and returns a boolean. We say that two states are _equal in terms of
 * a given subject_ if for these two states the comparator returns true.
 *
 * A subject cannot be pulled if it was pulled previously and the current state
 * is not equal in terms of this subject to the state that existed the last time
 * the subject was pulled or pushed.
 *
 * Equivalently, if a subject was pulled and has not been pushed since, it can
 * only be pulled if the state is equal in terms of this subject to the state at
 * the time of the last pull.
 *
 * Equivalently, when there are two pulls of a subject with no push in between,
 * the state must be the same in terms of that subject at the time of the two
 * pulls.
 *
 * If you re-run a reaction, it can only produce side effects if state has
 * changed in terms of a subject that was pulled during that run.
 *
 * `pull` of a subject guarantees that running any of the reactions would not
 * change the state in terms of that subject.
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
const cleanSymbol = Symbol("clean");
const unchangedChildrenCountSymbol = Symbol("unchangedChildrenCount");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: Reaction[];
}

interface Reaction extends Subject {
  [callbackSymbol]: () => void;
  [childrenSymbol]?: (Subject | Reaction)[];
  [stateSymbol]?: typeof conditionallyCleanSymbol | typeof cleanSymbol;
  [unchangedChildrenCountSymbol]?: number;
}

/**
 * Internal.
 */
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
      if (state) {
        if (parent[stateSymbol] === cleanSymbol) {
          parent[stateSymbol] = conditionallyCleanSymbol;
        } else {
          continue;
        }
      } else if (stateSymbol in parent) {
        delete parent[stateSymbol];
      } else {
        continue;
      }
      updateParents(parent, conditionallyCleanSymbol);
    }
  }
};

const push: (subject?: object) => void = (
  subject: Subject | undefined = currentReaction
) => {
  if (currentReaction) {
    if (subject !== currentReaction) {
      throw new Error("A reaction can only push itself.");
    }
  } else if (subject === undefined) {
    throw new Error(
      "You must provide an argument when calling `push` outside of a reaction."
    );
  }

  updateParents(subject);
};

/**
 * Internal.
 */
const removeCurrentReactionFromChildren = (startingIndex: number) => {
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
      if (callbackSymbol in child && child[stateSymbol] !== cleanSymbol) {
        sweep(child);
        if (!(stateSymbol in child)) {
          break;
        }
      }
    }
    // If the reaction is still not dirty, this means we never broke out of the
    // loop above and all the children are now clean, and so `reaction` is clean
    // too.
    if (stateSymbol in reaction) {
      reaction[stateSymbol] = cleanSymbol;
      return;
    }
  }

  const outerReaction = currentReaction;
  currentReaction = reaction;
  if (childrenSymbol in currentReaction) {
    currentReaction[unchangedChildrenCountSymbol] = 0;
  }
  try {
    currentReaction[callbackSymbol]();
  } finally {
    const unchangedChildrenCount =
      currentReaction[unchangedChildrenCountSymbol];
    if (unchangedChildrenCount !== undefined) {
      removeCurrentReactionFromChildren(unchangedChildrenCount);
      if (unchangedChildrenCount === 0) {
        delete currentReaction[childrenSymbol];
      } else {
        currentReaction[childrenSymbol]!.length = unchangedChildrenCount;
      }
      delete currentReaction[unchangedChildrenCountSymbol];
    }
    currentReaction[stateSymbol] = cleanSymbol;
    currentReaction = outerReaction;
  }
};

const pull: (subject: object) => void = (subject: Subject | Reaction) => {
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
      removeCurrentReactionFromChildren(unchangedChildrenCount);
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
