/**
 * This module implements a generic version of the [three-colors
 * algorithm](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph).
 * You give it a bunch of "reactions": impure `() => boolean` functions whose
 * returned value indicates whether the function has produced any side effects.
 * We'll say that a reaction is in a "clean" state when re-running it doesn't
 * produce any side effects. This notion is closely related to idempotence, but
 * there are two differences:
 *
 * - To be clean, an idempotent function has to be run at least once.
 *
 * - Idempotence describes a function, whereas cleanness describes a state, so a
 *   function can be clean now and not so later.
 *
 * Inside a reaction, you can call `createDependency(<another reaction>)`.
 * Immediately after this call, the other reaction is guaranteed to be clean.
 *
 * Reactions that you provide must satisfy the following contract:
 *
 * - A reaction will stay clean as long as its dependencies are clean, or until
 *   `push(<reaction>)` is called on it. `push` is just a short way to say "this
 *   reaction may no longer be clean even if its dependencies are still clean".
 *
 * - Dependencies are non-cyclical.
 *
 * The job of this module is to react to `push` calls by running reactions in
 * such a way that:
 *
 * - Each reaction ends up in a clean state.
 *
 * - Each reaction is run at most once.
 */
