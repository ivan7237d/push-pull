import { pull, push } from "./reactivity";

const voidSymbol = Symbol("void");

export const createSignal = <Value>(value: Value) => {
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

export const createMemo = <Value>(get: () => Value) => {
  let value: typeof voidSymbol | Value = voidSymbol;
  const reaction = () => {
    const newValue = get();
    if (newValue !== value) {
      value = newValue;
      push(reaction);
    }
  };
  return (): Value => {
    pull(reaction);
    return value as Value;
  };
};
