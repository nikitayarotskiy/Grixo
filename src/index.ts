import express from 'express';
import dotenv from 'dotenv';
import { generatePost, generateSummary } from './services/gemini';
import { postToX } from './services/xApi';
import { getUserRepos, getRecentCommitsFromRepos } from './services/github';
import { startDiscordBot } from './services/discord';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.post('/api/generate', async (req, res) => {
  try {
    const { summary } = req.body;

    if (!summary || typeof summary !== 'string') {
      return res.status(400).json({ error: 'Summary is required' });
    }

    const { projectName } = req.body;
    const post = await generatePost(summary, projectName);
    res.json({ post });
  } catch (error) {
    console.error('Error generating post:', error);
    res.status(500).json({ error: 'Failed to generate post' });
  }
});

app.post('/api/post', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Post text is required' });
    }

    await postToX(text);
    res.json({ success: true });
  } catch (error) {
    console.error('Error posting to X:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to post to X';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/automation/github/commits', async (req, res) => {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepos = process.env.GITHUB_REPOS;

    if (!githubRepos) {
      return res.status(400).json({ error: 'GITHUB_REPOS not configured in .env' });
    }

    const repos = githubRepos.split(',').map((r) => r.trim()).filter(Boolean);
    
    if (repos.length === 0) {
      return res.status(400).json({ error: 'No repositories configured' });
    }

    const commits = await getRecentCommitsFromRepos(repos, githubToken, 5);
    res.json({ commits });
  } catch (error) {
    console.error('Error fetching GitHub commits:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch GitHub commits';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/automation/github/repos', async (req, res) => {
  try {
    const { username, token } = req.query;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const repos = await getUserRepos(username, token as string | undefined);
    res.json({ repos });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch repositories';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/automation/github/summarize', async (req, res) => {
  try {
    const { selectedCommits } = req.body;

    if (!selectedCommits || !Array.isArray(selectedCommits) || selectedCommits.length === 0) {
      return res.status(400).json({ error: 'Selected commits are required' });
    }

    // Build detailed commit analysis
    const commitsAnalysis = selectedCommits.map((c: any) => {
      let analysis = `Repository: ${c.repo}\nCommit: ${c.message}\n`;
      
      if (c.files && c.files.length > 0) {
        analysis += `Files changed:\n`;
        c.files.forEach((file: any) => {
          analysis += `- ${file.filename} (${file.status}): +${file.additions} -${file.deletions} lines\n`;
        });
      }
      
      return analysis;
    }).join('\n---\n\n');

    const summary = await generateSummary(commitsAnalysis);
    
    // Extract project name from commits and capitalize it
    const firstCommit = selectedCommits[0];
    const repoName = firstCommit?.repo ? firstCommit.repo.split('/')[1] : undefined;
    const projectName = repoName ? repoName.charAt(0).toUpperCase() + repoName.slice(1).toLowerCase() : undefined;
    
    res.json({ summary, projectName });
  } catch (error) {
    console.error('Error generating summary from commits:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate summary';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Start Discord bot
  startDiscordBot().catch(console.error);
});
