import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY environment variable is not set. OpenAI API calls will fail.");
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY || '',
});


/**
 * Converts Farcaster timestamp to human readable date
 * @param {number} farcasterTimestamp - Seconds since Jan 1, 2021
 * @returns {Date} JavaScript Date object
 */
function farcasterToDate(farcasterTimestamp) {
  const FARCASTER_EPOCH = 1609459200; // Unix timestamp for Jan 1, 2021 00:00:00 UTC
  return new Date((farcasterTimestamp + FARCASTER_EPOCH) * 1000);
}

// Define the schema for AI analysis
const CastAnalysis = z.object({
  facts: z.array(z.string()).describe("5-7 personalized fun facts about the user, plain text no formatting, no markdown, direct and to the point"),
  artStyle: z.string().describe("Art style/theme that matches their personality (e.g., 'cyberpunk neon aesthetic', 'watercolor impressionism', 'minimalist geometric'), plain text, no explaination")
});

/**
 * Uses AI to analyze casts and generate interesting fun facts
 * @param {Array<{text: string, timestamp: number}>} castsWithTimestamps - Casts with timestamps
 * @param {object} userData - User profile data
 * @returns {Promise<Array<string>>} Array of AI-generated fun facts
 */
async function generateAIFunFacts(castsWithTimestamps, userData) {
  if (!castsWithTimestamps || castsWithTimestamps.length === 0) return [];
  
  try {
    // Sort by timestamp to get earliest and latest
    const sortedCasts = [...castsWithTimestamps].sort((a, b) => a.timestamp - b.timestamp);
    // last 300 of the sorted casts
    const filteredCasts = sortedCasts.slice(-300);
    
    const prompt = `Analyze these Farcaster posts from ${userData.username} and generate 5-7 interesting, personalized fun facts about their posting style, personality, interests, or patterns. Make them engaging and specific to this user. No need to make them superlatives or super nice, be direct and tell them what you see.

Sample of their posts:
${filteredCasts.map(cast => cast.text).join('\n---\n')}

Generate fun facts that are:
- Specific and personalized (not generic)
- Interesting observations about their personality or interests
- Playful and engaging
- About 1-2 sentences each
- Varied in topic (posting patterns, interests, writing style, etc.)

Speak directly to the user in the first person.

Also analyze their overall vibe and suggest an art style/theme that would best represent them visually. Consider their interests, tone, and personality.`;

    const response = await openai.chat.completions.parse({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 500,
      response_format: zodResponseFormat(CastAnalysis, "cast_analysis")
    });

    const analysis = response.choices[0].message.parsed;
    
    return {
      facts: analysis.facts || [],
      artStyle: analysis.artStyle || null
    };
  } catch (error) {
    console.error('Error generating AI fun facts:', error);
    // Fallback to basic stats if AI fails
    return generateBasicFacts(castsWithTimestamps);
  }
}

/**
 * Generates basic statistical facts as a fallback
 * @param {Array<{text: string, timestamp: number}>} castsWithTimestamps - Casts with timestamps
 * @returns {Array<string>} Array of basic fun facts
 */
function generateBasicFacts(castsWithTimestamps) {
  if (!castsWithTimestamps || castsWithTimestamps.length === 0) return [];
  
  const facts = [];
  
  // Sort by timestamp to get earliest and latest
  const sortedCasts = [...castsWithTimestamps].sort((a, b) => a.timestamp - b.timestamp);
  const earliestCast = sortedCasts[0];
  const latestCast = sortedCasts[sortedCasts.length - 1];
  
  // Format dates
  const earliestDate = farcasterToDate(earliestCast.timestamp);
  const latestDate = farcasterToDate(latestCast.timestamp);
  
  facts.push(`Your earliest cast was on ${earliestDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
  facts.push(`Your most recent cast was on ${latestDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
  
  // Calculate posting frequency
  const daysDiff = (latestDate - earliestDate) / (1000 * 60 * 60 * 24);
  const postsPerDay = castsWithTimestamps.length / daysDiff;
  facts.push(`You post an average of ${postsPerDay.toFixed(1)} casts per day`);
  
  return { facts, artStyle: null };
}

/**
 * Creates a streaming response for image generation
 * @param {string | null} bio - The user's Farcaster bio
 * @param {string[]} casts - An array of the user's recent cast texts
 * @param {object} userData - User profile data (username, display_name, pfp_url)
 * @param {Array<{text: string, timestamp: number}>} castsWithTimestamps - Casts with timestamp data
 * @returns {Promise<ReadableStream>} A stream that yields image generation events
 */
export async function* generateUserImageStream(bio, casts, userData, castsWithTimestamps = []) {
  if (!OPENAI_API_KEY) {
    yield { error: "OPENAI_API_KEY is not set" };
    return;
  }

  const MIN_CASTS = 10;
  let currentCasts = [...casts];
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (attempts < MAX_ATTEMPTS && currentCasts.length >= MIN_CASTS) {
    try {
      attempts++;
      console.log(`Starting generation with ${currentCasts.length} posts...`);

      // Build content array with user context
      const contentArray = [
        { 
          type: "input_text", 
          text: `User Profile:
- Username: ${userData.username}
- Display Name: ${userData.display_name || userData.username}
- Bio: ${bio || 'No bio provided'}

All Posts (${currentCasts.length} total):
${currentCasts.join('\n---\n')}`
        }
      ];

      // Add profile picture if available
      if (userData.pfp_url) {
        try {
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
          console.warn('Failed to fetch profile picture:', error);
        }
      }

      console.log('Generating image...');
      yield { type: "status", message: `Analyzing ${currentCasts.length} top level casts to create your visual representation...` };

      // Generate AI analysis first to get art style
      let artStyleDescription = "";
      let analysisResult = null;
      
      if (castsWithTimestamps && castsWithTimestamps.length > 0) {
        
        try {
          analysisResult = await generateAIFunFacts(castsWithTimestamps.slice(0, currentCasts.length), userData);
          
          if (analysisResult && analysisResult.artStyle) {
            artStyleDescription = ` The art style should be: ${analysisResult.artStyle}.`;
            console.log('Art style determined:', analysisResult.artStyle);
          }
        } catch (error) {
          console.error('Error generating AI analysis:', error);
        }
      }

      const imagePrompt = `Based on this Farcaster user's personality, interests, and posts, create a unique visual representation that captures their essence. ${artStyleDescription}. Be sure to incorporate their personality into the background of the image too. Refer to their attached profile picture for reference. Note: While this is from a crypto-centric social network, don't overemphasize crypto/web3 aspects unless they're truly dominant in the user's posts.`;

      // Add image prompt
      contentArray.push({ type: "input_text", text: imagePrompt });

      yield { type: "status", message: "Creating your unique visual representation..." };

      // Store facts to send while image generates
      const pendingFacts = analysisResult && analysisResult.facts ? [...analysisResult.facts] : [];
      
      // Start image generation (this will take 20-30 seconds)
      const imageGenerationPromise = openai.responses.create({
        model: "gpt-4.1-nano",
        input: [
          {
            role: "user",
            content: contentArray
          }
        ],
        tools: [{ 
          type: "image_generation",
          quality: "high",
          size: "1024x1024",
        }],
      });

      // Send fun facts while waiting for image
      while (pendingFacts.length > 0) {
        // Check if image is done
        const isImageDone = await Promise.race([
          imageGenerationPromise.then(() => true),
          new Promise(resolve => setTimeout(() => resolve(false), 100))
        ]);
        
        if (isImageDone) break;
        
        // Send next fact
        yield { type: "fun_fact", message: pendingFacts.shift() };
        
        // Wait 15 seconds before next fact (or until image is done)
        await Promise.race([
          imageGenerationPromise,
          new Promise(resolve => setTimeout(resolve, 15000))
        ]);
      }

      // Wait for image generation to complete
      const response = await imageGenerationPromise;

      console.log('Response received');

      // Extract final image from completed response
      const finalImage = response.output
        .filter((output) => output.type === "image_generation_call")
        .map((output) => output.result);
      
      if (finalImage.length > 0) {
        console.log('Final image received');
        yield {
          type: "final_image",
          imageBase64: finalImage[0],
          castsUsed: currentCasts.length,
          timestamp: new Date().toISOString(),
          artStyle: analysisResult?.artStyle || null
        };
        return; // Success!
      }

    } catch (error) {
      console.error(`Streaming error (attempt ${attempts}):`, error);
      
      if (error.message && (error.message.includes('token') || error.message.includes('limit'))) {
        const removeCount = Math.max(1, Math.floor(currentCasts.length * 0.2));
        currentCasts = currentCasts.slice(removeCount);
        yield { 
          type: "status", 
          message: `Adjusting content size... Retrying with ${currentCasts.length} posts` 
        };
        
        if (currentCasts.length < MIN_CASTS) {
          yield { type: "error", message: "Not enough posts to generate image" };
          return;
        }
      } else {
        yield { type: "error", message: error.message };
        return;
      }
    }
  }

  yield { type: "error", message: "Failed to generate image after maximum attempts" };
}