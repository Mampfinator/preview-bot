const { int } = require("neo4j-driver");
const { getSession } = require("../driver");

/**
 * Roll random claimable figures.
 * @param {string} serverId
 * @returns {Promise<{
 *  figure: ReturnType<import("../amiami/amiami-db").toDbItem>,
 *  characters: { name: string, id: number }[],
 *  franchises: { name: string, id: number }[],
 * }[]>>}
 */
async function roll(serverId, amount = 1) {
    const session = getSession();

    const rolled = await session.executeRead(tx => tx.run(`
        MATCH (f:Figure:Full) WHERE NOT (f)-[:OWNED_BY { serverId: $serverId }]->(:User)
        WITH f, rand() AS r
        ORDER BY r
        LIMIT $amount
        WITH f OPTIONAL MATCH (f)-[:BELONGS_TO]-(fr:Franchise)
        WITH f, collect(fr) as franchises OPTIONAL MATCH (f)-[:DISPLAYS]-(c)
        RETURN f as figure, collect(c) as characters, franchises
    `, { amount: int(amount), serverId }));

    await session.close();

    return rolled.records.map(record => (
        { 
            figure: record.get("figure").properties,
            characters: record.get("characters")?.map(c => c.properties),
            franchises: record.get("franchises")?.map(fr => fr.properties), 
        }
    ));
}


module.exports = {
    roll,
}