import { pull, push } from "./reactivity";

const voidSymbol = Symbol("void");

export const createMemo = <Value>(get: () => Value): (() => Value) => {
  let value: typeof voidSymbol | Value = voidSymbol;
  const update = () => {
    const newValue = get();
    if (newValue !== value) {
      value = newValue;
      push(update);
    }
  };
  return (): Value => {
    pull(update);
    return value as Value;
  };
};
