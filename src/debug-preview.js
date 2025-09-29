import { EmbedBuilder, User } from "discord.js";

// TODO: there should be a way to trigger this specific preview in production for the owner only.
class DebugPreview {
    name = "debug";
    reportErrors = true;

    constructor(previews) {
        this.previews = previews;
    }

    async generate(line) {
        const [,command,options] = line.split(":");
        if (command === "error") {
            throw new Error("This is a test error for debugging purposes!");
        }

        if (command === "hello") {
            return {
                message: {
                    content: "Hello! This is a debug preview.",
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Lorem Ipsum")
                            .setDescription("Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.")
                    ]
                }
            }
        }

        if (command === "info") {
            /**
             * @type {import("discord.js").Client}
             */
            const client = this.previews.client;

            const embed = new EmbedBuilder()
                .setColor("Blue")
                .setTitle("Debug Info");

            const generatorList = this.previews.previewProviders.map(group => `- **${group.name}**\n${group.generators.map(generator => `  - ${generator.name}`).join("\n")}`).join("\n");

            const debugGuild = process.env.DEBUG_GUILD_ID ? (await client.guilds.fetch(process.env.DEBUG_GUILD_ID)).name : "Not Set"

            const guilds = client.application.approximateGuildCount;
            const users = client.application.approximateUserInstallCount;
            const owner = client.application.owner;

            const packageJson = require("../package.json");
            embed.setFooter({ text: `Bot Version: ${packageJson.version}` });

            embed.addFields(
                { name: "Available Preview Generators", value: generatorList, inline: false },
                { name: "Owner", value: `${owner instanceof User ? `${owner}` : owner?.name ?? "Not set"}`, inline: true },
                { name: "Debug Guild", value: debugGuild, inline: true },
                { name: "Installed", value: `In ${guilds ?? 0} guilds, by ${users ?? 0} users.`, inline: false }
            );

            return {
                message: {
                    embeds: [embed],
                }
            }
        }

        if (command === "health") {
            const results = new Map();

            const filter = options?.trim().split(",").map(s => s.trim()).filter(s => s.length > 0);
            for (const group of this.previews.previewProviders) {
                for (const generator of group.generators) {
                    if (filter?.length > 0 && !filter.includes(generator.name)) continue;
                    if (typeof generator.healthCheck !== "function") continue;

                    const healthy = await generator.healthCheck().catch(err => {
                        console.error(`Health check for ${generator.name} failed:`, err);
                        return false;
                    });

                    results.set(generator.name, healthy);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle("Health Check Results")
                .setColor("Green")
                .setDescription(Array.from(results.entries()).map(([name, healthy]) => {
                    if (healthy) return `✅ **${name}**`;
                    return `❌ **${name}**`;
                }).join("\n"));

            return {
                message: {
                    embeds: [embed],
                }
            }
        }
    }
}

export class DebugPreviewGroup {
    name = "debug";

    constructor(previews) {
        this.previews = previews;

        this.generators = [new DebugPreview(previews)];
    }

    match(content) {
        return content.split("\n")
            .filter(line => line.startsWith("debug:"))
    }
}