/**
 * This module implements synchronous reactivity. You give it a bunch of `() =>
 * void` functions, we'll call them thunks, that have these properties:
 *
 * - When you run one of them, it has a way to indicate whether it has produced
 *   any side effects.
 *
 * - A thunk also has a way to indicate which other thunks are its "direct
 *   dependencies". A "direct dependency" aka a "parent" is just a concept that
 *   we use for the purposes of the next property:
 *
 * - Thunks stay idempotent until either we get an external notification or a
 *   parent thunk is run and produces side effects.
 *
 * - Dependencies are non-cyclical.
 *
 * The job of this module is to react to external notifications by running
 * thunks in such a way that:
 *
 * - Your program ends up in a "stable" state, meaning that after we're done,
 *   running any of the thunks would not produce any side effects.
 *
 * - Each thunk is run at most once, so we solve the diamond problem (if you're
 *   not familiar with it, you can read up on it
 *   [here](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph).
 */
