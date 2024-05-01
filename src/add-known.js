#!/usr/bin/env node
// This script adds known codes to the database. It should be run manually.
// Format: quarter: code code code-R
// Usage: node add-known
// Requires a `known.txt` file in the same directory. This is not customizable.
require("dotenv").config();

const fs = require("fs");
const sqlite = require("sqlite3");

async function main() {
    const db = new sqlite.Database(process.env.DB_PATH ?? "./data.db");

    await new Promise((resolve, reject) => {
        db.run("CREATE TABLE IF NOT EXISTS figures (code INTEGER NOT NULL, quarter INTEGER NOT NULL, preowned INTEGER NOT NULL)", (err) => {
            if (err) reject(err)
            resolve();
        });
    });

    const file = fs.readFileSync("./known.txt", "utf8");

    const entries = 
        file.split("\n")
        .map(line => line.trim().split(": "))
        .map(([quarter, codeStr]) => [quarter, codeStr.split(" ").map(code => code.trim())])
        .map(([quarter, rawCodes]) => [quarter, rawCodes.map(rawCode => {
            if (rawCode.indexOf("R") >= 0) {
                return {
                    preowned: true,
                    code: Number(rawCode.substr(0, rawCode.length - 1)),
                }
            } else {
                return {
                    preowned: false,
                    code: Number(rawCode),
                }
            }
        })]);

    console.log(JSON.stringify(entries, null, 4));

    const promises = [];

    for (const [quarter, codes] of entries) {
        for (const code of codes) {
            promises.push(new Promise((resolve, reject) => {
                db.run("INSERT OR IGNORE INTO figures (code, quarter, preowned) VALUES (?, ?, ?)", [Number(code.code), Number(quarter), Number(code.preowned)], (err) => {
                    if (err) reject(err)
                    resolve();
                });
            }));        
        }
    }

    await Promise.all(promises);

    console.log(`Done.`);
}

main()
