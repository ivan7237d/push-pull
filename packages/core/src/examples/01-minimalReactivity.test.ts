import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { log } from "../setupTests";

const pullersSymbol = Symbol("pullers");
const puleesSymbol = Symbol("pulees");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [pullersSymbol]?: Reaction[];
}

interface Reaction {
  (): void;
  [puleesSymbol]?: Subject[];
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

const startReaction = (reaction: Reaction) => {
  const outerReaction = currentReaction;
  currentReaction = reaction;
  reaction();
  currentReaction = outerReaction;
};

const stopReaction = (reaction: Reaction) => {
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

// We have to return dispose handle in addition to accessor.
const createMemo = <Value>(
  get: () => Value,
  initialValue?: Value
): [() => Value, () => void] => {
  const subject = {};
  const reaction = () => {
    const newValue = get();
    if (newValue !== initialValue) {
      initialValue = newValue;
      push(subject);
    }
  };
  startReaction(reaction);
  return [
    () => {
      pull(subject);
      return initialValue as Value;
    },
    () => {
      stopReaction(reaction);
    },
  ];
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
  const [memo, dispose] = createMemo(() =>
    log.add(label("memo"))(Math.min(x() * 2, 10))
  );
  startReaction(() => {
    log.add(label("reaction"))(memo());
  });
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
  dispose();
  setX(0);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("for a diamond graph there are glitches and redundant reaction calls", () => {
  const [a, setA] = createSignal(0);
  const [b] = createMemo(() => a());
  const [c] = createMemo(() => a());
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

test("for an asymmetrical diamond graph there are glitches and redundant reaction calls", () => {
  const [a, setA] = createSignal(0);
  const [b] = createMemo(() => a());
  const [c] = createMemo(() => a());
  const [d] = createMemo(() => c());
  startReaction(() => {
    log(b() + d());
  });
  expect(readLog()).toMatchInlineSnapshot(`> 0`);
  setA(1);
  expect(readLog()).toMatchInlineSnapshot(`
    > 1
    > 2
  `);
});
