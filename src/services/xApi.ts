import { TwitterApi } from 'twitter-api-v2';

let client: TwitterApi | null = null;

const getClient = (): TwitterApi => {
  if (!client) {
    const appKey = process.env.X_API_KEY;
    const appSecret = process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!appKey || !appSecret) {
      throw new Error('X API credentials (X_API_KEY and X_API_SECRET) are required');
    }

    if (!accessToken || !accessSecret) {
      throw new Error('X API access tokens (X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET) are required. Please complete OAuth flow or generate tokens from Twitter Developer Portal.');
    }

    client = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
  }
  return client;
};

export const postToX = async (text: string): Promise<void> => {
  try {
    const characterLimit = parseInt(process.env.X_CHARACTER_LIMIT || '280', 10);
    // Validate text length
    if (text.length > characterLimit) {
      throw new Error(`Post text exceeds ${characterLimit} characters`);
    }

    const twitterClient = getClient();
    const rwClient = twitterClient.readWrite;
    await rwClient.v2.tweet(text);
  } catch (error: any) {
    console.error('X API error:', error);
    
    // Handle specific error cases
    if (error?.code === 402 || error?.data?.title === 'CreditsDepleted') {
      throw new Error('Your X account does not have credits available. The free tier includes 1,500 posts per month. Please check: 1) Go to developer.twitter.com/en/portal/dashboard, 2) Navigate to "Billing" or "Usage" section, 3) Ensure you are enrolled in the Free tier, 4) Check if you need to accept updated terms or activate the free tier.');
    }
    
    if (error?.code === 403) {
      throw new Error('Your app does not have write permissions. Please update your app permissions to "Read and write" in the Twitter Developer Portal.');
    }
    
    if (error?.code === 401) {
      throw new Error('X API authentication failed. Please check your API credentials.');
    }
    
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error(`Failed to post to X: ${error?.message || 'Unknown error'}`);
  }
};
