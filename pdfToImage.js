import pkg from '@slack/bolt';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-poppler';
import { fileURLToPath } from 'url';
import { WebClient } from '@slack/web-api';

dotenv.config();

const { App } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

const app = new App({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    token: process.env.SLACK_BOT_TOKEN,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    ignoreSelf: false })

// Logging middleware to debug incoming events
app.use(async ({ logger, context, next }) => {
    try {
        const userId = context.userId; 
        const result = await slackClient.users.info({ user: userId });

    } catch (error) {
        console.error('Error fetching user details:', error);
    }
    await next();
});

// Error handler
app.error(async (error) => {
    console.error('An error occurred:', error);
});


// function to upload images to Slack
async function uploadImagesToSlack(imagePaths, channelId) {
    try {
        for (const imagePath of imagePaths) {
            const fileStream = fs.createReadStream(imagePath);
            
            
            const result = await slackClient.files.uploadV2({
                channels: channelId,
                file: fileStream,
                filename: path.basename(imagePath),
                title: 'Converted PDF Page',
                initial_comment: 'Here is your converted PDF page'
            });
            
            console.log('Upload result:', result);
            
            // Wait a bit between uploads to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('Images uploaded successfully.');
    } catch (error) {
        console.error('Error uploading images to Slack:', error);
        throw error;
    }
}

// Handle the /convertpdf command
app.command('/convertpdf', async ({ command, ack, say }) => {
    await ack();

    const userInput = command.text.trim();

    if (userInput) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = userInput.match(urlRegex);

        if (urlMatch) {
            const pdfUrl = urlMatch[0];

            if (pdfUrl.endsWith('.pdf')) {
                // Inform the user that the bot is processing the URL
                await say(`Processing the PDF from the provided URL: ${pdfUrl}`);

                try {
                    // Download the PDF file from the URL
                    const response = await fetch(pdfUrl);

                    if (!response.ok) {
                        throw new Error(`Failed to download file from URL. Status: ${response.status}`);
                    }

                    const fileBuffer = await response.buffer();
                    const tempFileName = `temp_${Date.now()}.pdf`;
                    const tempFilePath = path.join(__dirname, tempFileName);

                    // Save the file locally
                    fs.writeFileSync(tempFilePath, fileBuffer);

                    console.log('PDF file saved locally from URL:', tempFilePath);

                    // Convert the PDF to images
                    const imagePaths = await convertPdfToImage(tempFilePath);

                    console.log('Uploading images from URL-based PDF:', {
                        channelId: command.channel_id,
                        imageCount: imagePaths.length,
                        firstImage: imagePaths[0],
                    });

                    // Upload converted images
                    await uploadImagesToSlack(imagePaths, command.channel_id);

                    // Clean up temporary files
                    fs.unlinkSync(tempFilePath);
                    imagePaths.forEach(filePath => {
                        try {
                            fs.unlinkSync(filePath);
                        } catch (err) {
                            console.error('Error deleting temp file:', err);
                        }
                    });

                    await say("✅ PDF conversion complete!");
                } catch (error) {
                    console.error('Error processing PDF from URL:', error);
                    await say("❌ Error processing the PDF from the provided URL. Please check the URL and try again.");
                }
            } else {
                await say("❌ The provided URL does not point to a valid PDF file. Please provide a URL ending with `.pdf`.");
            }
        } else {
            await say("❌ Invalid input. Please provide a valid PDF URL or upload a file for conversion.");
        }
    } else {
        // Prompt the user to upload a file or provide a URL
        await say({
            text: "Please upload a PDF file or provide a valid PDF URL, and I'll convert it to images for you.",
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


// Test command to verify bot is working
app.command('/testbot', async ({ command, ack, say }) => {
    await ack();
    await say(`Hello! I'm working properly. Command received from <@${command.user_id}>`);
});

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


// Handle basic messages
app.message('hello', async ({ message, say }) => {
    console.log('message',message)
    await say(`Hey there <@${message.user}>! I'm here to help convert PDF files to images. Use the /convertpdf command to get started.`);
});



//messages along with the file
app.message(async ({ message, client }) => {
    // Check if message contains the word "convert" and files
    if (message.text && message.text.toLowerCase().includes('convert to image') && 
        message.files && message.files.length > 0) {
        
        const channelId = message.channel;

        for (const file of message.files) {
            try {
                // Get full file information
                const fileInfo = await client.files.info({ file: file.id });
                const fullFile = fileInfo.file;

                // Determine file type and convert accordingly
                switch (fullFile.mimetype) {
                    case 'application/pdf':
                        // Download PDF
                        const pdfResponse = await fetch(fullFile.url_private, {
                            headers: { 
                                'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` 
                            }
                        });
                        const pdfBuffer = await pdfResponse.buffer();
                        
                        // Save temporary PDF
                        const tempPdfPath = path.join(__dirname, `temp_${Date.now()}.pdf`);
                        fs.writeFileSync(tempPdfPath, pdfBuffer);

                        // Convert PDF to images
                        const pdfImages = await convertPdfToImage(tempPdfPath);

                        // Upload converted images
                        await uploadImagesToSlack(pdfImages, channelId);

                        // Clean up temporary files
                        fs.unlinkSync(tempPdfPath);
                        pdfImages.forEach(img => fs.unlinkSync(img));

                        await client.chat.postMessage({
                            channel: channelId,
                            text: "PDF converted successfully!"
                        });
                        break;

                    default:
                        await client.chat.postMessage({
                            channel: channelId,
                            text: `Conversion not supported for file type: ${fullFile.mimetype}`
                        });
                }
            } catch (error) {
                console.error('File processing error:', error);
                await client.chat.postMessage({
                    channel: channelId,
                    text: `Error processing file: ${error.message}`
                });
            }
        }
    }
});

// Utility function to download file
async function downloadFile(fileUrl) {
    const response = await fetch(fileUrl, {
        headers: { 
            'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` 
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to download file. Status: ${response.status}`);
    }

    return response.buffer();
}

// Existing PDF to image conversion function
async function convertPdfToImage(pdfFilePath) {
    const outputDir = path.join(__dirname, 'images');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    const options = {
        format: 'png',
        out_dir: outputDir,
        out_prefix: 'page',
        page: null,
    };

    try {
        await pdf.convert(pdfFilePath, options);

        const imageFiles = fs
            .readdirSync(outputDir)
            .filter(file => file.startsWith('page-') && file.endsWith('.png'))
            .map(file => path.join(outputDir, file))
            .sort();

        return imageFiles;
    } catch (error) {
        console.error('PDF conversion error:', error);
        throw error;
    }
}


// Start the app
(async () => {
    try {
        // Test authentication
        const auth = await slackClient.auth.test();

        await app.start();
        console.log(' app is running!');
    } catch (error) {
        console.error('Failed to start app:', error);
        process.exit(1);
    }
})();