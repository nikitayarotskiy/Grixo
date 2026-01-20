# Grixo

An AI-powered automation platform that transforms GitHub commits into engaging social media posts. Grixo monitors your repositories, analyzes code changes using Google's Gemini AI, and generates professional Twitter/X posts ready for publication.

## Overview

Grixo bridges the gap between your development work and social media presence by automatically creating shareable content from your GitHub activity. The platform offers both a Discord bot interface for real-time interaction and a REST API for programmatic access, making it easy to maintain an active social media presence without manual content creation.

### Key Features

- **Automated Commit Monitoring**: Continuously monitors configured GitHub repositories for new commits
- **AI-Powered Analysis**: Uses Google Gemini AI to analyze code changes and understand what was actually accomplished
- **Smart Content Generation**: Creates professional, engaging social media posts that focus on accomplishments rather than technical details
- **Discord Bot Interface**: Interactive bot for real-time commit review and post generation
- **REST API**: Programmatic access for integration with other tools and workflows
- **Fully Configurable**: All settings, limits, and behaviors are configurable via environment variables

## How It Works

### Workflow

1. **Commit Detection**
   - The Discord bot automatically monitors your configured GitHub repositories
   - New commits are detected at configurable intervals (default: 30 seconds)
   - Commit details including file changes are fetched from the GitHub API

2. **AI Analysis**
   - Commit information is analyzed by Google's Gemini AI model
   - The AI examines file changes, additions, deletions, and file types to understand the actual work accomplished
   - A professional summary is generated that focuses on what was built, fixed, or improved (not commit messages or file names)

3. **Post Generation**
   - The summary is transformed into an engaging Twitter/X post
   - Posts are optimized for character limits and readability
   - Content is written for a general audience, avoiding technical jargon
   - Posts can be prefixed with project names automatically

4. **Review & Publish**
   - Generated posts are presented in Discord for review
   - Users can approve (`!post`), discard (`!no`), or regenerate (`!redo`) posts
   - Approved posts are automatically published to Twitter/X

### Discord Bot Commands

- `!help` - Display available commands and features
- `!run` - Fetch and display the 5 latest commits from all configured repositories
- `!repo <numbers>` - Select commits by number and generate a post (e.g., `!repo 1` or `!repo 1,2`)
- `!redo` - Regenerate the post from the current summary
- `!post` - Post the generated content to X/Twitter
- `!no` - Discard the current post

### REST API Endpoints

- `POST /api/generate` - Generate a social media post from a summary
- `POST /api/post` - Post content directly to X/Twitter
- `GET /api/automation/github/commits` - Fetch recent commits from configured repositories
- `GET /api/automation/github/repos` - List repositories for a GitHub user
- `POST /api/automation/github/summarize` - Generate summary and post from selected commits
- `GET /api/health` - Health check endpoint

## Setup

### Prerequisites

- Node.js 18+ and npm
- A GitHub account with repository access
- A Google Cloud account with Gemini API access
- A Twitter/X Developer account with API credentials
- A Discord bot token (optional, for Discord bot features)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd grixo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` and fill in all required values (see Configuration section below).

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the application**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

### Configuration

All configuration is done through environment variables. Copy `env.example` to `.env` and configure the following:

#### Required Configuration

**Server**
- `PORT` - Server port (default: 3001)

**Gemini API**
- `GEMINI_API_KEY` - Your Google Gemini API key
- `GEMINI_MODEL_NAME` - Gemini model to use (default: gemini-2.5-flash)

**X (Twitter) API**
- `X_API_KEY` - Your X API key
- `X_API_SECRET` - Your X API secret
- `X_ACCESS_TOKEN` - Your X access token
- `X_ACCESS_TOKEN_SECRET` - Your X access token secret
- `X_CHARACTER_LIMIT` - Character limit for posts (default: 280)

**GitHub API**
- `GITHUB_TOKEN` - Your GitHub personal access token (optional but recommended)
- `GITHUB_REPOS` - Comma-separated list of repositories to monitor (format: `owner/repo1,owner/repo2`)
- `GITHUB_REPOS_PER_PAGE` - Number of repos per page when fetching user repos (default: 100)
- `GITHUB_REPOS_SORT` - Sort order for repositories (default: updated)

**Discord Bot** (Optional)
- `DISCORD_BOT_TOKEN` - Your Discord bot token
- `DISCORD_CHANNEL_ID` - Discord channel ID where the bot should operate
- `DISCORD_COMMIT_CHECK_INTERVAL_MS` - Interval for checking new commits in milliseconds (default: 30000)
- `DISCORD_MAX_MESSAGE_LENGTH` - Maximum Discord message length (default: 2000)
- `DISCORD_MAX_SUMMARY_LENGTH` - Maximum summary length in Discord messages (default: 800)
- `DISCORD_DEFAULT_PROJECT_NAME` - Default project name fallback (default: Project)

### Obtaining API Credentials

#### Google Gemini API
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key to `GEMINI_API_KEY` in your `.env` file

#### X (Twitter) API
1. Apply for a developer account at [developer.twitter.com](https://developer.twitter.com)
2. Create a new app in the Developer Portal
3. Generate API keys and access tokens
4. Ensure your app has "Read and write" permissions
5. Copy credentials to your `.env` file

#### GitHub API
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with `repo` scope
3. Copy the token to `GITHUB_TOKEN` in your `.env` file

#### Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the Bot section and create a bot
4. Copy the bot token to `DISCORD_BOT_TOKEN`
5. Enable "Message Content Intent" in the Bot settings
6. Invite the bot to your server with appropriate permissions
7. Get the channel ID where you want the bot to operate (enable Developer Mode in Discord, right-click channel → Copy ID)

## Development

### Project Structure

```
grixo/
├── src/
│   ├── index.ts              # Express server and API routes
│   └── services/
│       ├── discord.ts        # Discord bot implementation
│       ├── gemini.ts         # Gemini AI integration
│       ├── github.ts         # GitHub API integration
│       └── xApi.ts           # X/Twitter API integration
├── env.example               # Environment variables template
├── package.json              # Dependencies and scripts
└── tsconfig.json            # TypeScript configuration
```

### Scripts

- `npm run dev` - Start development server with auto-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server (requires build first)

## Security Notes

- Never commit your `.env` file to version control
- Keep all API keys and tokens secure
- Use environment-specific configurations for different deployments
- Regularly rotate API keys and tokens
- Review and limit API permissions to minimum required access
