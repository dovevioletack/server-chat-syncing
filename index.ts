import { SlashCommandBuilder, SlashCommandBooleanOption, PermissionsBitField, SlashCommandStringOption, SlashCommandIntegerOption, SlashCommandChannelOption, Routes } from "discord.js";
import client from "./client.ts";
import { dataContent, saveData } from "./dataMsg.ts";
import "./syncing.ts";
import "./ytCommunityRelays.ts";

const commands = [
	new SlashCommandBuilder()
	.setName("perpetual_incident_actions")
	.setDescription("Enabling incident actions forever.")
	.addBooleanOption(
		new SlashCommandBooleanOption()
		.setName("disable_invites")
		.setDescription("Should disable invites?")
	)
	.addBooleanOption(
		new SlashCommandBooleanOption()
		.setName("disable_dms")
		.setDescription("Should disable DMs?")
	)
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
	new SlashCommandBuilder()
	.setName("create_group")
	.setDescription("Create a linked group.")
	.addStringOption(
		new SlashCommandStringOption()
		.setName("id")
		.setDescription("ID of the group to create.")
    .setRequired(true)
	)
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
	new SlashCommandBuilder()
	.setName("link_channel")
	.setDescription("Add the channel to a linked group.")
	.addStringOption(
		new SlashCommandStringOption()
		.setName("group_id")
		.setDescription("ID of the group to add to.")
    .setRequired(true)
  )
  .addStringOption(
		new SlashCommandStringOption()
		.setName("name")
		.setDescription("Name to be appended to member names when relaying.")
	)
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
	new SlashCommandBuilder()
	.setName("unlink_channel")
	.setDescription("Removes the channel from a linked group.")
  .addStringOption(
		new SlashCommandStringOption()
		.setName("channel")
		.setDescription("Channel (id) to be removed.")
	)
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
	new SlashCommandBuilder()
	.setName("linked_channels")
	.setDescription("Lists the channels in the group.")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
	new SlashCommandBuilder()
	.setName("delete_group")
	.setDescription("Deletes a linked group. Group has to be empty.")
	.addStringOption(
		new SlashCommandStringOption()
		.setName("id")
		.setDescription("ID of the group to create.")
    .setRequired(true)
	),
	new SlashCommandBuilder()
	.setName("archive_link")
	.setDescription("Archive the channel and creates a linked group. (run on destination)")
	.addStringOption(
		new SlashCommandStringOption()
		.setName("group_id")
		.setDescription("ID of the group to create.")
    .setRequired(true)
  )
  .addStringOption(
		new SlashCommandStringOption()
		.setName("source_channel")
		.setDescription("Channel (id) to be sourced from.")
	)
  .addStringOption(
		new SlashCommandStringOption()
		.setName("source_name")
		.setDescription("Name to be appended to member names when relaying.")
	)
  .addStringOption(
		new SlashCommandStringOption()
		.setName("destination_name")
		.setDescription("Name to be appended to member names when relaying.")
	)
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
	new SlashCommandBuilder()
	.setName("server_save")
	.setDescription("Puts all the messages from a server toa channel. (run on destination)")
	.addStringOption(
		new SlashCommandStringOption()
		.setName("save_id")
		.setDescription("ID of the group to create.")
		.setRequired(true)
	)
	.addIntegerOption(
		new SlashCommandIntegerOption()
		.setName("additional_webhooks")
		.setDescription("Number of additional webhooks to create.")
		.setMaxValue(9)
	)
  .addStringOption(
		new SlashCommandStringOption()
		.setName("source_guild")
		.setDescription("Server (id) to be sourced from.")
	)
  .addStringOption(
		new SlashCommandStringOption()
		.setName("source_name")
		.setDescription("Name to be appended to member names when relaying.")
	)
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
	new SlashCommandBuilder()
	.setName("delete_server_save")
	.setDescription("Deletes all server saves in channel.")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
  new SlashCommandBuilder()
  .setName("change_topic")
  .setDescription("Change the topic of a channel.")
  .addChannelOption(
	  new SlashCommandChannelOption()
	  .setName("channel")
	  .setDescription("The channel to change.")
  )
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  new SlashCommandBuilder()
  .setName("clear_channel_group_queue")
  .setDescription("Clears the message queue for the current channel group.")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
  new SlashCommandBuilder()
  .setName("create_yt_community_relay")
  .setDescription("Create a relay from a YouTube community post tab")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks)
  .addStringOption(
	  new SlashCommandStringOption()
	  .setName("channel_id")
	  .setDescription("Channel ID - not the username!")
  )
  .addStringOption(
	  new SlashCommandStringOption()
	  .setName("username")
	  .setDescription("Username of the channel")
  )
  .addStringOption(
	  new SlashCommandStringOption()
	  .setName("subtext")
	  .setDescription("Place here pings and stuff")
  ),
  new SlashCommandBuilder()
  .setName("list_yt_community_relays")
  .setDescription("Lists the YT community relays of the server")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks),
  new SlashCommandBuilder()
  .setName("remove_yt_community_relay")
  .setDescription("Remove the YT community relays for the current channel")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks)
]
if (!client.application) throw new Error("No application for client?")
await client.rest.put(Routes.applicationCommands(client.application.id), {"body": commands})

dataContent.lastRun = (new Date()).toISOString();
await saveData()
console.log("Running!")

Bun.serve({
  routes: {
    "/": new Response("OK"),
  }
});
