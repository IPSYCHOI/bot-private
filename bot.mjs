

import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { google } from 'googleapis';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import fetch from 'node-fetch'; // Ensure you have 'node-fetch' installed for fetching files
import axios from 'axios';
import  {pipeline}  from 'stream/promises'; // Required for handling file streams

// Configure dotenv to load environment variables
dotenv.config();

// Paths setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Discord Bot setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const SHEETDB_API_URL = "https://sheetdb.io/api/v1/pszle45qy6kg6";
let cachedNames = [];
// Google Drive authentication setup
const SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',  // Required for file uploads
  'https://www.googleapis.com/auth/drive',      // Optional: broader access to drive
];

const TOKEN_PATH = path.join(__dirname, 'token.json'); // Path to store access token
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json'); // Path to your credentials file

// Initialize the Express server
const app = express();
const port = 3000;

// Function to get the 'Tasks' folder ID
async function getTasksFolderId(auth) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: "name = 'Tasks' and mimeType = 'application/vnd.google-apps.folder'",
    fields: 'files(id, name)',
  });

  console.log('Drive API Response:', res.data.files); // Log the response to see if any folder is returned

  if (res.data.files.length > 0) {
    console.log('Found folder:', res.data.files[0].name); // Log the found folder's name
    return res.data.files[0].id;  // Return the ID of the 'Tasks' folder
  } else {
    console.error('Error: Tasks folder not found in Google Drive.');
    throw new Error('Tasks folder not found in Google Drive.');
  }
}
async function getTaskFolderId(auth) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: "name = 'Task' and mimeType = 'application/vnd.google-apps.folder'",
    fields: 'files(id, name)',
  });

  console.log('Drive API Response:', res.data.files); // Log the response to see if any folder is returned

  if (res.data.files.length > 0) {
    console.log('Found folder:', res.data.files[0].name); // Log the found folder's name
    return res.data.files[0].id;  // Return the ID of the 'Tasks' folder
  } else {
    console.error('Error: Task folder not found in Google Drive.');
    throw new Error('Task folder not found in Google Drive.');
  }
}
async function createSubfolder(auth, parentFolderId, folderName) {
  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
  };
  const res = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
  });
  return res.data.id;  // Return the ID of the new subfolder
}
async function moveFilesToSubfolder(auth, fileIds, destinationFolderId) {
  const drive = google.drive({ version: 'v3', auth });
  for (const fileId of fileIds) {
      await drive.files.update({
          fileId: fileId,
          addParents: destinationFolderId,
          removeParents: (await drive.files.get({ fileId: fileId, fields: 'parents' })).data.parents.join(','),
          fields: 'id, parents',
      });
  }
}
async function listFilesInFolder(auth, folderId) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name)',
  });
  return res.data.files;
}
// Function to list member folders inside 'Tasks'
async function listMemberFolders(auth, tasksFolderId) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: `'${tasksFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name)',
  });
  return res.data.files;  // Return list of folders (members)
}

// Modified Google Drive upload function to specify folder
async function uploadFileToGoogleDrive(filePath, fileName, folderId) {
  const auth = await authenticateGoogle();
  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name: fileName,
    parents: [folderId],  // Upload to the selected member folder
  };
  const media = {
    mimeType: 'application/octet-stream',
    body: fs.createReadStream(filePath),
  };

  await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id',
  });
  console.log('File uploaded to Google Drive');
}
async function listSubfoldersInFolder(auth, folderId) {
  const drive = google.drive({ version: 'v3', auth });

  try {
      // List all subfolders in the folder
      const res = await drive.files.list({
          q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
          fields: 'files(id, name)', // Get file ID and name
      });

      return res.data.files || [];
  } catch (error) {
      console.error('Error fetching subfolders:', error);
      return [];
  }
}

// Google OAuth 2.0 authentication
async function authenticateGoogle() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
  } else {
    return oAuth2Client;
  }
  return oAuth2Client;
}


// Express server handling Google OAuth redirect
app.get('/auth/google', async (req, res) => {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    

    // Store the token for later use
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send('Authentication successful! You can now close this page.');
    
  } catch (error) {
    console.error('Error during authentication', error);
    res.send('Authentication failed!');
  }
  const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

  
  oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
  
  // Only open the URL in development, not production
  if (process.env.NODE_ENV !== 'production') {
    open(`http://localhost:${port}/auth/google`);
  } else {
    // In production, log the URL so users can open it manually
    console.log(`Please open the following URL in your browser:`);
    console.log(`https://bot-production-7bb6.up.railway.app/auth/google`);
  }
});


client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // Define the user ID who is allowed to use the "!all" command
  const allowedUserId = '976003257237372949'; // Replace 'YOUR_USER_ID' with the Discord ID of the user
  
  // Define the channel ID where the "!all" command is allowed
  // Replace 'YOUR_CHANNEL_ID' with the ID of the specific channel
  
  if (message.content.startsWith('!all ')) {
    // Check if the message author is the allowed user
    if (message.author.id !== allowedUserId) {
      return message.reply("You don't have permission to use this command.");
    }
  
    // Extract the custom message (remove "!all " from the beginning)
    const customMessage = message.content.slice(5).trim();
  
    // Ensure a message was provided
    if (!customMessage) {
      return message.reply("Please provide a message to send.");
    }
  
    try {
      // Delete the command message
      await message.delete();
  
      // Send the message with @everyone mention
      await message.channel.send(`@everyone ${customMessage}`);
    } catch (error) {
      console.error('Error sending notification:', error);
      message.reply('Failed to send the notification. Please try again.');
    }
  }
  
  
  //-----------------------------------------------------------------------------------

  if (message.content === '!task') {
    try {
      const auth = await authenticateGoogle();
      const tasksFolderId = await getTaskFolderId(auth);

      // List files in the "Tasks" folder
      const drive = google.drive({ version: 'v3', auth });
      const res = await drive.files.list({
        q: `'${tasksFolderId}' in parents`,
        fields: 'files(id, name, mimeType)',
      });

      const files = res.data.files;

      if (!files || files.length === 0) {
        return message.reply('No files found in the "Tasks" folder.');
      }

      const file = files[0]; // Select the first file
      const filePath = path.join(__dirname, file.name);
      const dest = fs.createWriteStream(filePath);

      if (file.mimeType === 'application/pdf') {
        // Directly download PDF files using media download
        const response = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'stream' }
        );

        response.data.pipe(dest);

        dest.on('finish', async () => {
          try {
            await message.author.send({
              files: [filePath],
            });
            message.reply('Task file sent to your DM!');
          } catch (error) {
            console.error('Error sending file:', error);
            message.reply('Failed to send the task. Please make sure your DMs are open.');
          } finally {
            fs.unlinkSync(filePath);  // Clean up the downloaded file
          }
        });

        dest.on('error', (error) => {
          console.error('Error writing file:', error);
          message.reply('Failed to download the task. Please try again later.');
        });
      } else if (file.mimeType.includes('application/vnd.google-apps')) {
        // For Google Docs, Sheets, etc. (export to PDF or DOCX)
        let exportMimeType = 'application/pdf'; // Default to PDF
        if (file.mimeType === 'application/vnd.google-apps.document') {
          exportMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; // DOCX
        } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
          exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; // XLSX
        }

        const response = await drive.files.export(
          { fileId: file.id, mimeType: exportMimeType },
          { responseType: 'stream' }
        );

        response.data.pipe(dest);

        dest.on('finish', async () => {
          try {
            await message.author.send({
              files: [filePath],
            });
            message.reply('Task file sent to your DM!');
          } catch (error) {
            console.error('Error sending file:', error);
            message.reply('Failed to send the task. Please make sure your DMs are open.');
          } finally {
            fs.unlinkSync(filePath);
          }
        });

        dest.on('error', (error) => {
          console.error('Error writing file:', error);
          message.reply('Failed to download the task. Please try again later.');
        });
      } else {
        message.reply('Unsupported file type in the "Tasks" folder.');
      }
    } catch (error) {
      console.error('Error handling !task command:', error);
      message.reply('An error occurred while processing your request.');
    }
  }
  const taskChannelId = "1315780720496738465"; // Replace with your actual channel ID

if (message.content === '!addtask') {
    if (!message.attachments.size) {
        return message.reply('Please attach a file to upload as the new task.');
    }

    try {
        const auth = await authenticateGoogle();
        const drive = google.drive({ version: 'v3', auth });
        const tasksFolderId = await getTaskFolderId(auth);

        // List all files in the "Tasks" folder
        const res = await drive.files.list({
            q: `'${tasksFolderId}' in parents`,
            fields: 'files(id, name)',
        });

        const files = res.data.files;

        // Delete all existing files in the folder
        for (const file of files) {
            await drive.files.delete({ fileId: file.id });
        }

        // Permanently remove from trash
        const trashRes = await drive.files.list({
            q: `'${tasksFolderId}' in parents and trashed=true`,
            fields: 'files(id, name)',
        });

        for (const file of trashRes.data.files) {
            await drive.files.delete({ fileId: file.id });
        }

        // Download the attached file
        const attachment = message.attachments.first();
        const filePath = path.join(__dirname, attachment.name);
        const dest = fs.createWriteStream(filePath);

        const response = await fetch(attachment.url);
        response.body.pipe(dest);

        dest.on('finish', async () => {
            try {
                // Upload the new task file to Google Drive
                const fileMetadata = {
                    name: attachment.name,
                    parents: [tasksFolderId],
                };
                const media = {
                    mimeType: attachment.contentType,
                    body: fs.createReadStream(filePath),
                };

                const uploadResponse = await drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id, name',
                });

                message.reply(`New task file **${uploadResponse.data.name}** uploaded successfully!`);

                // Get the channel and send the notification
                const taskChannel = message.client.channels.cache.get(taskChannelId);
                if (taskChannel) {
                    await taskChannel.send('@everyone New task has been added!');
                } else {
                    console.error('Task channel not found.');
                }

            } catch (uploadError) {
                console.error('Error uploading file:', uploadError);
                message.reply('Failed to upload the task. Please try again.');
            } finally {
                fs.unlinkSync(filePath); // Clean up the local file
            }
        });

        dest.on('error', (error) => {
            console.error('Error writing file:', error);
            message.reply('Failed to save the task locally.');
        });

    } catch (error) {
        console.error('Error handling !addtask command:', error);
        message.reply('An error occurred while processing your request.');
    }
}

  //-----------------------------------------------------------------------------------

     const notificationChannelId = "1316503136936001628"


if (message.content.startsWith('!submit')) {
    const files = Array.from(message.attachments.values()); // Convert the collection to an array

    if (files.length === 0) {
        return message.reply('Please attach at least one file with your task.');
    }

    try {
        const auth = await authenticateGoogle(); // Authenticate with Google API
        const tasksFolderId = await getTasksFolderId(auth); // Get 'Tasks' folder ID
        const memberFolders = await listMemberFolders(auth, tasksFolderId); // Get member folders

        if (memberFolders.length === 0) {
            return message.reply('No member folders found in the "Tasks" folder.');
        }

        let folderList = 'Please select your folder by replying with the number corresponding to your name:\n';
        memberFolders.forEach((folder, index) => {
            folderList += `${index + 1}. ${folder.name} \n`;
        });

        const selectionMessage = await message.reply(folderList);

        // Wait for the user's reply with their folder number
        const filter = (response) => response.author.id === message.author.id;
        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 });

        const userResponse = collected.first();
        const selectedNumber = parseInt(userResponse.content.trim(), 10);

        // Validate user input
        if (isNaN(selectedNumber) || selectedNumber < 1 || selectedNumber > memberFolders.length) {
            await message.reply('Invalid selection. Please provide a valid number next time.');
            return;
        }

        const selectedFolder = memberFolders[selectedNumber - 1];

        await selectionMessage.delete(); // Delete selection prompt
        await userResponse.delete(); // Delete user's response

        // Process each file
        for (const file of files) {
            const filePath = path.join(__dirname, file.name);
            const fileStream = fs.createWriteStream(filePath);

            try {
                const response = await fetch(file.url);
                if (!response.ok) {
                    throw new Error('Failed to fetch the file');
                }

                await pipeline(response.body, fileStream); // Wait for file download to complete

                // Upload file to Google Drive
                await uploadFileToGoogleDrive(filePath, file.name, selectedFolder.id);

                const memberName = message.author.username;
                const timestamp = new Date().toLocaleString();
                const channel = message.client.channels.cache.get(notificationChannelId);
                if (!channel) {
                    console.error("Channel not found. Check if the ID is correct.");
                    return;
                }
                
                await channel.send(`${memberName} submitted a file at ${timestamp}`);

                // Notify user via DM
                await message.author.send(`Your task file "${file.name}" has been submitted successfully, <@${message.author.id}>!`);

                fs.unlinkSync(filePath); // Remove file after upload
            } catch (error) {
                console.error('Error processing file:', error);
                await message.reply(`Failed to process file "${file.name}". Please try again.`);
            }
        }
    } catch (error) {
        console.error('Error handling task submission:', error);
        await message.reply('An error occurred while processing your submission. Please try again.');
    }

    // Delete the original command message
    await message.delete();
}


  if (message.content === '!delete_all' && message.author.dmChannel) {
    try {
      const dmChannel = message.author.dmChannel;
      // Fetch all messages in the DM channel
      const messages = await dmChannel.messages.fetch();

      // Loop through all messages and delete the ones sent by the bot
      messages.forEach(async (msg) => {
        if (msg.author.id === client.user.id) {
          await msg.delete(); // Deletes the bot's messages
        }
      });

      message.reply("All task confirmation messages have been deleted.");
    } catch (error) {
      console.error('Error deleting messages:', error);
      message.reply("An error occurred while trying to delete the messages.");
    }
  }
  if (message.content === "!listnames") {
    try {
      const response = await axios.get(SHEETDB_API_URL);
      
      cachedNames = response.data;

      if (cachedNames.length === 0) {
        message.reply("No names found in the database.");
        return;
      }

      // Display names with their corresponding numbers
      let replyMessage = "**List of Names:**\n";
      cachedNames.forEach((entry, index) => {
        replyMessage += `${index + 1}. ${entry.Names} - Points: ${entry.Points || 0}\n`;
      });

      message.reply(replyMessage );
    } catch (error) {
      console.error("Error fetching names:", error.response?.data || error.message);
      message.reply("An error occurred while fetching the names.");
    }
  }

  // Command to select a name and update points
  if (message.content.startsWith("!select")) {
    const args = message.content.split(" ");
    if (args.length < 3) {
      message.reply("Usage: `!select <number> <points>`");
      return;
    }

    const selectedNumber = parseInt(args[1]);
    const pointsToAdd = parseInt(args[2]);

    if (isNaN(selectedNumber) || isNaN(pointsToAdd)) {
      message.reply("Please provide valid numbers for both the selection and points.");
      return;
    }

    if (selectedNumber < 1 || selectedNumber > cachedNames.length) {
      message.reply("Invalid selection. Please choose a valid number from the list.");
      return;
    }

    // Get the selected name
    const selectedEntry = cachedNames[selectedNumber - 1];
    const currentPoints = parseInt(selectedEntry.Points || 0);
    const newPoints = currentPoints + pointsToAdd;
    const condition = { Names: selectedEntry.Names };

    try {
      // Update the points for the selected name using the "Names" column
      await axios.delete(`${SHEETDB_API_URL}`, {
        data: {
          column: 'Names',  // The column you're filtering by
          value: selectedEntry.Names  // The value to match in that column
        }
      });

      // Step 2: Insert the updated row with new points
      const updateResponse = await axios.post(`${SHEETDB_API_URL}`, {
        data: { Names: selectedEntry.Names, Points: newPoints }
      });
      

      message.reply(
        `Successfully updated points for '${selectedEntry.Names}' to ${newPoints}.`
      );
    } catch (error) {
      console.error("Error updating points:", error.response?.data || error.message);
      message.reply("An error occurred while updating the points.");
    }
  }

  if (message.content === "!points") {
    try {
      const response = await axios.get(SHEETDB_API_URL);
      
      cachedNames = response.data;
  
      if (cachedNames.length === 0) {
        message.author.send("No names found in the database.");
        return;
      }
  
      // Display names with their corresponding numbers
      let replyMessage = "**List of Names:**\n";
      cachedNames.forEach((entry, index) => {
        replyMessage += ` ${entry.Names} - Points: ${entry.Points || 0}\n`;
      });
  
      // Send the list of names and points in DM
      message.author.send(replyMessage);
  
    } catch (error) {
      console.error("Error fetching names:", error.response?.data || error.message);
      message.author.send("An error occurred while fetching the names.");
    }
  }


if (message.content.startsWith('!organize')) {
  // Check if the message author is the allowed user
  if (message.author.id !== allowedUserId) {
      return message.reply("You don't have permission to use this command.");
  }

  // Extract the subfolder name from the command
  const subfolderName = message.content.split(' ')[1]; // e.g., "!organize task1" => "task1"
  if (!subfolderName) {
      return message.reply('Please specify a subfolder name. Usage: `!organize <subfolder-name>`');
  }

  try {
      const auth = await authenticateGoogle();
      const tasksFolderId = await getTasksFolderId(auth);
      const memberFolders = await listMemberFolders(auth, tasksFolderId);

      let foldersCreated = 0; // Track how many folders were created

      for (const memberFolder of memberFolders) {
          // List all files in the student's folder
          const files = await listFilesInFolder(auth, memberFolder.id);
          if (files.length === 0) {
              console.log(`Skipping folder "${memberFolder.name}" as it contains no files.`);
              continue; // Skip if no files exist
          }

          // Create a new subfolder with the specified name
          const subfolderId = await createSubfolder(auth, memberFolder.id, subfolderName);
          const fileIds = files.map(file => file.id);
          
          // Move all files into the new subfolder
          await moveFilesToSubfolder(auth, fileIds, subfolderId);
          foldersCreated++;
      }

      if (foldersCreated > 0) {
          message.reply(`Files have been organized into new subfolders named "${subfolderName}".`);
      } else {
          message.reply('No files found in any folder. No subfolders were created.');
      }
  } catch (error) {
      console.error('Error organizing files:', error);
      message.reply('Failed to organize files. Please check the logs for details.');
  }
}

if (message.content.startsWith('!count')) {
  const args = message.content.split(' ');
  if (args.length < 2 || isNaN(args[1])) {
      return message.reply('Please provide a valid task number. Usage: `!count <taskNumber>`');
  }

  const taskNumber = args[1]; // Extract task number (e.g., "2")
  const auth = await authenticateGoogle(); // Authenticate with Google API
  const tasksFolderId = await getTasksFolderId(auth); // Get 'Tasks' folder ID
  const memberFolders = await listMemberFolders(auth, tasksFolderId); // Get all member folders

  let taskUploads = {};
  let taskIndex = 0;
  let foundFolders = true;

  while (foundFolders) {
      foundFolders = false;
      const taskLabel = `task${taskNumber}.${taskIndex}`; // e.g., task2.0, task2.1, etc.
      taskUploads[taskLabel] = [];

      for (const memberFolder of memberFolders) {
          // List subfolders for each member's folder
          const subfolders = await listSubfoldersInFolder(auth, memberFolder.id);

          if (subfolders.some(subfolder => subfolder.name === taskLabel)) {
              foundFolders = true;
              taskUploads[taskLabel].push(memberFolder.name); // Add member name who uploaded this task
          }
      }

      if (!foundFolders) {
          delete taskUploads[taskLabel]; // Remove task entry if no member submitted it
      } else {
          taskIndex++; // Move to the next task version (task2.1, task2.2, etc.)
      }
  }

  if (Object.keys(taskUploads).length === 0) {
      return message.reply(`No submissions found for task ${taskNumber}.`);
  }

  let report = `📊 **Task ${taskNumber} Submission Report** 📊\n\n`;
  for (const [task, members] of Object.entries(taskUploads)) {
      report += `📌 **${task}**:\n${members.map(m => `- ${m}`).join('\n')}\n\n`;
  }

  try {
      await message.author.send(report); // Send the report to the user who issued the command
      message.reply(`Report sent to you via DM.`);
  } catch (error) {
      console.error('Error sending DM:', error);
      message.reply('Failed to send report. Please check your DM settings.');
  }
}


});



// Log in the Discord bot
client.login(process.env.BOT_TOKEN);


