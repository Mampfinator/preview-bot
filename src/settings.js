const { Colors, PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder } = require("discord.js");

/**
 * Per-guild settings.
 * 
 * Construct with `Settings.forGuild(db, guildId)`.
 */
class Settings {
    /**
     * @type {Map<string, Settings>}
     */
    static instances = new Map();

    /**
     * Whether the settings have changed since the last save.
     */
    #changed = false;

    /**
     * @type {{guild: string, disabled: string | null, preferredStyle: string | null}}
     */
    #row;
    /**
     * @type {sqlite.Database}
     */
    #db;

    constructor(db, row) {
        this.#db = db;
        this.#row = row;
    }

    async save() {
        if (!this.#changed) return;

        return new Promise((res, rej) => {
            this.#db.run("UPDATE settings SET disabled = (?), preferredStyle = (?) WHERE guild = (?)", [this.#row.disabled, this.#row.preferredStyle, this.#row.guild], (err) => {
                if (err) rej(err);
                this.#changed = false;
                
                res();
            });
        });
    }

    /**
     * @type {string}
     */
    get guildId() {
        return this.#row.guild;
    }

    /**
     * @type {Set<string>}
     */
    get disabled() {
        const raw = this.#row.disabled;

        return raw ? new Set(raw.split(",")) : new Set();
    }

    /**
     * Disable a preview provider.
     */
    disable(previewName) {
        const disabled = this.disabled;

        if (disabled.has(previewName)) this.#changed = true;

        disabled.add(previewName);

        this.#row.disabled = Array.from(disabled).join(",");

        return this;
    }

    /**
     * Enable a preview provider.
     */
    enable(previewName) {
        const disabled = this.disabled;

        if (disabled.has(previewName)) this.#changed = true;

        disabled.delete(previewName);

        this.#row[2] = Array.from(disabled).join(",");

        return this;
    }

    get preferredStyle() {
        return this.#row.preferredStyle ?? "full";
    }

    set preferredStyle(value) {
        if (value != "full" && value != "compact") throw new TypeError("Prefered style must be 'full' or 'compact'");

        this.#changed = true;
        this.#row.preferredStyle = value;
    }

    /**
     * @returns {Promise<Settings>} 
     */
    static async forGuild(db, id) {
        if (Settings.instances.has(id)) return Settings.instances.get(id);

        let row = await new Promise((res, rej) => db.get("SELECT * FROM settings WHERE guild = (?)", [id], (err, row) => {
            if (err) rej(err);
            res(row);
        }));

        if (!row) {
            await new Promise((res, rej) => db.run("INSERT INTO settings VALUES (?, ?, ?)", [id, null, null], (err) => {
                if (err) rej(err);
                res();
            }));

            row = await new Promise((res, rej) => db.get("SELECT * FROM settings WHERE guild = (?)", [id], (err, row) => {
                if (err) rej(err);
                res(row);
            }));
        }

        const settings = new Settings(db, row);
        Settings.instances.set(id, settings);
        return settings;
    }


    static async init(db) {
        return new Promise((res, rej) => db.run("CREATE TABLE IF NOT EXISTS settings (guild TEXT UNIQUE NOT NULL, disabled TEXT, preferredStyle TEXT)", (err) => {
            if (err) rej(err);
            res();
        }));
    }
}

function getSettingsCommand(client) {
    /**
     * @type {string[]}
     */
    const previewNames = client.previews.map(preview => preview.name);
    
    return new SlashCommandBuilder()
        .setName("settings")
        .setDescription("View or modify your settings.")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(view => view
            .setName("view")
            .setDescription("View your settings.")
        )
        .addSubcommand(disable => disable
            .setName("disable")
            .setDescription("Disable a preview provider.")
            .addStringOption(option => option
                .setName("provider")
                .setDescription("The provider to disable.")
                .setChoices(...previewNames.map(name => ({ name, value: name })))
                .setRequired(true)
            )
        )
        .addSubcommand(enable => enable
            .setName("enable")
            .setDescription("Enable a preview provider.")
            .addStringOption(option => option
                .setName("provider")
                .setDescription("The provider to enable.")
                .setChoices(...previewNames.map(name => ({ name, value: name })))
                .setRequired(true)
            )
        )
        .addSubcommand(style => style
            .setName("style")
            .setDescription("Set the preferred preview style.")
            .addStringOption(option => option
                .setName("style")
                .setDescription("The preferred preview style.")
                .setChoices({ name: "Full", value: "full" }, { name: "Compact", value: "compact" })
                .setRequired(true)
            )
        );
}

async function settingsHandler(interaction) {
    if (!interaction.inGuild()) throw new Error("Must be in a server to use this command.");

    const subcommand = interaction.options.getSubcommand();

    const settings = await Settings.forGuild(client.db, interaction.guildId);
    switch (subcommand) {
        case "view": {
            const disabled = settings.disabled;
            const enabled = interaction.client.previews.filter(preview => !disabled.has(preview.name)).map(preview => preview.name);
            const style = settings.preferredStyle;
            
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: interaction.guild.name,
                    iconURL: interaction.guild.iconURL(),
                })
                .setTitle("Settings")
                .addFields(
                    { name: "Disabled", value: disabled.size ? Array.from(disabled).join(", ") : "None", inline: true },
                    { name: "Enabled", value: enabled.length ? Array.from(enabled).join(", ") : "None", inline: true },
                    { name: "Preferred style", value: style, inline: false },
                )
                .setColor(Colors.Aqua);

            return interaction.reply({ embeds: [embed] }); 
        }

        case "disable": {
            const provider = interaction.options.getString("provider");
            settings.disable(provider);
            await settings.save();
            return interaction.reply({ embeds: [
                new EmbedBuilder()
                    .setDescription(`Disabled ${provider}.`)
                    .setColor(Colors.Green)
            ]});
        }

        case "enable": {
            const provider = interaction.options.getString("provider");
            settings.enable(provider);
            await settings.save();
            return interaction.reply({ embeds: [
                new EmbedBuilder()
                    .setDescription(`Enabled ${provider}.`)
                    .setColor(Colors.Green)
            ]});
        }

        case "style": {
            const style = interaction.options.getString("style");
            settings.preferredStyle = style;
            await settings.save();
            return interaction.reply({ embeds: [
                new EmbedBuilder()
                    .setDescription(`Set preferred style to ${style}.`)
                    .setColor(Colors.Green)
            ]});
        }
    }
}

module.exports = { Settings, getSettingsCommand, settingsHandler };