import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { log } from "../setupTests";

const parentsSymbol = Symbol("parents");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: Reaction[];
}

interface Reaction {
  (): void;
}

let currentReaction: Reaction | undefined;

const pull = (subject: Subject) => {
  if (currentReaction) {
    if (parentsSymbol in subject) {
      subject[parentsSymbol].push(currentReaction);
    } else {
      subject[parentsSymbol] = [currentReaction];
    }
  }
};

const push = (subject: Subject) => {
  if (parentsSymbol in subject) {
    for (let i = 0; i < subject[parentsSymbol].length; i++) {
      subject[parentsSymbol][i]!();
    }
  }
};

const createEffect = (callback: () => void): void => {
  const outerReaction = currentReaction;
  currentReaction = callback;
  callback();
  currentReaction = outerReaction;
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
  createEffect(() => {
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
  createEffect(() => {
    pull(subject);
    log("reaction");
  });
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
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
  const memo = createMemo(() => Math.min(x() * 2, 10));
  createEffect(() => {
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
