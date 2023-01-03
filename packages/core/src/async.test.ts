import { Async } from "./async";

test("", () => {
  console.log((() => () => {}) as Async);
});
