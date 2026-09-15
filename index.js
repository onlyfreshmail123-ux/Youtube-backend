const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const YTDLP = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'youtube-backend',
    message: 'YouTube downloader backend is running'
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

function isAllowedVideoUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'youtube.com' ||
           host.endsWith('.youtube.com') ||
           host === 'youtu.be' ||
           host === 'youtube-nocookie.com' ||
           host.endsWith('.youtube-nocookie.com');
  } catch {
    return false;
  }
}

function cleanup(filePath) {
  fs.unlink(filePath, () => {});
}

app.get('/api/download', (req, res) => {
  const videoUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';

  if (!videoUrl) {
    return res.status(400).send('Video URL is required');
  }

  if (!isAllowedVideoUrl(videoUrl)) {
    return res.status(400).send('Please provide a valid YouTube URL');
  }

  const id = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  const outputTemplate = path.join('/tmp', `youtube-${id}.%(ext)s`);

  const args = [
    '--no-playlist',
    '--js-runtimes', 'node',
    '--format', 'bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--retries', '3',
    '--fragment-retries', '3',
    '--socket-timeout', '30',
    '--output', outputTemplate,
    '--print', 'after_move:filepath',
    '--',
    videoUrl
  ];

  console.log(`Starting download: ${videoUrl}`);

  const child = spawn(YTDLP, args, {
    env: process.env
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
    if (stdout.length > 10000) stdout = stdout.slice(-10000);
  });

  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
    if (stderr.length > 20000) stderr = stderr.slice(-20000);
  });

  child.on('error', error => {
    console.error('Could not start yt-dlp:', error);
    return res.status(500).send('Downloader is not available on the server.');
  });

  child.on('close', code => {
    if (code !== 0) {
      console.error(`yt-dlp exited with code ${code}`);
      console.error(stderr);
      return res.status(500).send('Download failed. Please try again.');
    }

    const lines = stdout.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let outputPath = lines.length ? lines[lines.length - 1] : '';

    // Fall back to the expected output name if yt-dlp did not print a path.
    if (!outputPath || !fs.existsSync(outputPath)) {
      const matches = fs.readdirSync('/tmp')
        .filter(name => name.startsWith(`youtube-${id}.`))
        .map(name => path.join('/tmp', name));

      outputPath = matches.find(file => fs.existsSync(file)) || '';
    }

    if (!outputPath || !fs.existsSync(outputPath)) {
      console.error('yt-dlp completed but output file was not found.');
      console.error('stdout:', stdout);
      console.error('stderr:', stderr);
      return res.status(500).send('Download failed. Please try again.');
    }

    console.log(`Download complete: ${outputPath}`);

    res.download(outputPath, 'video.mp4', error => {
      cleanup(outputPath);
      if (error) {
        console.error('Error sending downloaded file:', error);
      }
    });
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
