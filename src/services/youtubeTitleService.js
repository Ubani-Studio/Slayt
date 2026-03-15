const OpenAI = require('openai');

function toTitleCase(value) {
  return String(value || '')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeStem(filename) {
  return String(filename || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipTitle(value, maxLength = 90) {
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trimEnd();
}

class YouTubeTitleService {
  constructor() {
    this.client = null;
    this.model = process.env.OPENAI_YOUTUBE_MODEL || process.env.OPENAI_ALCHEMY_MODEL || 'gpt-4o-mini';
  }

  getClient() {
    if (this.client) return this.client;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  fallbackTitle({ filename, prompt, collectionName, folder }) {
    const stem = normalizeStem(filename);
    const theme = clipTitle(prompt || collectionName || folder || '', 48);

    if (!stem && !theme) return 'Untitled Video';
    if (!theme) return clipTitle(toTitleCase(stem), 90);
    if (!stem) return clipTitle(toTitleCase(theme), 90);

    const stemTitle = toTitleCase(stem);
    const themeTitle = toTitleCase(theme);

    if (stemTitle.toLowerCase().includes(themeTitle.toLowerCase())) {
      return clipTitle(stemTitle, 90);
    }

    return clipTitle(`${themeTitle}: ${stemTitle}`, 90);
  }

  parseResponse(content) {
    if (!content) return null;
    const trimmed = String(content).trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = (fenced?.[1] || trimmed).trim();

    try {
      return JSON.parse(candidate);
    } catch {
      const objectMatch = candidate.match(/\{[\s\S]*\}/);
      if (!objectMatch) return null;
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return null;
      }
    }
  }

  async suggestTitles({ prompt, collectionName, folder, files }) {
    const safeFiles = Array.isArray(files)
      ? files
        .map((file) => ({
          filename: String(file?.filename || '').trim(),
          currentTitle: String(file?.currentTitle || '').trim(),
        }))
        .filter((file) => file.filename || file.currentTitle)
      : [];

    if (safeFiles.length === 0) return [];

    const client = this.getClient();
    if (!client) {
      return safeFiles.map((file) => ({
        filename: file.filename,
        title: this.fallbackTitle({
          filename: file.filename || file.currentTitle,
          prompt,
          collectionName,
          folder,
        }),
      }));
    }

    const promptText = String(prompt || '').trim();
    const collectionText = String(collectionName || '').trim();
    const folderText = String(folder || '').trim();

    const filesPayload = safeFiles.map((file, index) => ({
      index,
      filename: file.filename,
      currentTitle: file.currentTitle,
    }));

    try {
      let completion;
      const baseRequest = {
        model: this.model,
        temperature: 0.8,
        messages: [
          {
            role: 'system',
            content: 'You write concise YouTube working titles. Return JSON only.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Generate one title per asset for a YouTube planning board.',
              rules: [
                'Keep the same order as the files array.',
                'Return exactly one title for each file.',
                'Titles should feel like topical content ideas, not file names.',
                'Use the theme prompt heavily when it is provided.',
                'Use the filename stem only as a hint for the specific asset.',
                'Do not include numbering, quotation marks, hashtags, or emoji.',
                'Keep each title under 90 characters.'
              ],
              context: {
                collectionName: collectionText,
                folder: folderText,
                themePrompt: promptText,
              },
              files: filesPayload,
              responseShape: {
                titles: [
                  { filename: 'exact input filename', title: 'generated title' }
                ]
              }
            })
          }
        ]
      };

      try {
        completion = await client.chat.completions.create({
          ...baseRequest,
          response_format: { type: 'json_object' },
        });
      } catch {
        completion = await client.chat.completions.create(baseRequest);
      }

      const content = completion?.choices?.[0]?.message?.content?.trim();
      const parsed = this.parseResponse(content);
      const titles = Array.isArray(parsed?.titles) ? parsed.titles : null;

      if (titles?.length === safeFiles.length) {
        return safeFiles.map((file, index) => {
          const match = titles[index] || {};
          const title = clipTitle(match.title, 90);
          return {
            filename: file.filename,
            title: title || this.fallbackTitle({
              filename: file.filename || file.currentTitle,
              prompt,
              collectionName,
              folder,
            }),
          };
        });
      }
    } catch (error) {
      console.error('YouTube title suggestion failed:', error.message);
    }

    return safeFiles.map((file) => ({
      filename: file.filename,
      title: this.fallbackTitle({
        filename: file.filename || file.currentTitle,
        prompt,
        collectionName,
        folder,
      }),
    }));
  }
}

module.exports = new YouTubeTitleService();
