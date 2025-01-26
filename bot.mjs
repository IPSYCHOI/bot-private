
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
    console.log(`http://bot-production-7bb6.up.railway.app:${port}/auth/google`);
  }
});


client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // Define the user ID who is allowed to use the "!all" command
  const allowedUserId = '976003257237372949'; // Replace 'YOUR_USER_ID' with the Discord ID of the user
  
  // Define the channel ID where the "!all" command is allowed
  // Replace 'YOUR_CHANNEL_ID' with the ID of the specific channel
  
  if (message.content === '!all') {
    // Check if the message author is the allowed user
    if (message.author.id !== allowedUserId) {
      return message.reply("You don't have permission to use this command.");
    }
    
    
    
    try {
      
      // Send the message in the channel where the command was used
       await message.channel.send('@everyone New task has been added!');
      
      
      
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
  //-----------------------------------------------------------------------------------

     const notificationChannelId = "1316503136936001628"
    if (message.content.startsWith('!submit')) {
    const files = Array.from(message.attachments.values()); // Convert the collection to an array
    if (files.length > 0) {
        const auth = await authenticateGoogle(); // Authenticate with Google API
        const tasksFolderId = await getTasksFolderId(auth); // Get 'Tasks' folder ID
        const memberFolders = await listMemberFolders(auth, tasksFolderId); // Get member folders

        if (memberFolders.length > 0) {
            let folderList = 'Please select your folder by replying with the number corresponding to your name:\n';
            memberFolders.forEach((folder, index) => {
                folderList += `${index + 1}. ${folder.name} \n`;
            });

            const selectionMessage = await message.reply(folderList);

            // Wait for the user's reply with their folder number
            const filter = (response) => response.author.id === message.author.id;
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

            // Delete the folder selection message
            await selectionMessage.delete();

            // Delete the user's folder selection message
            await collected.first().delete();

            const selectedNumber = parseInt(collected.first().content.trim(), 10);
            const selectedFolder = memberFolders[selectedNumber - 1];

            if (selectedFolder) {
                // Loop through each file and upload to Google Drive
                for (const file of files) {
                    const filePath = path.join(__dirname, file.name);
                    const fileStream = fs.createWriteStream(filePath);

                    try {
                        const response = await fetch(file.url);
                        if (!response.ok) {
                            throw new Error('Failed to fetch the file');
                        }

                        response.body.pipe(fileStream);

                        fileStream.on('finish', async () => {
                            try {
                                await uploadFileToGoogleDrive(filePath, file.name, selectedFolder.id);
                                const memberName = message.author.username;
                                const timestamp = new Date().toLocaleString();
                                const channel = await message.guild.channels.fetch(notificationChannelId);
                                channel.send(`${memberName} submitted a file at ${timestamp}`);
                                // Send success message to the user
                                await message.author.send(`Your task file "${file.name}" has been submitted successfully, <@${message.author.id}>!`);
                            } catch (error) {
                                console.error('Error uploading file to Google Drive:', error);
                                message.reply('Failed to submit your task. Please try again.');
                            }
                            fs.unlinkSync(filePath); // Remove the file after upload
                        });
                    } catch (error) {
                        console.error('Error downloading the file:', error);
                        message.reply('Failed to download the file. Please try again.');
                    }
                }
            } else {
                message.reply('Folder not found. Please check your folder number.');
            }
        } else {
            message.reply('No member folders found in the "Tasks" folder.');
        }
    } else {
        message.reply('Please attach at least one file with your task.');
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





  
  
  
});



// Log in the Discord bot
client.login(process.env.BOT_TOKEN);


