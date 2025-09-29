/**
 * Sleeps for `ms` milliseconds.
 */
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * unwraps a neverthrow Result if the argument is one, or returns the argument if it is not.
 */
export function unwrap(result) {
    return result._unsafeUnwrap();
}