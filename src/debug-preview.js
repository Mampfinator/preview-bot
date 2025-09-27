const { EmbedBuilder } = require("discord.js");

class DebugPreview {
    name = "debug";
    reportErrors = true;

    async generate(line) {
        const [,command] = line.split(":");
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
    }
}

const DebugPreviewGroup = {
    name: "debug",
    match(content) {
        return content.split("\n")
            .filter(line => line.startsWith("debug:"))
    },
    generators: [
        new DebugPreview()
    ]
}

module.exports = {
    DebugPreviewGroup,
}