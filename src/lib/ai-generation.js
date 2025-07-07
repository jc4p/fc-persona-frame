import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Initialize clients
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY environment variable is not set. OpenAI API calls will fail.");
}

if (!GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY environment variable is not set. Gemini API calls will fail.");
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY || '',
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');

// Schema for AI analysis (OpenAI format)
const CastAnalysis = z.object({
  facts: z.array(z.string()).describe("5-7 personalized fun facts about the user, plain text no formatting, no markdown, direct and to the point"),
  artStyle: z.string().describe("Art style/theme that matches their personality (e.g., 'cyberpunk neon aesthetic', 'watercolor impressionism', 'minimalist geometric'), plain text, no explaination")
});

// Gemini schema for cast analysis
const castAnalysisGeminiSchema = {
  type: SchemaType.OBJECT,
  properties: {
    facts: {
      type: SchemaType.ARRAY,
      description: "5-7 personalized fun facts about the user, plain text no formatting, no markdown, direct and to the point",
      items: {
        type: SchemaType.STRING,
        description: "A personalized fun fact about the user",
      },
      minItems: 5,
      maxItems: 7,
    },
    artStyle: {
      type: SchemaType.STRING,
      description: "Art style/theme that matches their personality (e.g., 'cyberpunk neon aesthetic', 'watercolor impressionism', 'minimalist geometric'), plain text, no explanation",
    },
  },
  required: ["facts", "artStyle"],
};

/**
 * Converts Farcaster timestamp to human readable date
 * @param {number} farcasterTimestamp - Seconds since Jan 1, 2021
 * @returns {Date} JavaScript Date object
 */
function farcasterToDate(farcasterTimestamp) {
  const FARCASTER_EPOCH = 1609459200; // Unix timestamp for Jan 1, 2021 00:00:00 UTC
  return new Date((farcasterTimestamp + FARCASTER_EPOCH) * 1000);
}

/**
 * Generate AI analysis with Gemini with retry logic
 * @param {Array<{text: string, timestamp: number}>} castsWithTimestamps - Casts with timestamps
 * @param {object} userData - User profile data
 * @returns {Promise<{facts: Array<string>, artStyle: string}>} Analysis result
 */
async function generateAIAnalysisWithGemini(castsWithTimestamps, userData) {
  // console.log('Generating AI analysis with Gemini...');
  
  let currentCasts = [...castsWithTimestamps];
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  const MIN_CASTS = 10;
  
  while (attempts < MAX_ATTEMPTS && currentCasts.length >= MIN_CASTS) {
    try {
      attempts++;
      // console.log(`  Analyzing ${currentCasts.length} casts (attempt ${attempts})...`);
      
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

Also analyze their overall vibe and suggest an art style/theme that would best represent them visually. Consider their interests, tone, and personality. DO NOT INCLUDE REALISM OR HYPERREALISM AS A STYLE.`;

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: castAnalysisGeminiSchema,
        },
      });

      const result = await model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();
      const parsedResponse = JSON.parse(responseText);
      
      return parsedResponse;
      
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

/**
 * Uses AI to analyze casts and generate interesting fun facts (with OpenAI fallback)
 * @param {Array<{text: string, timestamp: number}>} castsWithTimestamps - Casts with timestamps
 * @param {object} userData - User profile data
 * @returns {Promise<{facts: Array<string>, artStyle: string}>} Analysis result
 */
async function generateAIFunFacts(castsWithTimestamps, userData) {
  if (!castsWithTimestamps || castsWithTimestamps.length === 0) return generateBasicFacts(castsWithTimestamps);
  
  // Try Gemini first
  if (GEMINI_API_KEY) {
    try {
      return await generateAIAnalysisWithGemini(castsWithTimestamps, userData);
    } catch (error) {
      console.error('Gemini analysis failed, falling back to OpenAI:', error.message);
    }
  }
  
  // Fallback to OpenAI
  let currentCasts = [...castsWithTimestamps];
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  const MIN_CASTS = 10;
  
  while (attempts < MAX_ATTEMPTS && currentCasts.length >= MIN_CASTS) {
    try {
      attempts++;
      console.log(`Analyzing ${currentCasts.length} casts with OpenAI (attempt ${attempts})...`);
      
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

Also analyze their overall vibe and suggest an art style/theme that would best represent them visually. Consider their interests, tone, and personality. DO NOT INCLUDE REALISM OR HYPERREALISM AS A STYLE.`;

      const response = await openai.chat.completions.parse({
        model: "gpt-4o-mini",
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
      console.error(`AI analysis error (attempt ${attempts}):`, error);
      
      if (error.message && (error.message.includes('token') || error.message.includes('limit'))) {
        // Reduce casts by 20% from the beginning (keep most recent)
        const removeCount = Math.max(1, Math.floor(currentCasts.length * 0.2));
        currentCasts = currentCasts.slice(removeCount);
        console.log(`Reducing to ${currentCasts.length} casts and retrying...`);
        
        if (currentCasts.length < MIN_CASTS) {
          console.error('Not enough posts to generate analysis');
          return generateBasicFacts(castsWithTimestamps);
        }
      } else {
        console.error('Error generating AI fun facts:', error);
        return generateBasicFacts(castsWithTimestamps);
      }
    }
  }
  
  console.error('Failed to generate AI analysis after maximum attempts');
  return generateBasicFacts(castsWithTimestamps);
}

/**
 * Generates basic statistical facts as a fallback
 * @param {Array<{text: string, timestamp: number}>} castsWithTimestamps - Casts with timestamps
 * @returns {{facts: Array<string>, artStyle: string|null}} Basic fun facts
 */
function generateBasicFacts(castsWithTimestamps) {
  if (!castsWithTimestamps || castsWithTimestamps.length === 0) return { facts: [], artStyle: null };
  
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
 * Generate persona image with retry logic
 * @param {object} userData - User profile data
 * @param {Array<string>} castTexts - Array of cast texts
 * @param {string} artStyle - Art style description
 * @returns {Promise<string>} Base64 encoded image
 */
async function generatePersonaImage(userData, castTexts, artStyle) {
  // console.log('Generating persona image...');
  // console.log(`  Art style: ${artStyle}`);
  
  let currentCastTexts = [...castTexts];
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  const MIN_CASTS = 10;
  
  while (attempts < MAX_ATTEMPTS && currentCastTexts.length >= MIN_CASTS) {
    try {
      attempts++;
      // console.log(`  Starting generation with ${currentCastTexts.length} posts (attempt ${attempts})...`);
      
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
          // console.log('  Fetching profile picture...');
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
      
      const finalImage = response.output
        .filter((output) => output.type === "image_generation_call")
        .map((output) => output.result);
      
      if (finalImage.length > 0) {
        // console.log(`  ✅ Image generated successfully with ${currentCastTexts.length} casts`);
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

/**
 * Creates a streaming response for image generation
 * @param {string | null} bio - The user's Farcaster bio
 * @param {string[]} casts - An array of the user's recent cast texts
 * @param {object} userData - User profile data (username, display_name, pfp_url)
 * @param {Array<{text: string, timestamp: number}>} castsWithTimestamps - Casts with timestamp data
 * @returns {AsyncGenerator} A stream that yields image generation events
 */
export async function* generateUserImageStream(bio, casts, userData, castsWithTimestamps = []) {
  if (!OPENAI_API_KEY) {
    yield { error: "OPENAI_API_KEY is not set" };
    return;
  }

  try {
    yield { type: "status", message: `Analyzing ${casts.length} top level casts to create your visual representation...` };

    // Generate AI analysis first to get art style
    let analysisResult = null;
    
    if (castsWithTimestamps && castsWithTimestamps.length > 0) {
      try {
        analysisResult = await generateAIFunFacts(castsWithTimestamps, userData);
      } catch (error) {
        console.error('Error generating AI analysis:', error);
      }
    }

    yield { type: "status", message: "Creating your unique visual representation..." };

    // Store facts to send while image generates
    const pendingFacts = analysisResult && analysisResult.facts ? [...analysisResult.facts] : [];
    
    // Start image generation (this will take 20-30 seconds)
    const imageGenerationPromise = generatePersonaImage(
      userData, 
      casts, 
      analysisResult?.artStyle || 'vibrant digital art style'
    );

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
    const imageBase64 = await imageGenerationPromise;

    yield {
      type: "final_image",
      imageBase64: imageBase64,
      castsUsed: casts.length,
      timestamp: new Date().toISOString(),
      artStyle: analysisResult?.artStyle || null
    };

  } catch (error) {
    console.error('Streaming error:', error);
    yield { type: "error", message: error.message };
  }
}