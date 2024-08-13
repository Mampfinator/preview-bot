/**
 * Sleeps for `ms` milliseconds.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * unwraps a neverthrow Result if the argument is one, or returns the argument if it is not.
 */
function unwrap(result) {
    return result._unsafeUnwrap();
}

module.exports = {
    sleep,
    unwrap,
};

