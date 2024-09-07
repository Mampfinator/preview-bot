const { COLLECTION } = require("./collection/collection");
const { ROLL_COMMAND } = require("./collection/roll");
const { SELL } = require("./collection/sell");

const COMMANDS = [
    ROLL_COMMAND,
    COLLECTION,
    SELL,
]

module.exports = {
    COMMANDS,
}