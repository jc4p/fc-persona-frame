import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TEST_FID = 977233; // Change this to test different FIDs
const OUTPUT_DIR = path.join(__dirname, 'output');

// Environment variables check
const requiredEnvVars = ['NEYNAR_API_KEY', 'OPENAI_API_KEY', 'SNAPCHAIN_HTTP_API_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Schema for AI analysis (copied from openai.js)
const CastAnalysis = z.object({
  facts: z.array(z.string()).describe("5-7 personalized fun facts about the user, plain text no formatting, no markdown, direct and to the point"),
  artStyle: z.string().describe("Art style/theme that matches their personality (e.g., 'cyberpunk neon aesthetic', 'watercolor impressionism', 'minimalist geometric'), plain text, no explaination")
});

// Helper function to convert Farcaster timestamp to Date
function farcasterToDate(farcasterTimestamp) {
  const FARCASTER_EPOCH = 1609459200; // Unix timestamp for Jan 1, 2021 00:00:00 UTC
  return new Date((farcasterTimestamp + FARCASTER_EPOCH) * 1000);
}

// Fetch user data from Neynar
async function getUserDataFromNeynar(fid) {
  const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`;
  
  console.log(`📡 Fetching user data for FID ${fid}...`);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'api_key': process.env.NEYNAR_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Neynar API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.users && data.users.length > 0) {
    return data.users[0];
  }
  
  throw new Error('User not found');
}

// Fetch casts with timestamps from Snapchain
async function getRecentCastsWithTimestamps(fid, maxCasts = Infinity) {
  const allCasts = [];
  let nextPageToken = null;
  
  console.log(`📝 Fetching casts for FID ${fid}...`);
  
  while (allCasts.length < maxCasts) {
    const params = new URLSearchParams({ fid: fid.toString() });
    if (nextPageToken) {
      params.append('pageToken', nextPageToken);
    }
    
    const url = `${process.env.SNAPCHAIN_HTTP_API_URL}?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'accept': 'application/json' },
    });
    
    if (!response.ok) {
      throw new Error(`Snapchain API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.messages && data.messages.length > 0) {
      const casts = data.messages
        .filter(msg => 
          msg.data?.castAddBody?.text && 
          msg.data?.castAddBody?.parentCastId === null
        )
        .map(msg => ({
          text: msg.data.castAddBody.text,
          timestamp: msg.data.timestamp
        }));
      
      allCasts.push(...casts);
      console.log(`  Fetched ${casts.length} casts (total: ${allCasts.length})`);
    } else {
      break;
    }
    
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }
  
  return allCasts.slice(0, maxCasts);
}

// Generate AI analysis with retry logic
async function generateAIAnalysis(castsWithTimestamps, userData) {
  console.log('🤖 Generating AI analysis...');
  
  let currentCasts = [...castsWithTimestamps];
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  const MIN_CASTS = 10;
  
  while (attempts < MAX_ATTEMPTS && currentCasts.length >= MIN_CASTS) {
    try {
      attempts++;
      console.log(`  Analyzing ${currentCasts.length} casts (attempt ${attempts})...`);
      
      const prompt = `Analyze these Farcaster posts from ${userData.username} and generate 5-7 interesting, personalized fun facts about their posting style, personality, interests, or patterns. Make them engaging and specific to this user. No need to make them superlatives or super nice, be direct and tell them what you see.

Sample of their posts:
${currentCasts.map(cast => cast.text).join('\n---\n')}

Generate fun facts that are:
- Specific and personalized (not generic)
- Interesting observations about their personality or interests
- Playful and engaging
- About 1-2 sentences each
- Varied in topic (posting patterns, interests, writing style, etc.)

Speak directly to the user in the first person.

Also analyze their overall vibe and suggest an art style/theme that would best represent them visually. Consider their interests, tone, and personality.`;

      const analysisStartTime = Date.now();
      const response = await openai.chat.completions.parse({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 500,
        response_format: zodResponseFormat(CastAnalysis, "cast_analysis")
      });
      const analysisDuration = (Date.now() - analysisStartTime) / 1000;
      console.log(`  AI analysis took ${analysisDuration.toFixed(2)} seconds`);

      return response.choices[0].message.parsed;
      
    } catch (error) {
      console.error(`  AI analysis error (attempt ${attempts}):`, error.message);
      
      if (error.message && (error.message.includes('token') || error.message.includes('limit'))) {
        // Reduce casts by 20% from the beginning (keep most recent)
        const removeCount = Math.max(1, Math.floor(currentCasts.length * 0.2));
        currentCasts = currentCasts.slice(removeCount);
        console.log(`  Reducing to ${currentCasts.length} casts and retrying...`);
        
        if (currentCasts.length < MIN_CASTS) {
          throw new Error('Not enough posts to generate analysis');
        }
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Failed to generate AI analysis after maximum attempts');
}

// Generate persona image with retry logic
async function generatePersonaImage(userData, castTexts, artStyle, castsWithTimestamps) {
  console.log('🎨 Generating persona image...');
  console.log(`  Art style: ${artStyle}`);
  
  let currentCastTexts = [...castTexts];
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  const MIN_CASTS = 10;
  
  while (attempts < MAX_ATTEMPTS && currentCastTexts.length >= MIN_CASTS) {
    try {
      attempts++;
      console.log(`  Starting generation with ${currentCastTexts.length} posts (attempt ${attempts})...`);
      
      // This matches the API behavior - it uses castTexts (strings) for the prompt
      const contentArray = [
        { 
          type: "input_text", 
          text: `User Profile:
- Username: ${userData.username}
- Display Name: ${userData.display_name || userData.username}
- Bio: ${userData.profile?.bio?.text || 'No bio provided'}

All Posts (${currentCastTexts.length} total):
${currentCastTexts.join('\n---\n')}`
        }
      ];
      
      // Add profile picture if available
      if (userData.pfp_url && attempts === 1) { // Only fetch on first attempt
        try {
          console.log('  Fetching profile picture...');
          const pfpResponse = await fetch(userData.pfp_url);
          if (pfpResponse.ok) {
            const arrayBuffer = await pfpResponse.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            const mimeType = pfpResponse.headers.get('content-type') || 'image/jpeg';
            contentArray.push({
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64}`
            });
          }
        } catch (error) {
          console.warn('  Failed to fetch profile picture:', error.message);
        }
      }
      
      // Add image generation prompt
      const imagePrompt = `Based on this Farcaster user's personality, interests, and posts, create a unique visual representation that captures their essence. The art style should be: ${artStyle}. Create a scene showing this person in their natural habitat - a setting or environment that represents their interests, personality, and lifestyle based on their posts. Feature the person prominently in the scene (use their attached profile picture as reference for their appearance - maintain their likeness and key visual characteristics while adapting them naturally into the scene). Surround them with objects, symbols, or activities that represent their personality. The person should be integrated into the scene, not just placed on top. Note: While this is from a crypto-centric social network, don't overemphasize crypto/web3 aspects unless they're truly dominant in the user's posts.`;
      
      contentArray.push({ type: "input_text", text: imagePrompt });
      
      console.log('  Calling OpenAI image generation...');
      const startTime = Date.now();
      
      const response = await openai.responses.create({
        model: "gpt-4.1-nano",
        input: [{
          role: "user",
          content: contentArray
        }],
        tools: [{ 
          type: "image_generation",
          quality: "high",
          size: "1024x1024",
        }],
      });
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      console.log(`  Image generation took ${duration.toFixed(2)} seconds`);
      
      const finalImage = response.output
        .filter((output) => output.type === "image_generation_call")
        .map((output) => output.result);
      
      if (finalImage.length > 0) {
        console.log(`  ✅ Image generated successfully with ${currentCastTexts.length} casts`);
        return finalImage[0];
      }
      
      throw new Error('No image generated');
      
    } catch (error) {
      console.error(`  Image generation error (attempt ${attempts}):`, error.message);
      
      if (error.message && (error.message.includes('token') || error.message.includes('limit'))) {
        // Reduce casts by 20% from the beginning (keep most recent)
        const removeCount = Math.max(1, Math.floor(currentCastTexts.length * 0.2));
        currentCastTexts = currentCastTexts.slice(removeCount);
        console.log(`  Reducing to ${currentCastTexts.length} casts and retrying...`);
        
        if (currentCastTexts.length < MIN_CASTS) {
          throw new Error('Not enough posts to generate image');
        }
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Failed to generate image after maximum attempts');
}

// Save data to file
async function saveToFile(filename, data) {
  const filePath = path.join(OUTPUT_DIR, filename);
  
  if (filename.endsWith('.json')) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } else if (filename.endsWith('.png')) {
    // Decode base64 image
    const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(filePath, buffer);
  } else {
    await fs.writeFile(filePath, data);
  }
  
  console.log(`  ✅ Saved: ${filename}`);
}

// Main execution
async function main() {
  console.log(`\n🚀 Starting persona generation for FID ${TEST_FID}\n`);
  const overallStartTime = Date.now();
  
  try {
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Step 1: Fetch user data
    const userData = await getUserDataFromNeynar(TEST_FID);
    console.log(`✅ User found: @${userData.username} (${userData.display_name})`);
    await saveToFile(`fid-${TEST_FID}-profile.json`, userData);
    
    // Step 2: Fetch casts
    const castsWithTimestamps = await getRecentCastsWithTimestamps(TEST_FID);
    console.log(`✅ Fetched ${castsWithTimestamps.length} casts`);
    
    // Log first and last cast like the API does
    console.log('First cast:', castsWithTimestamps[0]);
    console.log('Last cast:', castsWithTimestamps[castsWithTimestamps.length - 1]);
    
    await saveToFile(`fid-${TEST_FID}-casts.json`, castsWithTimestamps);
    
    if (castsWithTimestamps.length === 0) {
      throw new Error('No casts found for this user');
    }
    
    // Step 3: Generate AI analysis
    const analysis = await generateAIAnalysis(castsWithTimestamps, userData);
    console.log(`✅ Generated AI analysis`);
    await saveToFile(`fid-${TEST_FID}-analysis.json`, analysis);
    
    // Print fun facts
    console.log('\n📊 Fun Facts:');
    analysis.facts.forEach((fact, i) => {
      console.log(`  ${i + 1}. ${fact}`);
    });
    
    // Step 4: Generate persona image
    // Extract just the texts for compatibility (matching API behavior)
    const castTexts = castsWithTimestamps.map(cast => cast.text);
    const imageBase64 = await generatePersonaImage(
      userData, 
      castTexts, 
      analysis.artStyle,
      castsWithTimestamps
    );
    console.log(`✅ Generated persona image`);
    await saveToFile(`fid-${TEST_FID}-persona.png`, imageBase64);
    
    const overallDuration = (Date.now() - overallStartTime) / 1000;
    console.log(`\n✨ Complete! All files saved to: ${OUTPUT_DIR}`);
    console.log(`⏱️  Total execution time: ${overallDuration.toFixed(2)} seconds\n`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();
