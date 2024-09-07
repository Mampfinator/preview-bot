const { default: axios, AxiosError } = require("axios");
const { sleep } = require("../util");
const { AmiAmiDb } = require("./amiami-db");
const { getDriver } = require("../driver");

/**
 * The fallback client for AmiAmi.
 * 
 * Its main purpose is to at least generate image URLs in cases where the main API fails.
 */
class AmiAmiFallbackClient {
    /**
     * @type {AmiAmiDb}
     */
    #db;

    constructor(options) {
        const dbPath = options?.dbPath ?? process.env.DB_PATH ?? "./data.db";

        this.#db = new AmiAmiDb();
    }

    /**
     * Returns an image buffer for the given code, or null if it can't find the image after 16 tries.
     */
    async getImage(rawCode) {
        try {
            const [{ quarter, code, prewoned }, buffer] = await guesstimateQuarter(getDriver(), rawCode);
            if (!buffer) return null;
            
            await this.insertPartial(code, quarter, prewoned);
            return buffer;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    /**
     * Insert a new FIGURE-code - quarter pair into the database.
     */
    async insertPartial(code, quarter, preowned) {
        this.#db.insertPartial(code, quarter, preowned);
    }

    async insertFull(item) {
        this.#db.insertFull(item);
    }
}



function parseCode(rawCode) {
    if (typeof rawCode != "string") throw new Error("rawCode must be a string");

    return {
        code: Number(rawCode.replace("-R", "")),
        preowned: rawCode.indexOf("R") >= 0
    }
}

function normalizeCode(code) {
    if (typeof code !== "string") code = String(code);
    if (code.length < 6) code = "0".repeat(6 - code.length) + code;

    return code;
}

function getImageBuffer(code, quarter) {
    code = normalizeCode(code);

    const url = `https://img.amiami.com/images/product/main/${quarter}/FIGURE-${code}.jpg`;
    return axios.get(url, { responseType: "arraybuffer" }).then(res => Buffer.from(res.data, "binary"));
}

/**
 * Tries to guess the quarter for the given code.
 * 
 * It does this by estimating the quarter from the previous and next figures we've already seen,
 * then guessing quarters around the initial estimate.
 * 
 * @param { import("neo4j-driver").Driver } db
 * @param { string } rawCode
 */
async function guesstimateQuarter(db, rawCode) {
    if (typeof rawCode != "string") throw new Error("code must be a string");

    const {
        code,
        preowned
    } = parseCode(rawCode);

    // find existing entry
    const existingQuarter = (await db.executeQuery(`MATCH (f:Figure { code: $code }) RETURN f.quarter AS quarter`, { code }))
        .records[0]?.get("quarter");
    if (existingQuarter) return [existingQuarter, await getImageBuffer(code, existingQuarter)];

    console.log(`Guessing quarter for ${code} (${preowned ? "preowned" : "not preowned"}).`);
    
    const session = db.session();

    let rows = await session.executeRead(tx => tx.run(`
            OPTIONAL MATCH (f:Figure)
            WHERE f.code <= $code
            ORDER BY f.code DESC
            LIMIT 1

            UNION

            OPTIONAL MATCH (f:Figure)
            WHERE f.code >= $code
            ORDER BY f.code ASC
            LIMIT 1
    `));

    console.log(rows);

    rows = rows.filter(row => !!row && !isNaN(row.code));

    if (!rows) return null;
    if (rows.length <= 0) return null;

    const initialQuarter = rows.length == 1 ? Quarter.fromString(String(rows[0].quarter)) : estimateQuarter(rows[0], rows[1], code);
    let quarter = initialQuarter.clone();

    console.log("Initial guess: ", quarter);


    let guess = 0;

    // this is a pretty arbitrary number of tries, we might want to make it configurable.
    while (guess < 16) {
        try {
            const imageBuffer = await getImageBuffer(code, quarter.toString());

            console.log(`Found image for ${code} in ${quarter.toString()}.`);

            if (imageBuffer) {
                await session.close();
                return [{code, preowned, quarter: quarter.toString()}, imageBuffer];
            }
        } catch (error) {
            if (error instanceof AxiosError && error.response?.status == 404) {
                const sign = guess % 2 == 0 ? 1 : -1;
                const offset = Math.floor(guess / 2) + 1;

                quarter = initialQuarter.addQuarters(offset * sign);
                console.log(`Failed to get image for ${code}. Retrying with ${quarter.toString()} (${initialQuarter.toString()} ${sign > 0 ? "+" : "-"} ${offset}).`);

                guess += 1;
            } else {
                throw error;
            }

            await sleep(250);
        }
    }

    await session.close();
    return [null, null];
}

/**
 * Estimates the quarter between two figures.
 * Linearly interpolates the quarter from the difference between the two figure codes.
 */
function estimateQuarter(figure1, figure2, code) {
    const diff = figure2.code - figure1.code;

    if (diff == 0) return Quarter.fromNumber(figure1.quarter);

    const codeScale = Math.abs(1 - (figure2.code - code)/diff);


    const quarterA = Quarter.fromNumber(figure1.quarter);
    const quarterB = Quarter.fromNumber(figure2.quarter);

    const quartersToAdd = Math.round((quarterB.toNumQuarters() - quarterA.toNumQuarters()) * codeScale);

    const result = quarterA.addQuarters(quartersToAdd);

    console.log(`Estimated quarter between ${quarterA.toString()} (${figure1.code}) and ${quarterB.toString()} (${figure2.code}): ${result.toString()} (${quartersToAdd}; ${String(codeScale).substring(0, 4)}).`);

    return result;
}

/**
 * Represents a quarter in the AmiAmi catalog.
 * 
 * Converts between string and a number representations, and implements some useful (arithmetic) methods.
 */
class Quarter {
    year;
    quarter;

    constructor(year, quarter) {
        this.year = year;
        this.quarter = quarter;
    }

    /**
     * Parse a quarter string into a Quarter object.
     * 
     * A quarter string is a string of the form `YYQ` where `YY` is the year and `Q` is the quarter.
     */
    static fromString(quarterStr) {
        if (typeof quarterStr !== "string") quarterStr = String(quarterStr);

        const year = Number(quarterStr.substr(0, 2));
        const quarter = Number(quarterStr.substr(2, 1));

        return new Quarter(year, quarter);
    }

    /**
     * Create a Quarter object from a number. This is an *alias* for `Quarter.fromString()`, only for convenience.
     * 
     * If you need to convert from a number of quarters, use {@link Quarter.fromNumQuarters}.
     */
    static fromNumber(num) {
        if (typeof num != "number") throw new Error("num must be a number");
        return Quarter.fromString(String(num));
    }

    /**
     * Create a Quarter object from a number of quarters.
     * 
     * A "number of quarters" is `YY * 4 + Q`, where `YY` is the year and `Q` is the quarter.
     * 
     * If you need to convert from a quarter string, use {@link Quarter.fromString}.
     */
    static fromNumQuarters(numQuarters) {
        if (typeof numQuarters != "number") throw new Error("numQuarters must be a number");

        let year = Math.floor(numQuarters / 4);
        let quarter = numQuarters % 4;

        if (quarter === 0) {
            year -= 1;
            quarter = 4;
        }

        return new Quarter(year, quarter);
    }

    /**
     * Create a copy of this Quarter object.
     */
    clone() {
        return new Quarter(this.year, this.quarter);
    }

    /**
     * Create a new Quarter object that is `years` years after this one.
     */
    addYear(years) {
        if (typeof years != "number") throw new Error("year must be a number");

        return new Quarter(this.year + years, this.quarter);
    }

    /**
     * Create a new Quarter object that is `quarters` quarters after this one.
     */
    addQuarters(quarters) {
        if (!Number.isInteger(quarters)) throw new Error("quarters must be an integer");

        const numQuarters = this.toNumQuarters() + quarters;
        return Quarter.fromNumQuarters(numQuarters);
    }

    /**
     * Get the number of quarters in this Quarter object.
     * 
     * To convert back from a number of quarters, use {@link Quarter.fromNumQuarters}.
     */
    toNumQuarters() {
        return this.year * 4 + this.quarter
    }

    /**
     * Get the quarter as a string of the form `YYQ` where `YY` is the year and `Q` is the quarter.
     * 
     * To convert back from a quarter string, use {@link Quarter.fromString}.
     */
    toString() {
        return `${this.year}${this.quarter}`
    }
}

module.exports = {
    normalizeCode,
    AmiAmiFallbackClient,
}