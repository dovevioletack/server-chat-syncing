import { Events, WebhookClient, Message, PermissionsBitField, GuildPremiumTier } from "discord.js";
import type { WebhookMessageCreateOptions, MessageSnapshot, Embed, APIEmbed, TextChannel, WebhookMessageEditOptions, Attachment, Guild } from "discord.js"
import JSONdb from 'simple-json-db';
import path from "path"
import { fileURLToPath } from 'url';

import { dataContent, saveData } from "./dataMsg.ts"

const dirname = path.dirname(fileURLToPath(import.meta.url));

import client from "./client.ts"

const messageMap = new JSONdb("./map.json")
let savingChannels: string[] = []
export let savingServers: string[] = []
const queuedMessages: Record<string, Message[]> = {}
export const queuedServerSaveMessages: Record<string, Message[]> = {}

await saveData()

interface DataMessage extends Omit<MessageSnapshot, "embeds"> {
    embeds: (Embed | APIEmbed)[]
}
interface DataWebhookMessage extends Omit<WebhookMessageCreateOptions, "embeds"> {
    embeds: (Embed | APIEmbed)[]
}

const defaultUploadLimit = 10

const getUploadLimitForGuild = (guild: Guild | null) => {
    if (!guild) return defaultUploadLimit;
    switch (guild.premiumTier) {
        case GuildPremiumTier.Tier3: return 100;
        case GuildPremiumTier.Tier2: return 50;
        default: return defaultUploadLimit;
    };
};

export const appendCappedSuffix = (username: string, suffix: string) => suffix.length < 75 ? username.split("").slice(0, 80 - suffix.length).join("") + suffix : username.split("").slice(0, 40).join("") + suffix.split("").slice(0, 40).join("")
export const createDataToSend = async (message: DataMessage | Message): Promise<DataWebhookMessage> => {
    try {
        if (message.flags.any(16384) && message.messageSnapshots) {
            console.log("Forwarded message found!")
            const messageSnapshot = [...message.messageSnapshots.values()][0]!
            return await createDataToSend({
                ...messageSnapshot,
                "author": message.author,
                "embeds": [...messageSnapshot.embeds, {
                    "title": "Forwarded message",
                    "description": "This message was originally a forwarded message.",
                    "author": {
                        "name": "Jump to original message",
                        "url": "https://discord.com/channels/" + (message.reference?.guildId ?? "@me") + "/" + message.reference?.channelId + "/" + message.reference?.messageId
                    },
                    "footer": {
                        "text": message.content
                    }
                }]
            })
        }
        const attachments: Attachment[] = [];
        let skippedAttachment = false;
        for (const attachment of message.attachments.values()) {
            if (attachment.size < getUploadLimitForGuild(message.guild) * 1e+6) {
                attachments.push(attachment)
            } else {
                skippedAttachment = true;
            }
        }
        let dataToSend: DataWebhookMessage = {
            "content": message.content,
            "embeds": message.embeds,
            "allowedMentions": {
                "parse": [],
                "users": [],
                "roles": []
            },
            "files": [...attachments, ...message.stickers.mapValues(sticker => sticker.url).values()],
            "avatarURL": message.author?.avatarURL() ?? undefined
        }
        if (message.content === "" && message.attachments.size === 0 && message.embeds.length === 0 && message.stickers.size === 0 && !message.poll) {
            dataToSend.embeds.push({
                "title": "Notice",
                "description": "This was originally an empty message."
            })
            return dataToSend;
        }
        if (skippedAttachment) {
            dataToSend.embeds.push({
                "title": "Notice",
                "description": "A large file was skipped."
            })
        }
        if (message.poll) {
            console.log("Poll")
            dataToSend.embeds.push({
                "title": "Poll",
                "author": {
                    "name": message.poll.question.text
                },
                "description": [...message.poll.answers.values()].map(answer => (answer.emoji ? answer.emoji + " " : "") + answer.text).join("\n"),
                "footer": {
                    "text": message.poll.allowMultiselect ? "Multiple choice" : "Single choice"
                },
                "timestamp": message.poll.expiresAt.toISOString()
            })
            console.log(dataToSend)
        }
        if (message.type === 46) {
            if (!message.channel || !message.reference || !message.reference.messageId) {
                dataToSend.embeds.push({
                    "title": "Error",
                    "description": "Reference not found."
                })
                return dataToSend;
            }
            try {
                const pollMessage = await message.channel.messages.fetch(message.reference.messageId)
                if (!pollMessage.poll) {
                    dataToSend.embeds.push({
                        "title": "Error",
                        "description": "Poll not found."
                    })
                    return dataToSend;
                }
                dataToSend.embeds.push({
                    "title": "Poll",
                    "author": {
                        "name": pollMessage.poll.question.text
                    },
                    "fields": [...pollMessage.poll.answers.values()].map(answer => ({
                        "name": (answer.emoji ? answer.emoji + " " : "") + answer.text,
                        "value": answer.voteCount + ""
                    })),
                    "footer": {
                        "text": pollMessage.poll.allowMultiselect ? "Multiple choice" : "Single choice"
                    },
                    "timestamp": pollMessage.poll.expiresAt.toISOString()
                })
            } catch (e) {
                console.error(e)
            }
        }
        if (typeof dataToSend?.content === "string" && dataToSend?.content.length > 2000) {
            dataToSend.embeds.push({
                "title": "Message",
                "description": dataToSend.content
            })
            dataToSend.content = ""
        }
        return dataToSend
    } catch (e) {
        console.error("An error ocurred while creating data. Trying again.")
        console.error(e)
        try {
            return await createDataToSend(message);
        } catch (e) {
            console.error("Failed to create data.")
            return {
                "content": message.content,
                "embeds": [...message.embeds, {
                    "title": "Internal error",
                    "description": "An internal error occurred while processing this message."
                }],
                "allowedMentions": {
                    "parse": [],
                    "users": [],
                    "roles": []
                },
                "files": [...message.attachments.values(), ...message.stickers.mapValues(sticker => sticker.url).values()],
                "avatarURL": message.author?.avatarURL() ?? undefined
            }
        }
    }
}

interface RelayItem {
    name: string,
    webhook: string,
    channel: string
}

const attemptSend = async (webhookClient: WebhookClient, message: Message, dataToSend: DataWebhookMessage, name: string) => {
    const sendMessage = async () => await webhookClient.send({ ...dataToSend, "username": (appendCappedSuffix(message.author.displayName ?? "Unknown User", " - " + name)) });
    try {
        return await sendMessage();
    } catch (e) {
        console.error("An error occured while sending a message.")
        console.error(e)
        try {
            return await sendMessage();
        } catch (e) {
            console.error("Another error occurred. Stripping files.");
            console.error(e)
            try {
                return await webhookClient.send({ ...dataToSend, "files": [], "username": (appendCappedSuffix(message.author.displayName ?? "Unknown User", " - " + name)) })
            } catch (e) {
                console.error("Failed to send message.")
                try {
                    return await webhookClient.send({ "embeds": [{ "title": "Internal error", "description": "Could not send message." }], "username": (appendCappedSuffix(message.author.displayName ?? "Unknown User", " - " + name)) })
                } catch (e) {
                    return null;
                }
            }
        }
    }
}
export const relayMessage = async (message: Message) => {
    if (message.content === "" && message.attachments.size === 0 && message.embeds.length === 0 && message.stickers.size === 0 && !message.poll && !message.flags.any(16384)) return
    const dataToSend = await createDataToSend(message)
    for (const [id, group] of Object.entries(dataContent.linkedGroups as Record<string, RelayItem[]>)) {
        const current = group.find(webhook => webhook.channel === message.channel.id)
        if (!current) continue
        if (message.webhookId === current.webhook.split("/")[5]) return
        const currMap: Record<string, string> = {}
        for (const channelData of group) {
            if (channelData.channel === current.channel) continue
            const webhookClient = new WebhookClient({ url: channelData.webhook });
            const attempted = await attemptSend(webhookClient, message, dataToSend, current.name)
            if (!attempted) {
                group.splice(group.indexOf(channelData), 1);
                console.error("Self-destructing channel.")
                for (const channelData of group) {
                    try {
                        const subwebhookClient = new WebhookClient({ url: channelData.webhook });
                        await subwebhookClient.send(`Self-destructing <#${channelData.channel}> with name ${current.name}`)
                    } catch (e) {
                    }
                }
                await saveData();
                continue;
            }
            currMap[channelData.channel] = attempted.id
        }
        currMap.group = id
        messageMap.set(message.id, currMap)
        dataContent.lastHandledMessage[message.channel.id] = message.id;
        await saveData();
    }
}
client.on(Events.MessageCreate, (message) => {
    if (savingChannels.includes(message.channel.id)) {
        if (!(message.channel.id in queuedMessages)) queuedMessages[message.channel.id] = []
        queuedMessages[message.channel.id]?.push(message)
        return
    }
    relayMessage(message)
})

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (newMessage.content === "" && newMessage.attachments.size === 0 && newMessage.stickers.size === 0) return
    const cached = messageMap.get(newMessage.id)
    if (!cached) return
    console.log(cached)
    const group = dataContent.linkedGroups[cached.group]
    for (const channelData of group) {
        const messageID = cached[channelData.channel]
        if (!messageID) continue;
        const webhookClient = new WebhookClient({ url: channelData.webhook });
        await webhookClient.editMessage(messageID, await createDataToSend(newMessage) as WebhookMessageEditOptions)
    }
})
client.on(Events.MessageDelete, async message => {
    if (message.content === "" && message.attachments.size === 0 && message.stickers.size === 0) return
    const cached = messageMap.get(message.id)
    if (!cached) return
    console.log(cached)
    const group = dataContent.linkedGroups[cached.group]
    for (const channelData of group) {
        const messageID = cached[channelData.channel]
        if (!messageID) continue;
        const webhookClient = new WebhookClient({ url: channelData.webhook });
        await webhookClient.deleteMessage(messageID)
    }
})

for (const group of Object.values(dataContent.linkedGroups) as RelayItem[][]) {
    for (const webhookData of group) {
        if (dataContent.lastHandledMessage[webhookData.channel]) {
            savingChannels.push(webhookData.channel)
        }
    }
}
const catchUpWithMessages = async (group: RelayItem[]) => {
    for (const webhookData of group) {
        if (dataContent.lastHandledMessage[webhookData.channel]) {
            console.log("LHM found for " + webhookData.name + "(" + Object.entries(dataContent.linkedGroups).find(data => data[1] === group)?.[0] + ")")
            try {
                const channel = await client.channels.fetch(webhookData.channel)
                if (!channel || !("messages" in channel)) continue;
                let messages = [...(await channel.messages.fetch({ limit: 100, after: dataContent.lastHandledMessage[webhookData.channel] })).sort((a, b) => b.createdTimestamp - a.createdTimestamp).values()].reverse()
                if (messages.length === 0) {
                    savingChannels.splice(savingChannels.indexOf(webhookData.channel), 1)
                    continue
                }
                console.log("Message found!")
                while (1) {
                    const fetched = [...(await channel.messages.fetch({ limit: 100, after: messages.at(-1)?.id })).sort((a, b) => b.createdTimestamp - a.createdTimestamp).values()].reverse()
                    if (fetched.length === 0) break
                    messages.push(...fetched)
                }
                console.log("Relaying messages...")
                for (const message of messages) {
                    //console.log(webhookData.name + ": " + message.id);
                    await relayMessage(message);
                }
                savingChannels.splice(savingChannels.indexOf(webhookData.channel), 1)
                if (webhookData.channel in queuedMessages) {
                    for (const message of queuedMessages[webhookData.channel]!) {
                        relayMessage(message)
                    }
                }
            } catch (e) {
                console.error(e)
                try {
                    await client.channels.fetch(webhookData.channel)
                } catch (e) {
                    console.error(e)
                    group.splice(group.indexOf(webhookData), 1);
                    console.error("Self-destructing channel.")
                    for (const channelData of group) {
                        try {
                            const subwebhookClient = new WebhookClient({ url: channelData.webhook });
                            await subwebhookClient.send(`Self-destructing <#${channelData.channel}> with name ${webhookData.name}`)
                        } catch (e) {
                        }
                    }
                    await saveData();
                }
            }
        }
    }
}
for (const group of Object.values(dataContent.linkedGroups) as RelayItem[][]) {
    catchUpWithMessages(group)
}

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "create_group") return;
    await interaction.deferReply();
    if (interaction.options.getString("id")! in dataContent.linkedGroups) return await interaction.reply("Group of id already exists.")
    const webhook = await (interaction.channel as TextChannel).createWebhook({
        "name": "Message Linking",
        "reason": "Command ran to link channel."
    })
    dataContent.linkedGroups[interaction.options.getString("id")!] = [
        {
            "name": interaction.options.get("name")?.value ?? interaction.guild!.id,
            "webhook": webhook.url,
            "channel": interaction.channel!.id
        }
    ]
    await saveData()
    await interaction.followUp("Group created. Channel linked to group.")
})
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "link_channel") return;
    await interaction.deferReply();
    if (!dataContent.linkedGroups[interaction.options.getString("group_id")!]) await interaction.followUp("Group does not exist!");
    let hasPerms = false
    for (const data of dataContent.linkedGroups[interaction.options.getString("group_id")!]) {
        const channel = await client.channels.fetch(data.channel) as TextChannel
        if (!channel) continue;
        if (channel.permissionsFor(await channel.guild.members.fetch(interaction.user))?.has(PermissionsBitField.Flags.ManageWebhooks)) hasPerms = true
    }
    if (dataContent.linkedGroups[interaction.options.getString("group_id")!].length === 0) hasPerms = true
    if (!hasPerms) return await interaction.followUp("You need the Manage Webhooks permission in any of the channels.")
    let replacedGroup = false
    for (const group of Object.values(dataContent.linkedGroups) as RelayItem[][]) {
        const index = group.findIndex(channel => channel.channel === interaction.channel!.id)
        if (index === -1) continue
        group.splice(index, 1)
        replacedGroup = true
    }
    const webhook = await (interaction.channel as TextChannel).createWebhook({
        "name": "Message Linking",
        "reason": "Command ran to link channel."
    })
    dataContent.linkedGroups[interaction.options.getString("group_id")!].push({
        "name": interaction.options.get("name")?.value ?? interaction.guild!.id,
        "webhook": webhook.url,
        "channel": interaction.channel!.id
    })
    await saveData()
    await interaction.followUp(replacedGroup ? "Link replaced." : "Channel linked.")
})
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "unlink_channel") return;
    const channelId = interaction.options.get("channel")?.value ?? interaction.channel!.id
    await interaction.deferReply();
    let removedGroup = false
    for (const group of Object.values(dataContent.linkedGroups) as RelayItem[][]) {
        const index = group.findIndex(channel => channel.channel === channelId)
        if (index === -1) continue
        if (!group.find(channel => channel.channel === interaction.channel!.id)) return await interaction.followUp("Channel in wrong group.")
        try {
            const webhookClient = new WebhookClient({ url: group[index]!.webhook });
            await webhookClient.delete("Channel unlinked.")
        } catch (e) {
            console.error(e)
        }
        group.splice(index, 1)
        removedGroup = true
    }
    await saveData()
    await interaction.followUp(removedGroup ? "Link removed." : "No link found.")
})
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "linked_channels") return;
    await interaction.deferReply();
    for (const [id, group] of Object.entries(dataContent.linkedGroups as Record<string, RelayItem[]>)) {
        const index = group.findIndex(channel => channel.channel === interaction.channel!.id)
        if (index === -1) continue
        return await interaction.followUp(id + "\n" + group.map(data => `<#${data.channel}> (${data.name})`).join("\n"))
    }
    await interaction.followUp("No link found.")
})
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "delete_group") return;
    await interaction.deferReply();
    const id = interaction.options.getString("id")!
    if (dataContent.linkedGroups[id].length > 0) return await interaction.followUp("Group has to be empty.")
    delete dataContent.linkedGroups[id]
    await saveData()
    await interaction.followUp("Group deleted.")
})
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "archive_link") return;
    await interaction.deferReply();
    const sourceChannel = await client.channels.fetch(interaction.options.getString("source_channel")!) as TextChannel
    if (!sourceChannel) return await interaction.followUp("Channel not found.")
    if (!(sourceChannel).permissionsFor(await sourceChannel.guild.members.fetch(interaction.user)).has(PermissionsBitField.Flags.ManageWebhooks)) return await interaction.followUp("You need the Manage Webhooks permission in the source channel.")
    let messages = [...(await sourceChannel.messages.fetch({ "limit": 100 })).sort((a, b) => b.createdTimestamp - a.createdTimestamp).values()].reverse()
    if (messages.length === 0) return await interaction.followUp("No messages found.")
    while (1) {
        const fetched = [...(await sourceChannel.messages.fetch({ "limit": 100, "before": messages[0]?.id })).sort((a, b) => b.createdTimestamp - a.createdTimestamp).values()].reverse()
        if (fetched.length === 0) break
        messages.unshift(...fetched)
    }
    const destinationWebhook = await (interaction.channel as TextChannel).createWebhook({
        "name": "Message Linking",
        "reason": "Command ran to link channel."
    })
    const sourceWebhook = await sourceChannel.createWebhook({
        "name": "Message Linking",
        "reason": "Command ran to link channel."
    })
    dataContent.linkedGroups[interaction.options.getString("group_id")!] = [
        {
            "name": interaction.options.get("destination_name")?.value ?? interaction.guild!.id,
            "webhook": destinationWebhook.url,
            "channel": interaction.channel!.id
        },
        {
            "name": interaction.options.get("source_name")?.value ?? sourceChannel.guild.id,
            "webhook": sourceWebhook.url,
            "channel": sourceChannel.id
        }
    ]
    await saveData()
    await interaction.followUp("Group created.")
    for (const message of messages) {
        await relayMessage(message);
    }
    await interaction.followUp("Messages relayed.")
})
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "clear_channel_group_queue") return;
    await interaction.deferReply();
    for (const [id, group] of Object.entries(dataContent.linkedGroups as Record<string, RelayItem[]>)) {
        const index = group.findIndex(channel => channel.channel === interaction.channel!.id)
        if (index === -1) continue
        for (const channel of group) {
            const channelData = await client.channels.fetch(channel.channel) as TextChannel;
            dataContent.lastHandledMessage[channel.channel] = await channelData.messages.fetch({
                limit: 1
            })
        }
        await saveData();
        await interaction.followUp("Cleared queue.")
        process.abort();
        return;
    }
    await interaction.followUp("No link found.")
})
