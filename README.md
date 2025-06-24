# What X Are You - Farcaster Frame Template

## Overview

A Farcaster mini-app template that analyzes user profiles and casts to determine their or whatever you want.

- **Neynar API** - Fetches Farcaster user data and casts
- **Google Gemini API** - AI analysis of user personality traits
- **Cloudflare R2** (optional) - Stores shareable result images

## Getting Started

### 1. Prerequisites

- Cursor or Visual Studio Code with Copilot enabled
- Ability to open up your Terminal (in Applications/Utilities folder) and run `npm --version` and have it spit out a number

### 2. API Keys Setup

#### Neynar API Key
1. Go to [neynar.com](https://neynar.com)
2. Sign up and navigate to the dashboard
3. Create a new app
4. Copy your API key

#### Google Gemini API Key
1. Visit [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click "Get API key" on the top right of the page
4. Create a new API key
5. Copy the API key

#### Cloudflare R2 (Optional - for image sharing)
1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to R2 Object Storage
3. Create a bucket if you don't have one
4. Go to Manage R2 API Tokens → Create API token
5. Set permissions to "Object Read & Write"
6. Create token and save the credentials
7. Set up a public bucket URL for serving images

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Required
NEYNAR_API_KEY=your_neynar_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# So the app knows what it's URL is
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional - Cloudflare R2 for image sharing
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://your-bucket-url.r2.dev
```

### 4. Installation & Running

```bash
# Clone the repository
git clone https://github.com/jc4p/what-x-are-you-template
cd what-x-are-you-template

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Note**: This app is designed to run inside a Farcaster Frame. To test locally, you'll need to use a Frame debugger or cast the frame URL on Farcaster.

## Development Guide

## Loading in Farcaster debugger

Since Farcaster Frames need to be accessible via HTTPS, you'll need to tunnel your local development server. Here's how to set up ngrok:

### 1. Create a Free ngrok Account
1. Go to [ngrok.com](https://ngrok.com)
2. Sign up for a free account
3. Once logged in, ignore the installation instructions and find the "Your authtoken" section
4. Copy your authtoken

### 2. Install and Setup ngrok
```bash
# Install ngrok for OSX
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-arm64.zip && sudo unzip ~/Downloads/ngrok-v3-stable-darwin-arm64.zip -d /usr/local/bin

# Authenticate with your token (replace with your actual token)
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

### 3. Run Your Development Server and ngrok
```bash
# Terminal 1: Start your Next.js development server
npm run dev

# Terminal 2: Start ngrok tunnel (in a new terminal window)
ngrok http 3000 --url your-project-name.ngrok.app
```

**Note**: Replace `your-project-name` with a unique name for your project. The `--url` flag with a custom subdomain requires a free ngrok account.

### 4. Test Your Frame
1. Copy the ngrok URL (e.g., `https://your-project-name.ngrok.app`)
2. Paste it into https://farcaster.xyz/~/developers/mini-apps/preview and hit enter

### Cursor/AI Coding Prompts

Here are effective prompts for extending this template:

#### Adding New Analysis Types
```
"Update the analysis prompt and frontend to what [Pokemon/Marvel character/etc] the user is most like. Follow the existing Hogwarts House pattern in gemini.js, create a new schema, and update the HomeComponent to display the results."
```

#### Customizing Visual Design
```
"Update the UI design to have a [dark mode/cyberpunk/minimalist] theme. Modify the CSS modules and color schemes while maintaining the existing component structure."
```

## File Structure

### Core Files

#### `/src/components/HomeComponent.jsx`
The main UI component that:
- Detects Farcaster Frame context
- Fetches user analysis from the API
- Displays results with house colors and percentages
- Handles sharing functionality (when R2 is configured)

#### `/src/lib/gemini.js`
Gemini AI integration:
- Defines the analysis schema for Hogwarts Houses
- Sends user bio and casts to Gemini
- Returns structured analysis with house percentages and evidence

#### `/src/lib/neynar.js`
Neynar API integration:
- `getUserDataFromNeynar()` - Fetches user profile data
- `getRecentCastTexts()` - Retrieves user's recent casts with pagination

#### `/src/lib/frame.js`
Farcaster Frame SDK initialization:
- Detects Frame context
- Extracts user FID
- Signals frame ready state

#### `/src/lib/r2.js`
Cloudflare R2 integration (optional):
- Uploads generated share images
- Returns public URLs for sharing
- Gracefully disabled if not configured

### API Routes

#### `/src/app/api/user/route.js`
Main analysis endpoint:
- Accepts FID as query parameter
- Fetches user data from Neynar
- Runs Gemini analysis
- Returns combined results

#### `/src/app/api/create-share-link/route.js`
Share image generation (requires R2):
- Creates OG image with results
- Uploads to Cloudflare R2
- Returns shareable URL

#### `/src/app/api/og/route.js`
Open Graph image generator:
- Generates dynamic share images
- Uses Vercel OG library

### Configuration Files

#### `/src/app/page.js`
- Sets Frame metadata
- Configures preview and splash images

#### `/src/components/FrameInit.jsx`
- Client-side Frame initialization wrapper

## Customization Tips

1. **Change Analysis Theme**: Modify the schema in `gemini.js` to analyze for different categories
2. **Update Styling**: Edit CSS modules in component folders
3. **Add New API Integrations**: Create new files in `/src/lib/`
4. **Extend Analysis**: Add more data sources in the `/api/user` route
5. **Custom Sharing**: Modify the OG image template in `/api/og`

## Troubleshooting

- **"Not in frame context"**: The app must be opened within a Farcaster client
- **API errors**: Check your environment variables are set correctly
- **Share button fails**: R2 configuration is optional; sharing requires all R2 variables
- **No user data**: Ensure the FID exists and Neynar API key is valid