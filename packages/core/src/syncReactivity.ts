/**
 * This module implements synchronous reactivity. You give it a bunch of `() =>
 * void` functions, we'll call them reactions, that have these properties:
 *
 * - When you run one of them, it has a way to indicate whether it has produced
 *   any side effects.
 *
 * - A reaction also has a way to indicate which other reactions are its "direct
 *   dependencies". A "direct dependency" aka a "parent" is just a concept that
 *   we use for the purposes of the next property:
 *
 * - Reactions stay idempotent until either we get an external notification or a
 *   parent reaction is run and produces side effects.
 *
 * - Dependencies are non-cyclical.
 *
 * The job of this module is to react to external notifications by running
 * reactions in such a way that:
 *
 * - Each reaction ends up in a "clean" state, meaning that running it would not
 *   produce any side effects.
 *
 * - Each reaction is run at most once.
 *
 * We solve the diamond problem using [three-colors
 * algorithm](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph).
 */
