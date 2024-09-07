const neo4j = require("neo4j-driver");

/**
 * @type { neo4j.Driver }
 */
let driver;

function getDriver() {
    if (!driver) {
        driver = neo4j.driver(
            process.env.NEO4J_URI ?? "bolt://localhost:7687",
            process.env.NEO4J_USER && process.env.NEO4J_PASSWORD ? neo4j.auth.basic(
                process.env.NEO4J_USER ?? "neo4j",
                process.env.NEO4J_PASSWORD ?? "password"
            ) : undefined,
        );
    }
    return driver;
}

const CONSTRAINTS = {
    node: [
        ["Figure", "code"],
        ["Character", "id"],
        ["Franchise", "id"],
        ["User", "id"],
        ["Guild", "id"],
    ],
    relationship: []
}

async function setupDriver() {
    const driver = getDriver();

    await driver.getServerInfo();

    const session = driver.session();

    let success = false;

    try {
        const transaction = await session.beginTransaction();

        for (const [label, property] of CONSTRAINTS.node) {
            await transaction.run(`
                CREATE CONSTRAINT ${label.toLowerCase()}_${property}_unique IF NOT EXISTS 
                FOR (n:${label}) REQUIRE n.${property} IS UNIQUE
            `);
        }

        for (const [label, property] of CONSTRAINTS.relationship) {
            await transaction.run(`
                CREATE CONSTRAINT ${label.toLowerCase()}_${property}_unique IF NOT EXISTS 
                FOR ()-[r:${label}]-() REQUIRE r.${property} IS UNIQUE
            )`);
        }

        await transaction.commit();
        success = true;
    } catch (err) {
        console.error(err);
        driver.close();
        driver = undefined;
    } finally {
        session.close();
    }

    return success;
}

function getSession() {
    return driver.session();
}

module.exports = {
    getDriver,
    setupDriver,
    getSession,
}