import { GoogleGenerativeAI } from '@google/generative-ai';

const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  return new GoogleGenerativeAI(apiKey);
};

const generateWithPrompt = async (prompt: string): Promise<string> => {
  const genAI = getGenAI();
  const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Clean up the response (remove quotes if wrapped)
    let content = text.trim();
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    if (content.startsWith("'") && content.endsWith("'")) {
      content = content.slice(1, -1);
    }
    
    return content.trim();
  } catch (error: any) {
    console.error('Gemini API error:', error);
    
    // Provide more specific error messages
    if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
      throw new Error('Gemini API key is invalid or API is not enabled. Please check your API key in Google Cloud Console.');
    }
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      throw new Error('Gemini API key is invalid or expired. Please check your API key.');
    }
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      throw new Error('Gemini API quota exceeded. Please check your usage limits.');
    }
    
    throw new Error(`Failed to generate content: ${error.message || 'Unknown error'}`);
  }
};

export const generatePost = async (summary: string, projectName?: string): Promise<string> => {
  const characterLimit = parseInt(process.env.X_CHARACTER_LIMIT || '280', 10);
  const prefix = projectName ? `${projectName} Updates\n\n` : '';
  const prefixLength = prefix.length;
  const maxPostLength = characterLimit - prefixLength;
  
  const prompt = `You are a professional social media content creator. Based on the following summary, create an engaging Twitter/X post.

CRITICAL REQUIREMENTS:
- Your post content must be EXACTLY under ${maxPostLength} characters (not ${maxPostLength} or more)
- Write complete, grammatically correct sentences
- Do NOT truncate or cut off mid-sentence
- The post will be prefixed with "${projectName ? projectName + ' Updates\\n\\n' : ''}" which is ${prefixLength} characters
- The total length (prefix + your content) must be under ${characterLimit} characters
- If you cannot fit everything in ${maxPostLength} characters, prioritize the most important points and write complete sentences

STRICT PROHIBITIONS:
- DO NOT mention commit message names or commit titles
- DO NOT mention specific file names (like "App.tsx", "index.js", etc.)
- DO NOT mention technical file paths or directory structures
- DO NOT quote or reference commit messages directly
- Focus on WHAT was accomplished, not HOW (file names are implementation details)

Guidelines:
- Use a natural, conversational but professional tone
- Make it interesting and shareable
- Do not use emojis
- Do not use markdown formatting like asterisks, bold, or italics
- Write in plain text only
- Do not use hashtags
- Be authentic and genuine
- Focus on accomplishments, features, improvements, or fixes in general terms
- Describe the impact or value, not the technical implementation details
- Always end with a complete sentence
- Write as if describing the work to a general audience, not developers

Summary:
${summary}

Generate a professional Twitter/X post in plain text (without the prefix, it will be added automatically). Your post must be a complete message under ${maxPostLength} characters with full sentences. Focus on what was accomplished, not commit names or file names:`;

  let post = await generateWithPrompt(prompt);
  post = post.trim();
  
  // If post is too long, regenerate with a more strict prompt
  if (post.length > maxPostLength) {
    const stricterPrompt = `You are a professional social media content creator. Based on the following summary, create a SHORT, engaging Twitter/X post.

CRITICAL: Your post must be UNDER ${maxPostLength} characters. Write complete sentences only. Do not exceed this limit.

STRICT PROHIBITIONS:
- DO NOT mention commit message names or commit titles
- DO NOT mention specific file names (like "App.tsx", "index.js", etc.)
- DO NOT mention technical file paths
- Focus on WHAT was accomplished, not HOW or WHERE (file names are implementation details)

Summary:
${summary}

Generate a very concise professional Twitter/X post (under ${maxPostLength} characters, complete sentences only). Focus on accomplishments, not commit names or file names:`;
    
    post = await generateWithPrompt(stricterPrompt);
    post = post.trim();
  }
  
  // Final check - if still too long, intelligently truncate at sentence boundary
  if (post.length > maxPostLength) {
    // Find the last complete sentence that fits
    const sentences = post.match(/[^.!?]+[.!?]+/g) || [];
    let truncated = '';
    for (const sentence of sentences) {
      const test = truncated + sentence;
      if (test.length <= maxPostLength) {
        truncated = test;
      } else {
        break;
      }
    }
    if (truncated) {
      post = truncated.trim();
    } else {
      // Fallback: truncate at word boundary
      const words = post.split(' ');
      truncated = '';
      for (const word of words) {
        const test = truncated + (truncated ? ' ' : '') + word;
        if (test.length <= maxPostLength) {
          truncated = test;
        } else {
          break;
        }
      }
      post = truncated.trim();
    }
  }
  
  // Add project name prefix if provided
  if (projectName) {
    return `${projectName} Updates\n\n${post}`;
  }
  
  return post;
};

export const generateSummary = async (commitsAnalysis: string): Promise<string> => {
  const prompt = `Analyze these GitHub commits and their file changes. Provide a professional summary of what was actually accomplished, what features were built, what bugs were fixed, or what improvements were made. Focus on the actual work done, NOT commit message names.

IMPORTANT:
- Do NOT include commit message names or titles in your summary
- Do NOT quote commit messages
- Focus on analyzing the file changes to understand what was actually done
- Describe the work in general terms, not specific file names
- Explain what was accomplished, not what files were changed

Guidelines:
- Analyze the file changes (additions, deletions, file types) to understand what actually happened
- Describe the technical work, features, fixes, or improvements in general terms
- Be specific about what was built or changed, but avoid mentioning file names
- Use professional language
- Do not use emojis
- Do not use markdown formatting like asterisks or bold
- Write in plain text only
- Focus on accomplishments and technical achievements
- Write as if explaining to someone who doesn't need to know file names

Commits and changes:
${commitsAnalysis}

Provide a concise professional summary of the work accomplished. Do not include commit message names or file names:`;

  return generateWithPrompt(prompt);
};
