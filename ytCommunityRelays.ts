import { scrapePosts, type Post } from "./scrapeYt.ts";
import { ComponentType, ButtonStyle, Events, MessageFlags, TextChannel, WebhookClient } from "discord.js";
import type { Webhook } from "discord.js";
import client from "./client.ts";
import { dataContent, saveData } from "./dataMsg.ts";

const handleYTPost = async (post: Post, webhook: Webhook | WebhookClient, subtext: string | null, shouldUseDot: boolean) => {
	console.log(post.postId);
	const multiImage = [];
	if (post.attachment.multiImage) {
		for (const image of post.attachment.multiImage) {
			multiImage.push({
				attachment: Buffer.from(await (await fetch(image.at(-1)!.url)).arrayBuffer()),
				name: post.postId + ".png"
			})
		}
	}
	const embed = post.attachment.poll ? [
		{
			title: "Poll",
			description: post.attachment.poll.choices.join("\n"),
			footer: {
				text: post.attachment.poll.pollType + " \u2022 " + post.attachment.poll.totalVotes
			}
		}
	] : (post.attachment.video ? [
		{
			title: post.attachment.video.title,
			description: post.attachment.video.descriptionSnippet,
			author: post.attachment.video.owner.name ? {
				name: post.attachment.video.owner.name,
				icon_url: post.attachment.video.owner.thumbnails?.at(-1)?.url,
				url: "https://youtube.com" + post.attachment.video.owner.url
			} : undefined,
			footer: post.attachment.video.publishedTimeText ? {
				text: post.attachment.video.lengthText.long + " \u2022 " + post.attachment.video.viewCountText + " \u2022 " + post.attachment.video.publishedTimeText
			} : undefined,
			url: post.attachment.video.videoId ? "https://www.youtube.com/watch?v=" + post.attachment.video.videoId : undefined
		}
	] : (post.attachment.quiz ? [
		{
			title: "Quiz",
			fields: post.attachment.quiz.choices.map(choice => ({
				name: (choice.isCorrect ? "\u2705" : "\u274C") + " " + choice.text,
				value: choice.explanation
			})),
			footer: {
				text: post.attachment.quiz.quizType + " \u2022 " + post.attachment.quiz.totalVotes + " \u2022 " + (post.attachment.quiz.disableChangingQuizAnswer ? "Changing quiz answer disabled" : "Changing quiz answer enabled") + " \u2022 " + (post.attachment.quiz.enableAnimation ? "Animated" : "Not animated")
			}
		}
	] : []))
	const parsePostContent = (postContent: {
		text: string,
		url?: string,
		webPageType?: string
	}[]) => postContent.map(content => content.url ? (content.url === content.text ? content.url : `[${content.text}](https://youtube.com${content.url})`) : content.text).join("")
	let contents = "";
	if (post.content) {
		for (const content of post.content) {
			const toAdd = content.url ? (content.url === content.text ? content.url : `[${content.text}](https://youtube.com${content.url})`) : content.text;
			if (toAdd.length + (subtext?.length ?? 0) > 1990) {
				let lasti = 0;
				for (let i = 0; i < toAdd.length - 1001; i += 1000) {
					await webhook.send({
						content: toAdd.slice(i, i + 1000),
						username: post.author.name,
						avatarURL: "https:" + post.author.thumbnails.at(-1)?.url,
					})
					lasti = i;
				}
				contents = toAdd.slice(lasti + 1000, lasti + 2000)
			} else if (contents.length + toAdd.length + (subtext?.length ?? 0) > 1990) {
				await webhook.send({
					content: contents,
					username: post.author.name,
					avatarURL: "https:" + post.author.thumbnails.at(-1)?.url,
				})
				contents = "";
			};
			if (toAdd.length + (subtext?.length ?? 0) <= 1990) contents += toAdd;
		}
	}
	await webhook.send({
		content: contents + (subtext ? "\n-# " + subtext : ""),
		files: post.attachment.image ? [
			{
				attachment: Buffer.from(await (await fetch(post.attachment.image.at(-1)!.url)).arrayBuffer()),
				name: post.postId + ".png"
			}
		] : multiImage,
		embeds: post.sharedPost ? [...embed, {
			title: "Shared Post",
			description: parsePostContent(post.sharedPost.content).slice(0, 4096),
			author: {
				icon_url: "https:" + post.sharedPost.author.thumbnails.at(-1)!.url,
				name: post.sharedPost.author.name,
				url: "https://youtube.com" + post.sharedPost.author.url
			},
			image: post.sharedPost.attachment.image ? {
				url: post.sharedPost.attachment.image.at(-1)!.url
			} : (post.sharedPost.attachment.multiImage ? {
				url: post.sharedPost.attachment.multiImage[0]!.at(-1)!.url
			} : undefined),
			fields: post.sharedPost.attachment.multiImage ? [
				{
					name: "Images",
					value: post.sharedPost.attachment.multiImage.map(image => image.at(-1)!.url).join("\n\n")
				}
			] : undefined,
			url: "https://www.youtube.com/post/" + post.sharedPost.postId
		}] : embed,
		username: post.author.name + (shouldUseDot ? " ." : ""),
		avatarURL: "https:" + post.author.thumbnails.at(-1)?.url,
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.Button,
						style: ButtonStyle.Link,
						url: "https://www.youtube.com/post/" + post.postId,
						label: "Original Post"
					}
				]
			}
		]
	})
}
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "create_yt_community_relay") return;
	await interaction.deferReply({
		flags: MessageFlags.Ephemeral
	});
	if (!interaction.options.getString("channel_id") && !interaction.options.getString("username")) {
		return await interaction.followUp("Please provide either the channel ID or the username.")
	}
	if (interaction.options.getString("channel_id") && interaction.options.getString("username")) {
		return await interaction.followUp("Do not provide both the channel ID and the username.")
	}
	let channelId: string | null | undefined = null;
	if (interaction.options.getString("username")) {
		try {
			channelId = (await (await fetch("https://www.youtube.com/@" + interaction.options.getString("username"))).text()).match(/<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(.+?)">/)![1]
		} catch (e) {
			return await interaction.followUp("Failed to fetch channel ID. Is the username correct?")
		}
	} else {
		channelId = interaction.options.getString("channel_id")!;
	}
	if (!channelId) return await interaction.followUp("Channel not found. Is the username or id correct?")
	let posts = null;
	try {
		posts = await scrapePosts(channelId);
	} catch (e) {
		console.error(e);
		return await interaction.followUp("Failed to fetch community posts. Are you sure the channel ID is correct? Please note that a channel ID is different than a username.")
	}
	const webhook = await (interaction.channel as TextChannel).createWebhook({
		"name": "YT Community Relaying",
		"reason": "Relay YT community posts"
	});
	posts.posts.reverse();
	await interaction.followUp("Starting...")
	const subtext = interaction.options.getString("subtext");
	let shouldUseDot = false;
	for (const post of posts.posts) {
		await handleYTPost(post, webhook, subtext, shouldUseDot);
		shouldUseDot = !shouldUseDot;
	}
	dataContent.ytCommunityRelays.push({
		postId: posts.posts.at(-1)!.postId,
		channel: channelId,
		subtext,
		webhookUrl: webhook.url,
		webhookChannel: interaction.channelId
	})
	await saveData();
	await interaction.followUp({
		content: "Finished!",
		flags: MessageFlags.Ephemeral
	})
})
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "list_yt_community_relays") return;
	await interaction.deferReply();
	const result = [];
	for (const relay of dataContent.ytCommunityRelays) {
		if ((await client.channels.fetch(relay.webhookChannel) as TextChannel)?.guildId === interaction.guildId) result.push(relay);
	}
	await interaction.followUp(result.map(relay => `<#${relay.webhookChannel}>`).join("\n"))
});
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "remove_yt_community_relay") return;
	await interaction.deferReply();
	dataContent.ytCommunityRelays.splice(dataContent.ytCommunityRelays.findIndex((relay: any) => relay.webhookChannel === interaction.channelId), 1);
	await saveData();
	await interaction.followUp("Removed.")
});
const fetchNewPosts = async () => {
	for (const relay of dataContent.ytCommunityRelays) {
		const posts = await scrapePosts(relay.channel, true);
		const previousLast = relay.postId;
		const newPosts = [];
		for (const post of posts.posts) {
			if (post.postId === previousLast) break;
			newPosts.push(post);
		}
		newPosts.reverse();
		console.log(newPosts.length)
		if (newPosts.length === 0) continue;
			const webhook = new WebhookClient({ url: relay.webhookUrl });
			let shouldUseDot = false;
			for (const post of newPosts) {
			try {
				await handleYTPost(post, webhook, relay.subtext, shouldUseDot);
			} catch (e) {
				try {
					await webhook.send("Error on post " + post.postId)
				} catch (e) {
					console.error(e);
				}
			}
			shouldUseDot = !shouldUseDot;
		}
		relay.postId = posts.posts[0]?.postId;
		await saveData();
	}
}
fetchNewPosts();
setInterval(fetchNewPosts, 5 * 60 * 1000)
console.log(dataContent.ytCommunityRelays)
