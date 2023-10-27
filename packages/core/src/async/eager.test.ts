import { eager } from "./eager";
import { createLazyPromise } from "./lazyPromise";

test("resolve", async () => {
  const promise = createLazyPromise<string>((resolve) => {
    resolve("value");
  });
  expect(await eager(promise)).toMatchInlineSnapshot(`"value"`);
});

test("reject", async () => {
  const promise = createLazyPromise<unknown, string>((_, reject) => {
    reject("oops");
  });
  expect(() => eager(promise)).rejects.toMatchInlineSnapshot(`"oops"`);
});
