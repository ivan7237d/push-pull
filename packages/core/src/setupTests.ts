import { noopLog, resetLog } from "@1log/core";
import { getLogFunction } from "@1log/function";
import { jestPlugin } from "@1log/jest";

export const log = noopLog.add(jestPlugin());
export const logFunction = getLogFunction(log);

afterEach(() => {
  resetLog();
});
