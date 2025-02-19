# Slack Bot for PDF to PPTX Conversion & GIF Search

This Slack bot enables users to convert PDF files to PPTX using ConvertAPI and fetch GIFs using the Tenor API. The bot is built using the Slack Bolt framework and operates in Socket Mode with ngrok for reverse proxy.

## Features
- Convert uploaded PDF files or URLs to PPTX and upload them to Slack.
- Fetch GIFs from the Tenor API based on user queries.
- Test bot functionality using `/testbot`.
- Uses ngrok for reverse proxy to run locally.

## Prerequisites
- Node.js (v14 or later)
- Ngrok (for reverse proxy)
- A Slack workspace and a Slack bot with necessary permissions
- ConvertAPI account for PDF to PPTX conversion
- Tenor API key for GIF search

## Installation
1. Clone this repository:
   ```sh
   git clone <repository_url>
   cd <project_directory>
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a `.env` file in the root directory and add the following:
   ```env
   SLACK_BOT_TOKEN=your_slack_bot_token
   SLACK_SIGNING_SECRET=your_slack_signing_secret
   SLACK_APP_TOKEN=your_slack_app_token
   CONVERTAPI_SECRET=your_convertapi_secret
   TENOR_API_KEY=your_tenor_api_key
   ```
4. Start ngrok for reverse proxy:
   ```sh
   ngrok http 3000
   ```
   Copy the HTTPS URL provided by ngrok and update your Slack app settings under "Event Subscriptions" and "Interactivity & Shortcuts".

## Usage
### Slack Commands
- `/convertpdf <pdf_url>` - Converts a PDF from a URL to PPTX and uploads it to Slack.
- `/creategif <search_query>` - Searches for a GIF using the Tenor API and posts it in Slack.
- `/testbot` - Tests if the bot is active and responding.

### Automatic PDF Processing
- Upload a PDF file to a Slack channel and include the phrase `convert to pptx` in the message. The bot will process and upload the converted PPTX file.

## Error Handling
- The bot logs errors and provides messages in Slack if conversions or API calls fail.

## Running the Bot
Start the bot using:
```sh
node index.js
```
Ensure ngrok is running, and the Slack bot is configured to use the correct ngrok URL.

## License
This project is open-source and available for modification and distribution under the MIT License.


