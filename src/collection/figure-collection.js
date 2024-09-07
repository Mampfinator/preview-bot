const { getDriver } = require("../driver");

/**
 * @param {string} rawCode 
 * @returns { [string, number] }
 */
function parseCode(rawCode) {
    const [type, code] = rawCode.split("-");
    return [type, Number(code)]
}

class FigureCollection {
    #driver = getDriver();

    /**
     * 
     * @param {import("discord.js").Client} client 
     */
    constructor(client) {
        this.client = client;
    }

    /**
     * Claim a figure for a user.
     * This represents a **free** claim and does not affect the user's currency.
     * 
     * @param {string} rawCode
     * @param {import("discord.js").GuildMember} member
     */
    async claim(rawCode, member) {
        const session = this.#driver.session();

        const [type, code] = parseCode(rawCode);

        const claimed = await this.claimed(rawCode, member.guild.id, session);
        if (claimed) {
            await session.close();
            return false;
        }

        let success = false;

        try {
            await session.executeWrite(tx => tx.run(`
                MATCH (f:Figure { type: $type, code: $code })
                MERGE (u:User { id: $userId })
                MERGE (f)-[:OWNED_BY { server_id: $serverId }]->(u)
            `, { type, code, serverId: member.guild.id, userId: member.id }));

            success = true;
        } catch (err) {
            console.error(err);
            success = false;
        } finally {
            await session.close();
        }

        return success;
    }

    /**
     * @returns {Promise<boolean>} whether a figure has been claimed on this server.
     */
    async claimed(rawCode, guildId, useSession) {
        const shouldClose = !useSession;
        const session = useSession ?? this.#driver.session();

        let claimed = false;
        try {
            const [type, code] = parseCode(rawCode);
            const result = await session.executeRead(tx => tx.run(`
                MATCH (:Figure { type: $type, code: $code })-[:OWNED_BY { server_id: $serverId }]->(:User)
                RETURN true as claimed
            `, { type, code, serverId: guildId }));

            claimed = result.records.length > 0 && result.records[0].get("claimed");
        } finally {
            if (shouldClose) session.close();
        }

        return claimed;
    }
}

module.exports = {
    FigureCollection,
}