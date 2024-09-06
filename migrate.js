const dotenv = require("dotenv");
const sqlite = require("sqlite3");
const { getDriver, setupDriver } = require("./src/driver");
const { AmiAmiApiClient } = require("./src/amiami/amiami-api");
const { sleep } = require("./src/util");
const { normalizeCode } = require("./src/amiami/amiami-fallback");
const { toDbItem, AmiAmiDb } = require("./src/amiami/amiami-db");

dotenv.config();

const driver = getDriver();

const dbPath = process.env.DB_PATH ?? "./data.db";
const db = new sqlite.Database(dbPath);

const apiClient = new AmiAmiApiClient({
    domain: process.env.AMIAMI_DOMAIN,
});

const amiAmiDb = new AmiAmiDb();

async function main() {
    const success = await setupDriver();

    if (!success) {
        console.error("Failed to setup neo4j driver. Not migrating.");
        await driver.close();
        return;
    }

    const codes = await new Promise((resolve, reject) => {
        db.all(
            "SELECT code FROM figures",
            (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            }
        );
    });

    console.log(`Migrating ${codes.length} codes from SQLite to Neo4j.`);

    for (const code of codes.map(row => row.code).map(normalizeCode).map(code => `FIGURE-${code}`)) {
        await sleep(1000);
        const item = await apiClient.item(code).catch(() => null);
        if (!item) {
            console.log(`Failed to fetch ${code} from AmiAmi. The figure was likely removed from the catalog.`);
            continue;
        }
        
        try {
            await amiAmiDb.insertFull(item);
            console.log(`Migrated ${code}.`);
        } catch (error) {
            console.error(`Failed to migrate ${code}: ${error.message ?? error}`);
        }
    }

    console.log("Done.");
}

main().finally(() => {
    driver.close();
});