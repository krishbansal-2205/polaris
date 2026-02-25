import { inngest } from './client';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export const demoGenerate = inngest.createFunction(
   { id: 'demo-generate' },
   { event: 'demo/generate' },
   async ({ step }) => {
      await step.run('generate-text', async () => {
         const result = await generateText({
            model: google('gemini-3-flash-preview'),
            prompt: 'Write a vegetarian recipe for 4 people',
         });
         return result;
      });
   },
);
