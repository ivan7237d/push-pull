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
  [colorSymbol]?: typeof checkSymbol | typeof cleanSymbol;
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
const pushSweepers = (reaction: Reaction) => {
  if (sweepersSymbol in reaction) {
    for (let i = 0; i < reaction[sweepersSymbol].length; i++) {
      const sweeper = reaction[sweepersSymbol][i]!;
      if (sweeper[colorSymbol] === cleanSymbol) {
        sweeper[colorSymbol] = checkSymbol;
        pushSweepers(sweeper);
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
        pushSweepers(puller);
      }
    }
  }
};

const sweep = (reaction: Reaction) => {
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

  if (reaction[colorSymbol] === checkSymbol) {
    // In this case we don't know if the reaction needs to be run, but by
    // recursively calling `sweep` for sweepees, we'll eventually know one way
    // or the other.
    for (let i = 0; i < reaction[sweepeesSymbol]!.length; i++) {
      sweep(reaction[sweepeesSymbol]![i]!);
      if (!(colorSymbol in reaction)) {
        break;
      }
    }
    // If the reaction is still not dirty, this means we never broke out of the
    // loop above and all the sweepees are now clean, and so `reaction` is clean
    // too.
    if (colorSymbol in reaction) {
      reaction[colorSymbol] = cleanSymbol;
      return;
    }
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

  const outerReaction = currentReaction;
  currentReaction = reaction;
  reaction[colorSymbol] = cleanSymbol;
  reaction();
  currentReaction = outerReaction;
};

//
// Abstractions on top of reactivity
//

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
  const reaction = () => {
    const newValue = get();
    if (newValue !== initialValue) {
      initialValue = newValue;
      push(reaction);
    }
  };
  return () => {
    sweep(reaction);
    pull(reaction);
    return initialValue as Value;
  };
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

test("cyclical graph", () => {
  let x = 2;
  const reaction = () => {
    log.add(label("reaction"))(x);
    pull(reaction);
    if (x > 0) {
      x--;
      push(reaction);
    }
  };
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 2`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 1`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 0`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);

  x = 2;
  push(reaction);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 2`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 1`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`> [reaction] 0`);
  sweep(reaction);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});
