const { default: axios, AxiosError } = require("axios");
const sqlite = require("sqlite3");

const { sleep } = require("../util");

class AmiAmiFallbackClient {
    #db;

    constructor(options) {
        const dbPath = options?.dbPath ?? process.env.DB_PATH ?? "./data.db";

        this.#db = new sqlite.Database(dbPath);
    }

    async init() {
        await new Promise((resolve, reject) => {
            this.#db.run("CREATE TABLE IF NOT EXISTS figures (code INTEGER, quarter INTEGER, preowned INTEGER)", (err) => {
                if (err) reject(err)
                resolve();
            });
        });
    }

    async getImage(code) {
        try {
            const [_, buffer] = await guesstimateQuarter(this.#db, code);
            return buffer;
        } catch (error) {
            console.error(error);
            return null;
        }
    }
}



function parseCode(rawCode) {
    if (typeof rawCode != "string") throw new Error("rawCode must be a string");

    return {
        code: Number(rawCode.replace("-R", "")),
        preowned: rawCode.indexOf("R") >= 0
    }
}

function getImageBuffer(code, quarter) {
    if (typeof code !== "string") code = String(code);
    if (code.length < 6) code = "0".repeat(6 - code.length) + code;

    const url = `https://img.amiami.com/images/product/main/${quarter}/FIGURE-${code}.jpg`;
    return axios.get(url, { responseType: "arraybuffer" }).then(res => Buffer.from(res.data, "binary"));
}

async function guesstimateQuarter(db, rawCode) {
    if (typeof rawCode != "string") throw new Error("code must be a string");

    const {
        code,
        preowned
    } = parseCode(rawCode);

    // find existing entry
    const existingEntry = await new Promise((res, rej) => db.get(`SELECT quarter FROM figures WHERE code = (?)`, [code], (err, row) => {
        if (err) rej(err);
        res(row)
    }));

    if (existingEntry) return [existingEntry.quarter, await getImageBuffer(code, existingEntry.quarter)];



    console.log(`Guessing quarter for ${code} (${preowned ? "preowned" : "not preowned"}).`);

    let rows = [];

    const statement1 = db.prepare(`
        SELECT quarter, code
        FROM figures
        WHERE code <= (?)
        ORDER BY code DESC
        LIMIT 1;
    `);

    const statement2 = db.prepare(`
        SELECT quarter, code
        FROM figures
        WHERE code >= (?)
        ORDER BY code ASC
        LIMIT 1;
    `);

    await new Promise((resolve, reject) => statement1.all([code], (err, rows) => {
        if (err) reject(err)
        resolve(rows[0]);
    })).then(row => rows.push(row));

    await new Promise((resolve, reject) => statement2.all([code], (err, rows) => {
        if (err) reject(err)
        resolve(rows[0]);
    })).then(row => rows.push(row));

    console.log(rows);

    rows = rows.filter(row => !!row && !isNaN(row.code));

    if (!rows) return null;
    if (rows.length <= 0) return null;

    console.log(rows);

    const initialQuarter = rows.length == 1 ? Quarter.fromString(String(rows[0].quarter)) : estimateQuarter(rows[0], rows[1], code);
    let quarter = initialQuarter.clone();

    console.log("Initial guess: ", quarter);


    let guess = 0;

    while (guess < 16) {
        try {
            const imageBuffer = await getImageBuffer(code, quarter.toString());

            console.log(`Found image for ${code} in ${quarter.toString()}.`);

            if (imageBuffer) {
                // Update DB - we found a quarter for an unknown code
                db.run("INSERT INTO figures VALUES (?, ?, ?)", code, Number(quarter.toString()), Number(preowned));

                return [quarter, imageBuffer];
            }
        } catch (error) {
            if (error instanceof AxiosError && error.response?.status == 404) {
                const sign = guess % 2 == 0 ? 1 : -1;
                const offset = Math.floor(guess / 2) + 1;

                quarter = initialQuarter.addQuarter(offset * sign);
                console.log(`Failed to get image for ${code}. Retrying with ${quarter.toString()} (${initialQuarter.toString()} ${sign > 0 ? "+" : "-"} ${offset}).`);

                guess += 1;
            } else {
                throw error;
            }

            await sleep(250);
        }
    }

    return [null, null];
}


function estimateQuarter(figure1, figure2, code) {
    if (!figure1 || !figure2) throw new TypeError("quarter1 and quarter2 must be objects with year and quarter properties");

    const diff = figure2.code - figure1.code;

    if (diff == 0) return Quarter.fromNumber(figure1.quarter);

    const codeScale = Math.abs(1 - (figure2.code - code)/diff);


    const quarterA = Quarter.fromNumber(figure1.quarter);
    const quarterB = Quarter.fromNumber(figure2.quarter);

    const quartersToAdd = Math.round((quarterB.toNumQuarters() - quarterA.toNumQuarters()) * codeScale);

    const result = quarterA.addQuarter(quartersToAdd);

    console.log(`Estimated quarter between ${quarterA.toString()} (${figure1.code}) and ${quarterB.toString()} (${figure2.code}): ${result.toString()} (${quartersToAdd}; ${String(codeScale).substring(0, 4)}).`);

    return result;
}


class Quarter {
    year;
    quarter;

    constructor(year, quarter) {
        this.year = year;
        this.quarter = quarter;
    }

    static fromString(quarterStr) {
        if (typeof quarterStr !== "string") quarterStr = String(quarterStr);

        const year = Number(quarterStr.substr(0, 2));
        const quarter = Number(quarterStr.substr(2, 1));

        return new Quarter(year, quarter);
    }

    static fromNumber(num) {
        if (typeof num != "number") throw new Error("num must be a number");
        return Quarter.fromString(String(num));
    }

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

    clone() {
        return new Quarter(this.year, this.quarter);
    }

    addYear(year) {
        if (typeof year != "number") throw new Error("year must be a number");

        return new Quarter(this.year + year, this.quarter);
    }

    // this method is an absolute mess but it's *probably* kind of correct.
    addQuarter(quarters) {
        if (!Number.isInteger(quarters)) throw new Error("quarters must be an integer");

        const numQuarters = this.toNumQuarters() + quarters;
        return Quarter.fromNumQuarters(numQuarters);
    }

    clone() {
        return new Quarter(this.year, this.quarter);
    }

    toNumQuarters() {
        return this.year * 4 + this.quarter
    }

    toString() {
        return `${this.year}${this.quarter}`
    }
}

module.exports = {
    AmiAmiFallbackClient,
}