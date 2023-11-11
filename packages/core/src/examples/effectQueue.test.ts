import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { log } from "../setupTests";

const pullersSymbol = Symbol("pullers");
const puleesSymbol = Symbol("pulees");
const effectCountSymbol = Symbol("effectCount");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [pullersSymbol]?: Reaction[];
}

interface Reaction {
  (): void;
  [puleesSymbol]?: Subject[];
  [effectCountSymbol]?: number;
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
const startReaction = (reaction: Reaction) => {
  const outerReaction = currentReaction;
  currentReaction = reaction;
  reaction();
  currentReaction = outerReaction;
};

/**
 * Internal.
 */
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

const createEffect = (reaction: Reaction) => {
  let disposed = false;
  if (effectCountSymbol in reaction) {
    reaction[effectCountSymbol]++;
  } else {
    reaction[effectCountSymbol] = 1;
    startReaction(reaction);
  }
  return () => {
    if (disposed) {
      throw new Error("Already disposed.");
    }
    disposed = true;
    if (reaction[effectCountSymbol] === 1) {
      delete reaction[effectCountSymbol];
      stopReaction(reaction);
    } else {
      reaction[effectCountSymbol]!--;
    }
  };
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
  const dispose = createEffect(reaction);
  return [
    () => {
      pull(subject);
      return initialValue as Value;
    },
    dispose,
  ];
};

test("effect", () => {
  const subject = {};
  const callback = () => {
    pull(subject);
    log("reaction");
  };
  const disposeEffect1 = createEffect(callback);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  const disposeEffect2 = createEffect(callback);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  disposeEffect2();
  disposeEffect1();
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});

test("signal", () => {
  const [x, setX] = createSignal(0);
  expect(x()).toMatchInlineSnapshot(`0`);
  createEffect(() => {
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
  createEffect(() => {
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

test("diamond problem is not solved", () => {
  const [a, setA] = createSignal(0);
  const [b] = createMemo(() => a());
  const [c] = createMemo(() => a());
  createEffect(() => {
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
  createEffect(() => {
    log("reaction b");
    pull(a);
    push(b);
  });
  createEffect(() => {
    log("reaction c");
    pull(a);
    push(c);
  });
  createEffect(() => {
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
