import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { log } from "../setupTests";

const pullersSymbol = Symbol("pullers");
const puleesSymbol = Symbol("pulees");
const swipersSymbol = Symbol("swipers");
const swipeesSymbol = Symbol("swipees");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [pullersSymbol]?: (Reaction | LazyReaction)[];
}

interface Reaction {
  (): void;
  [puleesSymbol]?: Subject[];
  // eslint-disable-next-line no-use-before-define
  [swipeesSymbol]?: LazyReaction[];
}

interface LazyReaction extends Reaction {
  [swipersSymbol]?: (Reaction | LazyReaction)[];
}

let currentReaction: Reaction | LazyReaction | undefined;

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

const startReaction = (reaction: Reaction | LazyReaction) => {
  const outerReaction = currentReaction;
  currentReaction = reaction;
  reaction();
  currentReaction = outerReaction;
};

const swipe = (lazyReaction: LazyReaction) => {
  if (currentReaction) {
    if (swipersSymbol in lazyReaction) {
      lazyReaction[swipersSymbol].push(currentReaction);
    } else {
      lazyReaction[swipersSymbol] = [currentReaction];
    }
    if (swipeesSymbol in currentReaction) {
      currentReaction[swipeesSymbol].push(lazyReaction);
    } else {
      currentReaction[swipeesSymbol] = [lazyReaction];
    }
    startReaction(lazyReaction);
  }
};

const stopReaction = (reaction: Reaction | LazyReaction) => {
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
  if (swipeesSymbol in reaction) {
    for (let i = 0; i < reaction[swipeesSymbol].length; i++) {
      const swipee = reaction[swipeesSymbol][i]!;
      const swipers: (Reaction | LazyReaction)[] = swipee[swipersSymbol]!;
      if (swipers.length === 1) {
        delete swipee[swipersSymbol];
        stopReaction(swipee);
      } else {
        const swap = swipers.indexOf(reaction);
        swipers[swap] = swipers[swipers.length - 1]!;
        swipers.pop();
      }
    }
    delete reaction[swipeesSymbol];
  }
};

const push: { (subject: object): void } = (subject: Subject) => {
  if (pullersSymbol in subject) {
    const pullersCopy = [...subject[pullersSymbol]];
    for (let i = 0; i < pullersCopy.length; i++) {
      const puller = pullersCopy[i]!;
      stopReaction(puller);
      startReaction(puller);
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
  const reaction = () => {
    const newValue = get();
    if (newValue !== initialValue) {
      initialValue = newValue;
      push(reaction);
    }
  };
  return () => {
    swipe(reaction);
    pull(reaction);
    return initialValue as Value;
  };
};

test("reaction", () => {
  const subject = {};
  const callback = () => {
    pull(subject);
    log("reaction");
  };
  startReaction(callback);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  stopReaction(callback);
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("signal", () => {
  const [x, setX] = createSignal(0);
  expect(x()).toMatchInlineSnapshot(`0`);
  startReaction(() => {
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
  const memo = createMemo(() => log.add(label("memo"))(Math.min(x() * 2, 10)));
  const reaction = () => {
    log.add(label("reaction"))(memo());
  };
  startReaction(reaction);
  expect(readLog()).toMatchInlineSnapshot(`
    > [memo] 0
    > [reaction] 0
  `);
  setX(5);
  expect(readLog()).toMatchInlineSnapshot(`
    > [memo] 10
    > [reaction] 10
  `);
  setX(6);
  expect(readLog()).toMatchInlineSnapshot(`> [memo] 10`);
  stopReaction(reaction);
  setX(0);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("diamond problem is not solved", () => {
  const [a, setA] = createSignal(0);
  const b = createMemo(() => a());
  const c = createMemo(() => a());
  startReaction(() => {
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
  startReaction(() => {
    log("reaction b");
    pull(a);
    push(b);
  });
  startReaction(() => {
    log("reaction c");
    pull(a);
    push(c);
  });
  startReaction(() => {
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
