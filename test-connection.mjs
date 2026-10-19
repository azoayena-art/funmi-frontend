import { Client } from 'appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203');

client.setKey(process.env.APPWRITE_API_KEY);

console.log('✅ Client initialisé');
console.log('Endpoint :', client.endpoint);
console.log('Project :', client.project);