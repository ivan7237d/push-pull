import { noopLog, resetLog } from "@1log/core";
import { getLogFunction } from "@1log/function";
import { jestPlugin, readLog } from "@1log/jest";

export const log = noopLog.add(jestPlugin());
export const logFunction = getLogFunction(log);

afterEach(() => {
  if (readLog().length) {
    throw "Log expected to be empty at the end of each test.";
  }
  resetLog();
});

const names = new WeakMap<object, string>();

/**
 * When an object/function has been named, we will represent it in snapshots with
 * just "[Object <name>]" or "[Function <name>]" unless it's the top-level named
 * non-function object, which is serialized as "[Object <name>] { <contents> }".
 */
export const setName = (object: object, name: string) => {
  names.set(object, name);
};

let valueToSkip: unknown;

expect.addSnapshotSerializer({
  test: (value: unknown) =>
    value !== valueToSkip &&
    ((typeof value === "object" && value !== null) ||
      typeof value === "function") &&
    names.has(value),
  serialize: (value, config, indentation, depth, refs, printer) => {
    if (typeof value === "function") {
      return `[Function ${names.get(value)}]`;
    }
    if (valueToSkip === undefined) {
      valueToSkip = value;
      try {
        return (
          `[Object ${names.get(value)}] ` +
          printer(value, config, indentation, depth, refs)
        );
      } finally {
        valueToSkip = undefined;
      }
    }
    return `[Object ${names.get(value)}]`;
  },
});

export const hasSymbol = (object: object, name: string) =>
  Reflect.ownKeys(object).some(
    (symbol) => symbol.toString() === `Symbol(${name})`
  );
