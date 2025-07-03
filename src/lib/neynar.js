// Snapchain API configuration
const SNAPCHAIN_HTTP_API_URL = process.env.SNAPCHAIN_HTTP_API_URL;

if (!SNAPCHAIN_HTTP_API_URL) {
  console.warn("SNAPCHAIN_HTTP_API_URL environment variable is not set. Cast fetching will fail.");
}

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/user/bulk';
const NEYNAR_CASTS_API_URL = 'https://api.neynar.com/v2/farcaster/feed/user/casts';

if (!NEYNAR_API_KEY) {
  console.warn("NEYNAR_API_KEY environment variable is not set. Neynar API calls will fail.");
}

/**
 * Fetches user data from the Neynar API for a given FID.
 * @param {number} fid - The Farcaster ID of the user.
 * @returns {Promise<object | null>} The user data object or null if an error occurs.
 */
export async function getUserDataFromNeynar(fid) {
  if (!NEYNAR_API_KEY) {
    console.error("Cannot fetch from Neynar: NEYNAR_API_KEY is not set.");
    return null;
  }
  if (!fid || typeof fid !== 'number') {
    console.error("Invalid FID provided to getUserDataFromNeynar:", fid);
    return null;
  }

  const url = `${NEYNAR_API_URL}?fids=${fid}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'api_key': NEYNAR_API_KEY,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Neynar API request failed with status ${response.status}: ${errorBody}`);
      return null;
    }

    const data = await response.json();

    // The API returns an array of users, even for a single FID
    if (data.users && data.users.length > 0) {
        // Return the first user object
        return data.users[0];
    } else {
        console.warn(`No user data found for FID ${fid} in Neynar response.`);
        return null;
    }

  } catch (error) {
    console.error('Error fetching user data from Neynar:', error);
    return null;
  }
}

/**
 * Fetches the text of recent casts for a given FID using Snapchain API endpoint.
 * This API returns lifetime casts for better analysis.
 * Filters out replies (casts with parentCastId).
 * @param {number} fid - The Farcaster ID of the user.
 * @param {number} maxCasts - Maximum number of casts to fetch (for token limit management).
 * @returns {Promise<string[]>} An array of cast texts, or empty array if an error occurs.
 */
export async function getRecentCastTexts(fid, maxCasts = Infinity) {
  if (!SNAPCHAIN_HTTP_API_URL) {
    console.error("Cannot fetch casts: SNAPCHAIN_HTTP_API_URL is not set.");
    return [];
  }
  
  if (!fid || typeof fid !== 'number') {
    console.error("Invalid FID provided to getRecentCastTexts:", fid);
    return [];
  }

  let allCastTexts = [];
  let nextPageToken = null;
  
  console.log(`Fetching casts for FID ${fid} from Snapchain API...`);

  // Keep fetching until we reach maxCasts or run out of pages
  while (allCastTexts.length < maxCasts) {
    const params = new URLSearchParams({
      fid: fid.toString()
    });
    
    if (nextPageToken) {
      params.append('pageToken', nextPageToken);
    }

    const url = `${SNAPCHAIN_HTTP_API_URL}?${params.toString()}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json'
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Snapchain API request failed with status ${response.status}: ${errorBody}`);
        break;
      }

      const data = await response.json();

      if (data.messages && data.messages.length > 0) {
        // Filter out replies (parentCastId !== null) and extract text
        const texts = data.messages
          .filter(msg => 
            msg.data?.castAddBody?.text && 
            msg.data?.castAddBody?.parentCastId === null
          )
          .map(msg => msg.data.castAddBody.text)
          .filter(Boolean);
        
        allCastTexts = allCastTexts.concat(texts);
        console.log(`Fetched ${texts.length} cast texts (excluding replies). Total: ${allCastTexts.length}`);
      } else {
        console.log("No more casts found.");
        break;
      }

      // Check for next page
      nextPageToken = data.nextPageToken;
      if (!nextPageToken) {
        console.log("No next page token found, all casts fetched.");
        break;
      }

    } catch (error) {
      console.error('Error fetching casts from Snapchain API:', error);
      break;
    }
  }

  // Trim to maxCasts if we fetched more
  if (allCastTexts.length > maxCasts) {
    allCastTexts = allCastTexts.slice(0, maxCasts);
    console.log(`Trimmed casts to ${maxCasts} maximum.`);
  }

  console.log(`Finished fetching casts. Total texts: ${allCastTexts.length}`);
  return allCastTexts;
}

/**
 * Fetches casts with timestamps for a given FID using Snapchain API endpoint.
 * @param {number} fid - The Farcaster ID of the user.
 * @param {number} maxCasts - Maximum number of casts to fetch.
 * @returns {Promise<Array<{text: string, timestamp: number}>>} An array of cast objects with text and timestamp.
 */
export async function getRecentCastsWithTimestamps(fid, maxCasts = Infinity) {
  if (!SNAPCHAIN_HTTP_API_URL) {
    console.error("Cannot fetch casts: SNAPCHAIN_HTTP_API_URL is not set.");
    return [];
  }
  
  if (!fid || typeof fid !== 'number') {
    console.error("Invalid FID provided to getRecentCastsWithTimestamps:", fid);
    return [];
  }

  let allCasts = [];
  let nextPageToken = null;
  
  console.log(`Fetching casts with timestamps for FID ${fid} from Snapchain API...`);

  // Keep fetching until we reach maxCasts or run out of pages
  while (allCasts.length < maxCasts) {
    const params = new URLSearchParams({
      fid: fid.toString()
    });
    
    if (nextPageToken) {
      params.append('pageToken', nextPageToken);
    }

    const url = `${SNAPCHAIN_HTTP_API_URL}?${params.toString()}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json'
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Snapchain API request failed with status ${response.status}: ${errorBody}`);
        break;
      }

      const data = await response.json();

      if (data.messages && data.messages.length > 0) {
        // Filter out replies (parentCastId !== null) and extract text with timestamp
        const casts = data.messages
          .filter(msg => 
            msg.data?.castAddBody?.text && 
            msg.data?.castAddBody?.parentCastId === null
          )
          .map(msg => ({
            text: msg.data.castAddBody.text,
            timestamp: msg.data.timestamp
          }))
          .filter(cast => cast.text && cast.timestamp);
        
        allCasts = allCasts.concat(casts);
        console.log(`Fetched ${casts.length} casts with timestamps. Total: ${allCasts.length}`);
      } else {
        console.log("No more casts found.");
        break;
      }

      // Check for next page
      nextPageToken = data.nextPageToken;
      if (!nextPageToken) {
        console.log("No next page token found, all casts fetched.");
        break;
      }

    } catch (error) {
      console.error('Error fetching casts from Snapchain API:', error);
      break;
    }
  }

  // Trim to maxCasts if we fetched more
  if (allCasts.length > maxCasts) {
    allCasts = allCasts.slice(0, maxCasts);
    console.log(`Trimmed casts to ${maxCasts} maximum.`);
  }

  console.log(`Finished fetching casts. Total: ${allCasts.length}`);
  return allCasts;
} 