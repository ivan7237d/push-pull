/**
 * This module implements the simplest version of reactivity that I can think
 * of.
 *
 * On the level of intuition, I think of reactive programming as having to do
 * with functions that instead of running once, run continually. I'll call these
 * functions reactions. If a regular function is a point on the time axis, a
 * reaction is a line. It should become possible to have reactions in the
 * context of finite compute resources if we put in a restriction that once a
 * reaction runs, running it again would not produce side effects for a period
 * of time. With that restriction, even though we can't actually run a reaction
 * continually, we can make it so that side effects are _as if_ it was run
 * continually.
 *
 * A _subject_ is a JavaScript object (including a function) that's used to
 * track side effects. The client must _push_ the subject by calling
 * `push(subject)` after side effects occur.
 *
 * A _reaction_ is a subject that represents side effects of some `() => void`
 * function (the _reaction callback_) that does not depend .
 *
 * We say that a reaction is _clean_ if the reaction callback would not produce
 * any side effects.
 *
 * `pull(subject)` ensures that the side effects associated with `subject` are
 * as if all the reactions were clean.
 *
 *
 *
 * The way I'm looking at it here, reactive programming is all about the concept
 * of a subroutine that produces some side effects if you run it once, but then
 * until something happens, it will not produce side effects if you run it
 * again. I'm going to call this type of subroutine a _reaction_. My intuition
 * here is that whereas a regular subroutine has to be invoked imperatively by
 * another subroutine, all the way up to the entry point, a reaction decides
 * itself when it needs to run - specifically, it runs whenever something
 * happens that could cause it to have side effects.
 *
 * `push` and `pull` are two functions that take a _subject_, which can be any
 * object including a function.
 *
 * We define a _reaction_ as a `() => void` function that would not produce side
 * effects if it has been run previously and no subject pulled in the last run
 * has been pushed since the end of that run.
 *
 * With this definition of a reaction, it becomes clear what `push`, `pull` and
 * a subject represent: a subject is a set of side effects, `push` notifies that
 * a side effect inside a specific subject has ocurred, and `pull` is a way to
 * indicate that some set of side effects has a bearing on what the reaction
 * that `pull`s would do.
 *
 *
 *
 * "I want the side effects of a specific ("observed") reaction to be such as if
 * all the reactions were clean"
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
