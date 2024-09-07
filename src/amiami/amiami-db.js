const { getDriver } = require("../driver");

/**
 * @param { import("./amiami-api").Item } item
 */
function toDbItem(item) {
    return {
        code: Number(item.code.split("-")[1]),
        type: item.code.split("-")[0],
        quarter: item.quarter,
        name: item.name,
        main_image: item.image,
        images: item.images,
        orderable: item.orderable,
        region_locked: item.regionLocked(),
        discount_rate: item.discountRate(),
        sale_status: item.saleStatus,
        remarks: item.remarks,
        price: item.price,
    }
}

class AmiAmiDb {
    /**
     * @type { import("neo4j-driver").Driver }
     */
    #driver;
    
    constructor() {
        this.#driver = getDriver();
    }

    /**
     * @param {string} code 
     * @param {number} quarter 
     * @param {boolean} preowned  
     */
    async insertPartial(code, quarter, preowned) {
        this.#driver.session().run(`
            MERGE (f:Figure {code: $code})
            ON CREATE SET f.quarter = $quarter, f.preowned = $preowned, n.type = "FIGURE", n:Partial
        `, {
            code,
            quarter,
            preowned
        });
    }

    /**
     * @param { import("./amiami-api").Item } item
     */
    async insertFull(item) {
        const session = this.#driver.session();

        const dbItem = toDbItem(item);

        await session.executeWrite(tx => tx.run(`
            MERGE (f:Figure:Full { code: $item.code })
            ON CREATE SET f += $item
            ON MATCH SET f += $item
        `, {
            item: dbItem,
        }));

        if (item.characters && item.franchises) {
            await session.executeWrite(tx => tx.run(`
                MATCH (f:Figure { code: $code })
                FOREACH (franchise IN $franchises | 
                    MERGE (fr:Franchise { id: franchise.id })
                    ON CREATE SET fr.name = franchise.name
                    MERGE (f)-[:BELONGS_TO]->(fr)
                )
                FOREACH (character IN $characters | 
                    MERGE (s:Character { id: character.id })
                    ON CREATE SET s.name = character.name
                    MERGE (f)-[:DISPLAYS]->(s)
                )
            `, {
                characters: item.characters,
                franchises: item.franchises,
                code: dbItem.code,
            }));
        } else if (item.characters) {
            await session.executeWrite(tx => tx.run(`
                MATCH (f:Figure { code: $code })
                FOREACH (character IN $characters | 
                    MERGE (c:Character { id: character.id })
                    ON CREATE SET c.name = character.name
                    MERGE (f)-[:DISPLAYS]->(c)
                )
            `, {
                characters: item.characters,
                code: dbItem.code,
            }));
        }

        return session.close();
    }
}

module.exports = {
    AmiAmiDb,
    toDbItem
};