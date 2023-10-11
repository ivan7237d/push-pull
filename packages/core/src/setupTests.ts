import { noopLog, resetLog } from "@1log/core";
import { getLogFunction } from "@1log/function";
import { jestPlugin, readLog } from "@1log/jest";

export const log = noopLog.add(jestPlugin());
export const logFunction = getLogFunction(log);

afterEach(() => {
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  resetLog();
});

/**
 * When this symbol is added as a key to an object/function (with some name
 * string as value), we will represent this object/function in snapshots with
 * just "[Object <name>]" or "[Function <name>]" unless it's the top-level named
 * non-function object, which is serialized normally.
 */
export const nameSymbol = Symbol("name");

let valueToSkip: unknown;

expect.addSnapshotSerializer({
  test: (value: unknown) =>
    value !== valueToSkip &&
    ((typeof value === "object" && value !== null) ||
      typeof value === "function") &&
    nameSymbol in value,
  serialize: (value, config, indentation, depth, refs, printer) => {
    if (typeof value === "function") {
      return `[Function ${value[nameSymbol]}]`;
    }
    if (valueToSkip === undefined) {
      valueToSkip = value;
      try {
        return printer(value, config, indentation, depth, refs);
      } finally {
        valueToSkip = undefined;
      }
    }
    return `[Object ${value[nameSymbol]}]`;
  },
});

export const hasSymbol = (object: object, name: string) =>
  Reflect.ownKeys(object).some(
    (symbol) => symbol.toString() === `Symbol(${name})`
  );
