import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';
import CacheService from './cacheService';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const cacheService = CacheService.getInstance();

interface FileAnalysis {
  path: string;
  suggestions: string[];
}

interface RepoAnalysis {
  repoName: string;
  overallSuggestions: string[];
  fileAnalyses: FileAnalysis[];
  error?: string;
}

async function analyzeFileContent(fileContent: string, model: any): Promise<string[]> {
  const prompt = `Analyze this frontend code for performance optimizations and best practices, provide scenarios where given code might be a problem, and provide it's fixes. Provide specific suggestions for improvement:
  
  ${fileContent}

  Focus on:
  1. Performance optimizations
  2. Code organization
  3. Best practices
  4. Potential bugs
  5. Security concerns`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text().split('\n').filter((line: string) => line.trim());
}

async function getRepositoryContents(owner: string, repoName: string, path: string = ''): Promise<any[]> {
  const contentsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${process.env.GITHUB_TOKEN}`
    }
  });

  const contents = contentsResponse.data;
  const files: any[] = [];

  for (const item of contents) {
    if (item.type === 'file' && (item.name.endsWith('.tsx') || item.name.endsWith('.jsx') || item.name.endsWith('.ts') || item.name.endsWith('.js'))) {
      files.push(item);
    } else if (item.type === 'dir') {
      const nestedFiles = await getRepositoryContents(owner, repoName, item.path);
      files.push(...nestedFiles);
    }
  }

  return files;
}

export async function analyzeRepository(repoUrl: string): Promise<RepoAnalysis> {
  try {
    // Check cache first
    const cachedAnalysis = cacheService.get<RepoAnalysis>(repoUrl);
    if (cachedAnalysis) {
      console.log('Returning cached analysis for:', repoUrl);
      return cachedAnalysis;
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key is not configured');
    }
    console.log('Using Gemini API key:', process.env.GEMINI_API_KEY ? 'Configured' : 'Not configured');
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log({model});
    // Extract owner and repo name from URL
    const urlParts = repoUrl.split('/');
    console.log({urlParts, repoUrl});
    const owner = urlParts[urlParts.length - 2];
    const repoName = urlParts[urlParts.length - 1];
    console.log(owner, repoName);
    if (!owner || !repoName) {
      throw new Error('Invalid repository URL format');
    }

    // Get all files recursively
    const files = await getRepositoryContents(owner, repoName);
    console.log('Found files:', files.length);

    const fileAnalyses: FileAnalysis[] = [];
    const overallSuggestions: string[] = [];

    // Analyze each file
    for (const file of files) {
      try {
        const fileContent = await axios.get(file.download_url);
        const suggestions = await analyzeFileContent(fileContent.data, model);

        fileAnalyses.push({
          path: file.path,
          suggestions
        });

        // Add unique suggestions to overall suggestions
        suggestions.forEach(suggestion => {
          if (!overallSuggestions.includes(suggestion)) {
            overallSuggestions.push(suggestion);
          }
        });
      } catch (error) {
        console.error(`Error analyzing file ${file.path}:`, error);
        // Continue with other files even if one fails
      }
    }
    console.log({fileAnalyses, overallSuggestions});

    const analysisResult: RepoAnalysis = {
      repoName,
      overallSuggestions,
      fileAnalyses
    };

    // Cache the result
    cacheService.set(repoUrl, analysisResult);

    return analysisResult;
  } catch (error) {
    // console.error('Error in repository analysis:', error);
    const errorResult: RepoAnalysis = {
      repoName: '',
      overallSuggestions: [],
      fileAnalyses: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
    return errorResult;
  }
} 