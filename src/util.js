const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function unwrap(result) {
    return result?._unsafeUnwrap() ?? result;
}

module.exports = {
    sleep,
    unwrap,
};

