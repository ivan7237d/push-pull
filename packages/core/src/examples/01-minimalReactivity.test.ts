import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { log } from "../setupTests";

//
// Reactivity
//

const pullersSymbol = Symbol("pullers");
const puleesSymbol = Symbol("pulees");
const sweepersSymbol = Symbol("sweepers");
const sweepeesSymbol = Symbol("sweepees");
const colorSymbol = Symbol("color");
const checkSymbol = Symbol("check");
const sweepingSymbol = Symbol("sweeping");
const cleanSymbol = Symbol("clean");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [pullersSymbol]?: Reaction[];
}

interface Reaction {
  (): void;
  [puleesSymbol]?: Subject[];
  [sweepersSymbol]?: Reaction[];
  [sweepeesSymbol]?: Reaction[];
  [colorSymbol]?:
    | typeof checkSymbol
    | typeof sweepingSymbol
    | typeof cleanSymbol;
}

let currentReaction: Reaction | undefined;

const pull: { (subject: object): void } = (subject: Subject) => {
  if (currentReaction) {
    if (pullersSymbol in subject) {
      subject[pullersSymbol].push(currentReaction);
    } else {
      subject[pullersSymbol] = [currentReaction];
    }
    if (puleesSymbol in currentReaction) {
      currentReaction[puleesSymbol].push(subject);
    } else {
      currentReaction[puleesSymbol] = [subject];
    }
  }
};

/**
 * Internal.
 */
const scheduleSweepers = (reaction: Reaction) => {
  if (sweepersSymbol in reaction) {
    for (let i = 0; i < reaction[sweepersSymbol].length; i++) {
      const sweeper = reaction[sweepersSymbol][i]!;
      if (sweeper[colorSymbol] === cleanSymbol) {
        sweeper[colorSymbol] = checkSymbol;
        scheduleSweepers(sweeper);
      }
    }
  }
};

const push: { (subject: object): void } = (subject: Subject) => {
  if (pullersSymbol in subject) {
    for (let i = 0; i < subject[pullersSymbol].length; i++) {
      const puller = subject[pullersSymbol][i]!;
      if (colorSymbol in puller) {
        delete puller[colorSymbol];
        scheduleSweepers(puller);
      }
    }
  }
};

const sweep = (reaction: Reaction) => {
  if (reaction[colorSymbol] === sweepingSymbol) {
    throw new Error(`Cyclical sweep.`);
  }

  if (currentReaction) {
    if (sweepersSymbol in reaction) {
      reaction[sweepersSymbol].push(currentReaction);
    } else {
      reaction[sweepersSymbol] = [currentReaction];
    }
    if (sweepeesSymbol in currentReaction) {
      currentReaction[sweepeesSymbol].push(reaction);
    } else {
      currentReaction[sweepeesSymbol] = [reaction];
    }
  }

  if (reaction[colorSymbol] === cleanSymbol) {
    return;
  }

  outerLoop: do {
    if (reaction[colorSymbol] === checkSymbol) {
      reaction[colorSymbol] = sweepingSymbol;
      // In this case we don't know if the reaction needs to be run, but by
      // recursively calling `sweep` for sweepees, we'll eventually know one way
      // or the other unless the reaction is pushed in the meantime.
      for (let i = 0; i < reaction[sweepeesSymbol]!.length; i++) {
        sweep(reaction[sweepeesSymbol]![i]!);
        if (reaction[colorSymbol] !== sweepingSymbol) {
          continue outerLoop;
        }
      }
      // Since all the sweepees are now clean, the `reaction` is also clean.
      break;
    }

    if (puleesSymbol in reaction) {
      for (let i = 0; i < reaction[puleesSymbol].length; i++) {
        const pulee = reaction[puleesSymbol][i]!;
        const pullers: Reaction[] = pulee[pullersSymbol]!;
        if (pullers.length === 1) {
          delete pulee[pullersSymbol];
        } else {
          const swap = pullers.indexOf(reaction);
          pullers[swap] = pullers[pullers.length - 1]!;
          pullers.pop();
        }
      }
      delete reaction[puleesSymbol];
    }
    if (sweepeesSymbol in reaction) {
      for (let i = 0; i < reaction[sweepeesSymbol].length; i++) {
        const sweepee = reaction[sweepeesSymbol][i]!;
        const sweepers: Reaction[] = sweepee[sweepersSymbol]!;
        if (sweepers.length === 1) {
          delete sweepee[sweepersSymbol];
        } else {
          const swap = sweepers.indexOf(reaction);
          sweepers[swap] = sweepers[sweepers.length - 1]!;
          sweepers.pop();
        }
      }
      delete reaction[sweepeesSymbol];
    }

    reaction[colorSymbol] = sweepingSymbol;
    const outerReaction = currentReaction;
    currentReaction = reaction;
    reaction();
    currentReaction = outerReaction;
  } while (reaction[colorSymbol] !== sweepingSymbol);

  reaction[colorSymbol] = cleanSymbol;
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

test("cyclical pull", () => {
  const [a, setA] = createSignal(2);
  const reaction = () => {
    const value = a();
    log.add(label("reaction"))(value);
    if (value > 0) {
      setA(value - 1);
    }
  };
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`
    > [reaction] 2
    > [reaction] 1
    > [reaction] 0
  `);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);

  setA(2);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`
    > [reaction] 2
    > [reaction] 1
    > [reaction] 0
  `);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("cyclical sweep", () => {
  const reaction = () => {
    sweep(reaction);
  };
  expect(() => {
    sweep(reaction);
  }).toThrowErrorMatchingInlineSnapshot(`"Cyclical sweep."`);
});
