const express = require('express');
const ytdlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/download', async (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).send('Video URL is required');
  }

  try {
    const outputPath = path.join(__dirname, `video-${Date.now()}.mp4`);

    await ytdlp(videoUrl, {
      output: outputPath,
      format: 'bestvideo+bestaudio/best',
      mergeOutputFormat: 'mp4',
    });

    res.download(outputPath, (err) => {
      if (err) console.error('Error sending file:', err);
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting file:', unlinkErr);
      });
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Download failed. Please check the URL and try again.');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
