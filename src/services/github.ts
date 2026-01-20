import axios from 'axios';

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  html_url: string;
  repository?: {
    full_name: string;
  };
}

interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface CommitDetail {
  sha: string;
  files: CommitFile[];
}

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  url: string;
  repo: string;
  files?: CommitFile[];
}

export const getRecentCommits = async (
  owner: string,
  repo: string,
  token?: string,
  count: number = 5
): Promise<CommitInfo[]> => {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const response = await axios.get<GitHubCommit[]>(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      {
        headers,
        params: {
          per_page: count,
        },
      }
    );

    const commitsWithDetails: CommitInfo[] = [];

    for (const commit of response.data) {
      try {
        // Fetch commit details with file changes
        const detailResponse = await axios.get<CommitDetail>(
          `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
          { headers }
        );

        commitsWithDetails.push({
          sha: commit.sha.substring(0, 7),
          message: commit.commit.message.split('\n')[0],
          date: new Date(commit.commit.author.date).toLocaleDateString(),
          url: commit.html_url,
          repo: `${owner}/${repo}`,
          files: detailResponse.data.files || [],
        });
      } catch (error) {
        // If detail fetch fails, still include commit without file details
        commitsWithDetails.push({
          sha: commit.sha.substring(0, 7),
          message: commit.commit.message.split('\n')[0],
          date: new Date(commit.commit.author.date).toLocaleDateString(),
          url: commit.html_url,
          repo: `${owner}/${repo}`,
        });
      }
    }

    return commitsWithDetails;
  } catch (error: any) {
    console.error('GitHub API error:', error);
    if (error.response?.status === 404) {
      throw new Error('Repository not found. Please check the owner and repository name.');
    }
    if (error.response?.status === 401) {
      throw new Error('GitHub authentication failed. Please check your token.');
    }
    throw new Error('Failed to fetch GitHub commits');
  }
};

export const getRecentCommitsFromRepos = async (
  repos: string[],
  token?: string,
  count: number = 5
): Promise<CommitInfo[]> => {
  const allCommits: CommitInfo[] = [];

  for (const repo of repos) {
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) continue;

    try {
      const commits = await getRecentCommits(owner, repoName, token, count);
      allCommits.push(...commits);
    } catch (error) {
      console.error(`Error fetching commits from ${repo}:`, error);
      // Continue with other repos even if one fails
    }
  }

  // Sort by date (newest first) and take top 5
  return allCommits
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, count);
};

export const getUserRepos = async (username: string, token?: string): Promise<string[]> => {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const perPage = parseInt(process.env.GITHUB_REPOS_PER_PAGE || '100', 10);
    const sort = process.env.GITHUB_REPOS_SORT || 'updated';
    
    const response = await axios.get<Array<{ full_name: string }>>(
      `https://api.github.com/users/${username}/repos`,
      {
        headers,
        params: {
          per_page: perPage,
          sort: sort,
        },
      }
    );

    return response.data.map((repo) => repo.full_name);
  } catch (error: any) {
    console.error('GitHub API error:', error);
    throw new Error('Failed to fetch repositories');
  }
};
