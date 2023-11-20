/**
 * This module implements the simplest version of reactivity that I can think
 * of.
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
const childrenSymbol = Symbol("children");
const colorSymbol = Symbol("color");
const checkSymbol = Symbol("check");
const runningSymbol = Symbol("running");
const cleanSymbol = Symbol("clean");
const dirtySymbol = Symbol("dirty");

const subjectReactionErrorMessage =
  "A function cannot be used as both a reaction and a subject.";

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: Reaction[];
}

interface Reaction extends Subject {
  (): void;
  [childrenSymbol]?: (Subject | Reaction)[];
  [colorSymbol]?:
    | typeof checkSymbol
    | typeof runningSymbol
    | typeof cleanSymbol
    | typeof dirtySymbol;
}

let currentReaction: Reaction | undefined;

/**
 * Internal.
 */
const addChild = (child: Subject) => {
  if (currentReaction) {
    if (parentsSymbol in child) {
      child[parentsSymbol].push(currentReaction);
    } else {
      child[parentsSymbol] = [currentReaction];
    }
    if (childrenSymbol in currentReaction) {
      currentReaction[childrenSymbol].push(child);
    } else {
      currentReaction[childrenSymbol] = [child];
    }
  }
};

const pull: { (subject: object): void } = (subject: Subject) => {
  if (colorSymbol in subject) {
    throw new Error(subjectReactionErrorMessage);
  }

  addChild(subject);
};

/**
 * Internal.
 */
const pushReaction = (reaction: Reaction) => {
  if (parentsSymbol in reaction) {
    for (let i = 0; i < reaction[parentsSymbol].length; i++) {
      const parent = reaction[parentsSymbol][i]!;
      if (parent[colorSymbol] === cleanSymbol) {
        parent[colorSymbol] = checkSymbol;
        pushReaction(parent);
      }
    }
  }
};

const push: { (subject: object): void } = (subject: Subject) => {
  if (colorSymbol in subject) {
    throw new Error(subjectReactionErrorMessage);
  }

  if (parentsSymbol in subject) {
    for (let i = 0; i < subject[parentsSymbol].length; i++) {
      const parent = subject[parentsSymbol][i]!;
      if (
        parent[colorSymbol] === cleanSymbol ||
        parent[colorSymbol] === checkSymbol
      ) {
        parent[colorSymbol] = dirtySymbol;
        pushReaction(parent);
      }
    }
  }
};

/**
 * Internal.
 */
const sweepInternal = (reaction: Reaction) => {
  if (reaction[colorSymbol] === checkSymbol) {
    // In this case we don't know if the reaction needs to be run, but by
    // recursively calling `sweep` for children, we'll eventually know one way
    // or the other.
    for (let i = 0; i < reaction[childrenSymbol]!.length; i++) {
      const child = reaction[childrenSymbol]![i]!;
      if (
        colorSymbol in child &&
        (child[colorSymbol] === checkSymbol ||
          child[colorSymbol] === dirtySymbol)
      ) {
        sweepInternal(child);
        if (child[colorSymbol] === dirtySymbol) {
          break;
        }
      }
    }
    // If the reaction is still not dirty, this means we never broke out of the
    // loop above and all the children are now clean, and so `reaction` is clean
    // too.
    if (reaction[colorSymbol] === checkSymbol) {
      reaction[colorSymbol] = cleanSymbol;
      return;
    }
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

  reaction[colorSymbol] = runningSymbol;
  const outerReaction = currentReaction;
  currentReaction = reaction;
  reaction();
  currentReaction = outerReaction;
  reaction[colorSymbol] = cleanSymbol;
};

const sweep = (reaction: Reaction) => {
  if (!(colorSymbol in reaction) && parentsSymbol in reaction) {
    throw new Error(subjectReactionErrorMessage);
  }

  if (reaction[colorSymbol] === runningSymbol) {
    throw new Error(`Cyclical sweep.`);
  }

  addChild(reaction);

  if (reaction[colorSymbol] !== cleanSymbol) {
    sweepInternal(reaction);
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
  const reaction = () => {
    const newValue = get();
    if (newValue !== value) {
      value = newValue;
      // eslint-disable-next-line no-use-before-define
      push(memo);
    }
  };
  const memo = () => {
    sweep(reaction);
    pull(memo);
    return value as Value;
  };
  return memo;
};

//
// Tests
//

test("reaction", () => {
  const subject = {};
  const reaction = () => {
    pull(subject);
    log("reaction");
  };
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
});

test("signal", () => {
  const [x, setX] = createSignal(0);
  expect(x()).toMatchInlineSnapshot(`0`);
  const reaction = () => {
    log.add(label("reaction"))(x());
  };
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 0`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  setX(1);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 1`);
  setX(1);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("memo", () => {
  const [x, setX] = createSignal(0);
  const memo = createMemo(() => log.add(label("memo"))(Math.min(x() * 2, 10)));
  const reaction = () => {
    log.add(label("reaction"))(memo());
  };
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`
    > [memo] 0
    > [reaction] 0
  `);
  setX(5);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`
    > [memo] 10
    > [reaction] 10
  `);
  setX(6);
  sweep(reaction);
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
  const reaction = () => {
    log(b() + d());
  };
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> 0`);
  setA(1);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> 2`);
});

test("cyclical sweep", () => {
  const reaction = () => {
    sweep(reaction);
  };
  expect(() => {
    sweep(reaction);
  }).toThrowErrorMatchingInlineSnapshot(`"Cyclical sweep."`);
});
