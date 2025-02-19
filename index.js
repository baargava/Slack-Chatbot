import pkg from '@slack/bolt';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebClient } from '@slack/web-api';
import ConvertAPI from 'convertapi';

dotenv.config();

const { App } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const convertApi = new ConvertAPI(process.env.CONVERTAPI_SECRET); // convertAPI secret key for converting pdf to pptx.

const app = new App({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    token: process.env.SLACK_BOT_TOKEN,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    ignoreSelf: false
});

// Error handler
app.error(async (error) => {
    console.error('An error occurred:', error.message);
    console.error('Stack trace:', error.stack);
});

// function to upload files to Slack channel based on channelId
async function uploadFileToSlack(filePath, channelId) {
    try {
        const fileStream = fs.createReadStream(filePath);

        const result = await slackClient.files.uploadV2({
            channels: channelId,
            file: fileStream,
            filename: path.basename(filePath),
            title: 'Converted PPTX File',
            initial_comment: 'Here is your converted PowerPoint file'
        });

        console.log('File upload result:', result);
        return result;
    } catch (error) {
        console.error('Error uploading file to Slack:', error.message);
        throw error;
    }
}

// funnction to download a file from a URL
async function downloadFile(url, outputPath) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to download file. Status: ${response.status}`);
        }

        const fileBuffer = await response.buffer();
        fs.writeFileSync(outputPath, fileBuffer);
        console.log(`File downloaded successfully to ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error('Error downloading file:', error.message);
        throw error;
    }
}

//  function to convert PDF to PPTX
async function convertPdfToPptx(pdfFilePath, outputDir) {
    try {
        const outputFileName = `converted_${Date.now()}.pptx`;
        const outputFilePath = path.join(outputDir, outputFileName);

        const filePath = pdfFilePath;

        console.log('Starting PDF to PPTX conversion...');

        // Convert PDF to PPTX using ConvertAPI
        const result = await convertApi.convert('pptx', { File: filePath }, 'pdf');

        console.log('ConvertAPI result:', result);

        // Save the converted file
        const savedFiles = await result.saveFiles(outputDir);

        if (savedFiles.length === 0) {
            throw new Error('No converted files found');
        }

        // Rename the first converted file
        const convertedFile = savedFiles[0];
        fs.renameSync(convertedFile, outputFilePath);

        console.log('Conversion successful. File saved at:', outputFilePath);
        return outputFilePath;
    } catch (error) {
        console.error('Error during PDF to PPTX conversion:', error.message);
        throw new Error('PDF to PPTX conversion failed. Please check the logs for more details.');
    }
}

app.command('/creategif', async ({ command, ack, respond }) => {
    await ack(); // Acknowledge the command
    const query = command.text; // User-provided search query
    console.log(query);

    try {
        // Fetch GIFs from Tenor API
        const response = await fetch(`https://api.tenor.com/v1/search?q=${query}&key=${process.env.TENOR_API_KEY}&limit=1`);
        const data = await response.json();
 console.log(data.results[0])
        if (data.results.length > 0) {
            const gifUrl = data.results[0].media[0].gif.url; // Get the first gif URL
            await respond({
                text: `Here's a gif for "${query}"`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Here’s your GIF for* _"${query}"_`
                        }
                    },
                    {
                        type: "image",
                        image_url: gifUrl,
                        alt_text: `GIF for ${query}`,
                    }
                ],
            });
        } else {
            await respond(`Sorry, no GIFs found for "${query}".`);
        }
    } catch (error) {
        console.error('Error fetching Tenor GIF API:', error);
        await respond('There was an error fetching GIFs. Please try again.');
    }
});

// Handle the  command
app.command('/convertpdf', async ({ command, ack, say }) => {
    await ack();

    const userInput = command.text.trim();
    const outputDir = path.join(__dirname, 'converted');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    if (userInput) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = userInput.match(urlRegex);

        if (urlMatch) {
            const pdfUrl = urlMatch[0];

            if (pdfUrl.endsWith('.pdf')) {
                await say(`Processing the PDF from the provided URL: ${pdfUrl}`);

                try {
                    const tempFilePath = path.join(__dirname, `temp_${Date.now()}.pdf`);
                    await downloadFile(pdfUrl, tempFilePath);

                    const convertedFile = await convertPdfToPptx(tempFilePath, outputDir);
                    await uploadFileToSlack(convertedFile, command.channel_id);

                    // Clean up
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                    if (fs.existsSync(convertedFile)) {
                        fs.unlinkSync(convertedFile);
                    }

                    await say("✅ PDF conversion to PPTX complete!");
                } catch (error) {
                    console.error('Error processing PDF from URL:', error.message);
                    await say("❌ Error processing the PDF from the provided URL. Please check the URL and try again.");
                }
            } else {
                await say("❌ The provided URL does not point to a valid PDF file. Please provide a URL ending with `.pdf`.");
            }
        } else {
            await say("❌ Invalid input. Please provide a valid PDF URL or upload a file for conversion.");
        }
    } else {
        await say({
            text: "Please upload a PDF file or provide a valid PDF URL, and I'll convert it to PPTX for you.",
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "You can:\n• Upload a PDF file\n• Share a valid PDF URL (e.g., https://example.com/file.pdf)",
                    },
                },
            ],
        });
    }
});

// Handle file uploads with the keyword "convert to pptx"
app.message(async ({ event, message, client }) => {
    const { text, user, channel, ts } = event;
    const userinfo = await slackClient.users.info({ user: user });

    console.log('Message event:', userinfo.user);
    if (
        message.text &&
        message.text.toLowerCase().includes('convert to pptx') &&
        message.files &&
        message.files.length > 0
    ) {
        const channelId = message.channel;

        for (const file of message.files) {
            try {
                const fileInfo = await client.files.info({ file: file.id });
                const fullFile = fileInfo.file;

                if (fullFile.mimetype === 'application/pdf') {
                    const pdfResponse = await fetch(fullFile.url_private, {
                        headers: {
                            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
                        },
                    });

                    const pdfBuffer = await pdfResponse.buffer();
                    const tempPdfPath = path.join(__dirname, `temp_${Date.now()}.pdf`);
                    fs.writeFileSync(tempPdfPath, pdfBuffer);

                    await client.chat.postMessage({
                        channel: channelId,
                        text: "Processing your Pdf file!",
                    });
                    const outputDir = path.join(__dirname, 'converted');
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir);
                    }

                    const convertedFile = await convertPdfToPptx(tempPdfPath, outputDir);
                    await uploadFileToSlack(convertedFile, channelId);

                    // Clean up cached files
                    if (fs.existsSync(tempPdfPath)) {
                        fs.unlinkSync(tempPdfPath);
                    }
                    if (fs.existsSync(convertedFile)) {
                        fs.unlinkSync(convertedFile);
                    }

                    await client.chat.postMessage({
                        channel: channelId,
                        text: "PDF converted to PPTX successfully!",
                    });
                } else {
                    await client.chat.postMessage({
                        channel: channelId,
                        text: `Conversion to PPTX not supported for file type: ${fullFile.mimetype}`,
                    });
                }
            } catch (error) {
                console.error('Error processing file:', error.message);
                await client.chat.postMessage({
                    channel: channelId,
                    text: `Error processing file: ${error.message}`,
                });
            }
        }
    }
});

// Test command to verify bot is working
app.command('/testbot', async ({ command, ack, say }) => {
    await ack();
    await say(`Hello! I'm working properly. Command received from <@${command.user_id}>`);
});

// Start the app
(async () => {
    try {
        const auth = await slackClient.auth.test();
        await app.start();
        console.log('App is running!');
    } catch (error) {
        console.error('Failed to start app:', error.message);
        process.exit(1);
    }
})();