import { Client, GatewayIntentBits, Message } from 'discord.js';
import { getRecentCommitsFromRepos, CommitInfo } from './github';
import { generatePost, generateSummary } from './gemini';
import { postToX } from './xApi';

interface UserState {
  commits: CommitInfo[];
  selectedCommits: CommitInfo[];
  generatedSummary: string | null;
  generatedPost: string | null;
  projectName?: string;
  pendingPost?: boolean; // True if waiting for !post or !no
}

const userStates = new Map<string, UserState>();
const lastCheckedCommits = new Map<string, string>(); // repo -> last commit SHA
let commitCheckInterval: NodeJS.Timeout | null = null;

const sendLongMessage = async (channel: any, content: string, maxLength?: number) => {
  const messageMaxLength = maxLength || parseInt(process.env.DISCORD_MAX_MESSAGE_LENGTH || '2000', 10);
  if (content.length <= messageMaxLength) {
    await channel.send(content);
    return;
  }

  const chunks = content.match(new RegExp(`.{1,${messageMaxLength - 10}}`, 'g')) || [];
  for (let i = 0; i < chunks.length; i++) {
    await channel.send(chunks[i]);
  }
};

const checkForNewCommits = async (client: Client, channelId: string) => {
  try {
    const githubRepos = process.env.GITHUB_REPOS;
    if (!githubRepos) return;

    const repos = githubRepos.split(',').map((r) => r.trim()).filter(Boolean);
    const githubToken = process.env.GITHUB_TOKEN;
    const channel = await client.channels.fetch(channelId);
    
    if (!channel || !channel.isTextBased()) return;

    // Fetch latest commit from each repo
    const commits = await getRecentCommitsFromRepos(repos, githubToken, 1);
    
    for (const commit of commits) {
      const lastSha = lastCheckedCommits.get(commit.repo);
      
      // If this is a new commit (or first time checking)
      if (!lastSha || lastSha !== commit.sha) {
        lastCheckedCommits.set(commit.repo, commit.sha);
        
        // Only process if we've checked before (avoid processing on first run)
        if (lastSha) {
          await processNewCommit(commit, channel, githubToken);
        }
      }
    }
  } catch (error) {
    console.error('Error checking for new commits:', error);
  }
};

const processNewCommit = async (commit: CommitInfo, channel: any, githubToken?: string) => {
  try {
    // Build commit analysis
    const commitsAnalysis = `Repository: ${commit.repo}\nCommit: ${commit.message}\n${
      commit.files && commit.files.length > 0
        ? `Files changed:\n${commit.files.map((f) => `- ${f.filename} (${f.status}): +${f.additions} -${f.deletions} lines`).join('\n')}`
        : ''
    }`;

    // Generate summary
    const summary = await generateSummary(commitsAnalysis);
    
    // Get project name and capitalize it
    const defaultProjectName = process.env.DISCORD_DEFAULT_PROJECT_NAME || 'Project';
    const repoName = commit.repo.split('/')[1] || defaultProjectName;
    const projectName = repoName.charAt(0).toUpperCase() + repoName.slice(1).toLowerCase();

    // Generate post
    const post = await generatePost(summary, projectName);

    // Store in a default user state (we'll use a system user ID or channel-based state)
    // For simplicity, we'll use channel-based state
    const stateKey = `auto-${channel.id}`;
    const state: UserState = {
      commits: [commit],
      selectedCommits: [commit],
      generatedSummary: summary,
      generatedPost: post,
      projectName,
      pendingPost: true,
    };
    userStates.set(stateKey, state);

    // Send the generated post and ask for confirmation in one message
    const postMessage = `New commit detected in ${commit.repo}\n\n**Generated Post:**\n\`\`\`\n${post}\n\`\`\`\n\nUse \`!post\` to post this to X, or \`!no\` to discard.`;
    await channel.send(postMessage);
  } catch (error) {
    console.error('Error processing new commit:', error);
    await channel.send(`Error generating post: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const startDiscordBot = async () => {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;

  if (!token) {
    console.log('Discord bot token not configured. Skipping Discord bot startup.');
    return;
  }

  if (!channelId) {
    console.log('Discord channel ID not configured. Skipping Discord bot startup.');
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`);
    
    // Initialize last checked commits (fetch current commits to set baseline)
    const initCommits = async () => {
      try {
        const githubRepos = process.env.GITHUB_REPOS;
        if (!githubRepos) return;

        const repos = githubRepos.split(',').map((r) => r.trim()).filter(Boolean);
        const githubToken = process.env.GITHUB_TOKEN;
        const commits = await getRecentCommitsFromRepos(repos, githubToken, 1);
        
        for (const commit of commits) {
          lastCheckedCommits.set(commit.repo, commit.sha);
        }
        
        console.log('Initialized commit tracking');
      } catch (error) {
        console.error('Error initializing commit tracking:', error);
      }
    };
    
    initCommits();
    
    // Check for new commits at configured interval
    const checkInterval = parseInt(process.env.DISCORD_COMMIT_CHECK_INTERVAL_MS || '30000', 10);
    commitCheckInterval = setInterval(() => {
      checkForNewCommits(client, channelId);
    }, checkInterval);
  });

  client.on('messageCreate', async (message: Message) => {
    // Ignore bot messages and messages not in the configured channel
    if (message.author.bot || message.channel.id !== channelId) {
      return;
    }

    const userId = message.author.id;
    const content = message.content.trim();

    // !help command
    if (content === '!help') {
      const helpText = `**Available Commands:**

\`!run\` - Fetch and display the 5 latest commits from all repositories
\`!repo <numbers>\` - Select commits by number and generate a post (e.g., \`!repo 1\` or \`!repo 1,2\`)
\`!redo\` - Regenerate the post from the current summary
\`!post\` - Post the generated content to X
\`!no\` - Discard the current post
\`!help\` - Show this help message

**Automatic Features:**
- The bot automatically checks for new commits every 30 seconds
- When a new commit is detected, a post is generated and you'll be asked to confirm with \`!post\` or \`!no\``;
      
      await message.reply(helpText);
      return;
    }

    // !run command - fetch and show 5 latest commits
    if (content === '!run') {
      try {
        const githubRepos = process.env.GITHUB_REPOS;
        if (!githubRepos) {
          await message.reply('GitHub repositories not configured in .env');
          return;
        }

        const repos = githubRepos.split(',').map((r) => r.trim()).filter(Boolean);
        const githubToken = process.env.GITHUB_TOKEN;

        // Fetch commits from all repos
        const commits = await getRecentCommitsFromRepos(repos, githubToken, 5);

        if (commits.length === 0) {
          await message.reply('No commits found');
          return;
        }

        // Store commits in user state
        userStates.set(userId, {
          commits,
          selectedCommits: [],
          generatedSummary: null,
          generatedPost: null,
          pendingPost: false,
        });

        // Format commits list
        const commitsList = commits.map((commit, index) => {
          const shortMessage = commit.message.length > 60 
            ? commit.message.substring(0, 60) + '...' 
            : commit.message;
          return `${index + 1} - ${commit.repo}: ${shortMessage}`;
        }).join('\n');

        await message.reply(`Latest commits:\n\`\`\`\n${commitsList}\n\`\`\`\nUse \`!repo <numbers>\` to select commits (e.g., \`!repo 1\` or \`!repo 1,2\`)`);
      } catch (error) {
        console.error('Error in !run command:', error);
        await message.reply(`Error: ${error instanceof Error ? error.message : 'Failed to fetch commits'}`);
      }
      return;
    }

    // !repo command - select commits and generate summary
    if (content.startsWith('!repo ')) {
      try {
        const state = userStates.get(userId);
        if (!state || !state.commits || state.commits.length === 0) {
          await message.reply('Please run `!run` first to fetch commits');
          return;
        }

        const args = content.substring(6).trim();
        const selectedIndices = args.split(',').map((s) => parseInt(s.trim()) - 1).filter((n) => !isNaN(n) && n >= 0 && n < state.commits.length);

        if (selectedIndices.length === 0) {
          await message.reply('Invalid commit numbers. Use format: `!repo 1` or `!repo 1,2`');
          return;
        }

        const selectedCommits = selectedIndices.map((i) => state.commits[i]);
        state.selectedCommits = selectedCommits;
        state.pendingPost = false;

        // Build commit analysis
        const commitsAnalysis = selectedCommits.map((c) => {
          let analysis = `Repository: ${c.repo}\nCommit: ${c.message}\n`;
          
          if (c.files && c.files.length > 0) {
            analysis += `Files changed:\n`;
            c.files.forEach((file) => {
              analysis += `- ${file.filename} (${file.status}): +${file.additions} -${file.deletions} lines\n`;
            });
          }
          
          return analysis;
        }).join('\n---\n\n');

        // Generate summary using Gemini
        const summary = await generateSummary(commitsAnalysis);
        state.generatedSummary = summary;

        // Get project name from first commit's repo and capitalize it
        const defaultProjectName = process.env.DISCORD_DEFAULT_PROJECT_NAME || 'Project';
        const repoName = selectedCommits[0]?.repo.split('/')[1] || defaultProjectName;
        const projectName = repoName.charAt(0).toUpperCase() + repoName.slice(1).toLowerCase();
        state.projectName = projectName;

        // Generate post from summary with project name prefix
        const post = await generatePost(summary, projectName);
        state.generatedPost = post;
        state.pendingPost = true;

        // Send everything in one message
        const maxSummaryLength = parseInt(process.env.DISCORD_MAX_SUMMARY_LENGTH || '800', 10);
        const summaryText = summary.length > maxSummaryLength 
          ? summary.substring(0, maxSummaryLength) + '...' 
          : summary;
        
        const fullMessage = `**Summary:**\n\`\`\`\n${summaryText}\n\`\`\`\n\n**Generated Post:**\n\`\`\`\n${post}\n\`\`\`\n\nUse \`!post\` to post this to X, or \`!no\` to discard.`;
        
        // Send as one message, split if too long
        if (fullMessage.length <= 2000) {
          await message.reply(fullMessage);
        } else {
          // If too long, send post separately (most important)
          const postMessage = `**Generated Post:**\n\`\`\`\n${post}\n\`\`\`\n\nUse \`!post\` to post this to X, or \`!no\` to discard.`;
          await message.reply(postMessage);
        }
      } catch (error) {
        console.error('Error in !repo command:', error);
        await message.reply(`Error: ${error instanceof Error ? error.message : 'Failed to process commits'}`);
      }
      return;
    }

    // !redo command - regenerate the post
    if (content === '!redo') {
      try {
        const state = userStates.get(userId);
        if (!state || !state.generatedSummary) {
          // Check for auto-generated posts
          const autoStateKey = `auto-${message.channel.id}`;
          const autoState = userStates.get(autoStateKey);
          if (autoState && autoState.generatedSummary) {
            await regeneratePost(autoState, message, autoStateKey);
            return;
          }
          await message.reply('No post to regenerate. Please run `!repo <numbers>` first to generate a post.');
          return;
        }

        await regeneratePost(state, message, userId);
      } catch (error) {
        console.error('Error in !redo command:', error);
        await message.reply(`Error: ${error instanceof Error ? error.message : 'Failed to regenerate post'}`);
      }
      return;
    }

    // !no command - discard the post
    if (content === '!no') {
      try {
        const state = userStates.get(userId);
        if (!state || !state.generatedPost) {
          // Check for auto-generated posts
          const autoStateKey = `auto-${message.channel.id}`;
          const autoState = userStates.get(autoStateKey);
          if (autoState) {
            userStates.delete(autoStateKey);
            await message.reply('Post discarded.');
            return;
          }
          await message.reply('No post to discard.');
          return;
        }

        userStates.delete(userId);
        await message.reply('Post discarded.');
      } catch (error) {
        console.error('Error in !no command:', error);
        await message.reply(`Error: ${error instanceof Error ? error.message : 'Failed to discard post'}`);
      }
      return;
    }

    // !post command - post to X
    if (content === '!post') {
      try {
        let state = userStates.get(userId);
        if (!state || !state.generatedPost) {
          // Check for auto-generated posts
          const autoStateKey = `auto-${message.channel.id}`;
          state = userStates.get(autoStateKey);
          if (!state || !state.generatedPost) {
            await message.reply('No post generated. Please run `!repo <numbers>` first to generate a post.');
            return;
          }
          
          // Post and clean up auto state
          await postToX(state.generatedPost!);
          await message.reply('Successfully posted to X!');
          userStates.delete(autoStateKey);
          return;
        }

        await postToX(state.generatedPost);
        await message.reply('Successfully posted to X!');
        
        // Clear state after posting
        userStates.delete(userId);
      } catch (error) {
        console.error('Error in !post command:', error);
        await message.reply(`Error posting to X: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return;
    }
  });

  const regeneratePost = async (state: UserState, message: Message, stateKey: string) => {
    if (!state.generatedSummary || !state.projectName) {
      await message.reply('Cannot regenerate: missing summary or project name.');
      return;
    }

    const newPost = await generatePost(state.generatedSummary, state.projectName);
    state.generatedPost = newPost;
    state.pendingPost = true;

    const postMessage = `**Regenerated Post:**\n\`\`\`\n${newPost}\n\`\`\`\n\nUse \`!post\` to post this to X, or \`!no\` to discard.`;
    await message.reply(postMessage);
  };

  try {
    await client.login(token);
  } catch (error) {
    console.error('Error logging in Discord bot:', error);
  }
};
