import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { analyzeRepository } from './services/analysisService';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/repos/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const response = await axios.get(`https://api.github.com/users/${username}/repos`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${process.env.GITHUB_TOKEN}`
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data?.message || 'Failed to fetch repositories' 
      });
    } else {
      res.status(500).json({ error: 'Failed to fetch repositories' });
    }
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { repoUrl } = req.body;
    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    const analysis = await analyzeRepository(repoUrl);
    if (analysis.error) {
      return res.status(400).json({ error: analysis.error });
    }
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing repository:', error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data?.message || 'Failed to analyze repository' 
      });
    } else {
      res.status(500).json({ error: 'Failed to analyze repository' });
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 