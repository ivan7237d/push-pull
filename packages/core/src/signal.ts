import { pull, push } from "./reactivity";

export const createSignal = <Value>(
  value: Value
): readonly [() => Value, (newValue: Value) => void] => {
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
