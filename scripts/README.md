# Persona Frame Test Scripts

This directory contains scripts for testing the persona generation flow locally.

## test-fid-239.js

A standalone script that replicates the entire persona generation flow for any Farcaster ID (default: 239).

### Usage

```bash
# Make sure you're in the project root and have dependencies installed
npm install

# Run the test script
node scripts/test-fid-239.js
```

### What it does

1. **Fetches user data** from Neynar API
2. **Fetches recent casts** from Snapchain API (up to 300 non-reply casts)
3. **Generates AI analysis** including fun facts and art style
4. **Creates persona image** using GPT-4.1-nano with image generation
5. **Saves all outputs** to `scripts/output/`:
   - `fid-239-profile.json` - User profile data
   - `fid-239-casts.json` - Recent casts with timestamps
   - `fid-239-analysis.json` - AI-generated fun facts and art style
   - `fid-239-persona.png` - Final generated image

### Customization

To test a different FID, edit line 14:
```javascript
const TEST_FID = 239; // Change this to test different FIDs
```

### Environment Variables

The script uses the same `.env` file as the main app:
- `NEYNAR_API_KEY` - For fetching user profile
- `OPENAI_API_KEY` - For AI analysis and image generation
- `SNAPCHAIN_HTTP_API_URL` - For fetching user casts

### Output

All files are saved to `scripts/output/` with the FID in the filename, making it easy to test multiple users and compare results.