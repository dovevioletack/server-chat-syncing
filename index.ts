import { SlashCommandBuilder, SlashCommandBooleanOption, PermissionsBitField, SlashCommandStringOption, SlashCommandIntegerOption, SlashCommandChannelOption, Routes } from "discord.js";
import client from "./client.ts";
import { dataContent, saveData } from "./dataMsg.ts";
import "./syncing.ts";

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
  .setName("clear_channel_group_queue")
  .setDescription("Clears the message queue for the current channel group.")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageWebhooks)
]
if (!client.application) throw new Error("No application for client?")
await client.rest.put(Routes.applicationCommands(client.application.id), {"body": commands})

dataContent.lastRun = (new Date()).toISOString();
await saveData()
console.log("Running!")
