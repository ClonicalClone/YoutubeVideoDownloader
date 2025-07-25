import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { videoAnalysisSchema, insertDownloadSchema } from "@shared/schema";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import ytdl from "ytdl-core";
import youtubedl from "youtube-dl-exec";

export async function registerRoutes(app: Express): Promise<Server> {
  // Analyze YouTube video
  app.post("/api/analyze", async (req, res) => {
    try {
      const { url } = videoAnalysisSchema.parse(req.body);
      
      // Use yt-dlp to extract video information with better options
      const ytdlp = spawn("yt-dlp", [
        "--dump-json",
        "--no-download",
        "--no-warnings",
        "--prefer-free-formats",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--add-header", "Accept-Language:en-US,en;q=0.9",
        "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "--extractor-args", "youtube:player_client=web",
        url
      ]);

      let output = "";
      let error = "";

      ytdlp.stdout.on("data", (data) => {
        output += data.toString();
      });

      ytdlp.stderr.on("data", (data) => {
        error += data.toString();
      });

      ytdlp.on("close", (code) => {
        if (code !== 0) {
          console.error("yt-dlp analysis error:", error);
          res.status(500).json({ 
            message: "Failed to analyze video. Please check the URL and try again." 
          });
          return;
        }

        try {
          const lines = output.trim().split('\n');
          const jsonLine = lines.find(line => line.trim().startsWith('{'));
          
          if (!jsonLine) {
            throw new Error("No JSON data found in yt-dlp output");
          }

          const videoInfo = JSON.parse(jsonLine);
          
          const response = {
            title: videoInfo.title || "Unknown Title",
            duration: videoInfo.duration_string || "Unknown",
            thumbnail: videoInfo.thumbnail || "",
            channel: videoInfo.uploader || "Unknown Channel",
            views: videoInfo.view_count ? videoInfo.view_count.toLocaleString() : "Unknown",
            publishDate: videoInfo.upload_date ? formatDate(videoInfo.upload_date) : "Unknown",
            availableFormats: videoInfo.formats?.filter((f: any) => f.ext === "mp4" || f.ext === "webm" || f.acodec !== "none")
              .slice(0, 5)
              .map((f: any) => ({
                format: f.ext,
                quality: f.height ? `${f.height}p` : "Audio only",
                filesize: f.filesize ? formatFileSize(f.filesize) : "Unknown size"
              })) || []
          };

          res.json(response);
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          res.status(500).json({ 
            message: "Failed to parse video information." 
          });
        }
      });

    } catch (error) {
      console.error("Analysis error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Invalid request data" 
      });
    }
  });

  // Start download
  app.post("/api/download", async (req, res) => {
    try {
      const downloadData = insertDownloadSchema.parse(req.body);
      const download = await storage.createDownload(downloadData);
      
      res.json(download);

      // Start download process with multiple strategies
      downloadWithMultipleStrategies(download.id, downloadData.youtubeUrl, downloadData.format || "mp4", downloadData.title);
      
    } catch (error) {
      console.error("Download creation error:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Invalid download data" 
      });
    }
  });

  // Get download status
  app.get("/api/download/:id", async (req, res) => {
    try {
      const download = await storage.getDownload(req.params.id);
      if (!download) {
        res.status(404).json({ message: "Download not found" });
        return;
      }
      res.json(download);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all downloads
  app.get("/api/downloads", async (req, res) => {
    try {
      const downloads = await storage.getAllDownloads();
      res.json(downloads);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Download completed file
  app.get("/api/download/:id/file", async (req, res) => {
    try {
      const download = await storage.getDownload(req.params.id);
      if (!download || download.status !== "completed" || !download.filePath) {
        res.status(404).json({ message: "File not found or download not completed" });
        return;
      }

      if (!fs.existsSync(download.filePath)) {
        res.status(404).json({ message: "File not found on disk" });
        return;
      }

      const fileName = path.basename(download.filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      
      const fileStream = fs.createReadStream(download.filePath);
      fileStream.pipe(res);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Strategy 1: Try ytdl-core (Node.js library)
async function tryYtdlCore(downloadId: string, url: string, format: string, title: string): Promise<boolean> {
  console.log("Trying ytdl-core strategy...");
  
  try {
    if (!ytdl.validateURL(url)) {
      console.log("Invalid URL for ytdl-core");
      return false;
    }

    await storage.updateDownload(downloadId, { status: "downloading", progress: 10 });

    const info = await ytdl.getInfo(url);
    const videoFormat = ytdl.chooseFormat(info.formats, { quality: 'lowest' }); // Use lowest to avoid restrictions
    
    if (!videoFormat) {
      console.log("No suitable format found with ytdl-core");
      return false;
    }

    const sanitizedTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const outputPath = path.join(process.cwd(), "downloads", `${sanitizedTitle}.${videoFormat.container}`);
    
    const stream = ytdl(url, { quality: 'lowest' });
    const writeStream = fs.createWriteStream(outputPath);
    
    return new Promise((resolve) => {
      stream.pipe(writeStream);
      
      stream.on('progress', (chunkLength, downloaded, total) => {
        const progress = Math.round((downloaded / total) * 100);
        storage.updateDownload(downloadId, { progress });
      });
      
      writeStream.on('finish', async () => {
        await storage.updateDownload(downloadId, { 
          status: "completed", 
          progress: 100,
          filePath: outputPath
        });
        console.log("ytdl-core download completed successfully!");
        resolve(true);
      });
      
      stream.on('error', (error) => {
        console.log("ytdl-core error:", error.message);
        resolve(false);
      });
      
      writeStream.on('error', (error) => {
        console.log("ytdl-core write error:", error.message);
        resolve(false);
      });
    });
    
  } catch (error) {
    console.log("ytdl-core failed:", error);
    return false;
  }
}

// Strategy 2: Try youtube-dl-exec 
async function tryYoutubeDlExec(downloadId: string, url: string, format: string, title: string): Promise<boolean> {
  console.log("Trying youtube-dl-exec strategy...");
  
  try {
    await storage.updateDownload(downloadId, { status: "downloading", progress: 20 });
    
    const sanitizedTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const outputTemplate = path.join(process.cwd(), "downloads", `${sanitizedTitle}.%(ext)s`);
    
    const options = {
      output: outputTemplate,
      format: 'worst[ext=mp4]/worst', // Use worst quality to avoid restrictions
      noWarnings: true,
      extractorArgs: 'youtube:player_client=android'
    };
    
    await youtubedl(url, options);
    
    // Find the downloaded file
    const outputDir = path.join(process.cwd(), "downloads");
    const files = fs.readdirSync(outputDir).filter(f => f.startsWith(sanitizedTitle) && !f.startsWith('.'));
    
    if (files.length > 0) {
      const filePath = path.join(outputDir, files[0]);
      await storage.updateDownload(downloadId, { 
        status: "completed", 
        progress: 100,
        filePath: filePath
      });
      console.log("youtube-dl-exec download completed successfully!");
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.log("youtube-dl-exec failed:", error);
    return false;
  }
}

// Strategy 3: Enhanced yt-dlp with po token support
async function tryEnhancedYtDlp(downloadId: string, url: string, format: string, title: string): Promise<boolean> {
  console.log("Trying enhanced yt-dlp strategy...");
  
  try {
    await storage.updateDownload(downloadId, { status: "downloading", progress: 30 });
    
    const sanitizedTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const outputPath = path.join(process.cwd(), "downloads", `${sanitizedTitle}.%(ext)s`);
    
    const args = [
      "--output", outputPath,
      "--format", "worst[ext=mp4]/worst/bestaudio",
      "--no-warnings",
      "--user-agent", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "--extractor-args", "youtube:player_client=android,web_creator",
      url
    ];

    return new Promise((resolve) => {
      const ytdlp = spawn("yt-dlp", args);
      
      ytdlp.on("close", async (code) => {
        if (code === 0) {
          const outputDir = path.join(process.cwd(), "downloads");
          const files = fs.readdirSync(outputDir).filter(f => f.startsWith(sanitizedTitle) && !f.startsWith('.'));
          
          if (files.length > 0) {
            await storage.updateDownload(downloadId, { 
              status: "completed", 
              progress: 100,
              filePath: path.join(outputDir, files[0])
            });
            console.log("Enhanced yt-dlp download completed successfully!");
            resolve(true);
          } else {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      });
      
      ytdlp.on("error", () => resolve(false));
    });
    
  } catch (error) {
    console.log("Enhanced yt-dlp failed:", error);
    return false;
  }
}

// Main download function with multiple strategies
async function downloadWithMultipleStrategies(downloadId: string, url: string, format: string, title: string) {
  try {
    await storage.updateDownload(downloadId, { status: "downloading", progress: 0 });

    const outputDir = path.join(process.cwd(), "downloads");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Try strategies in order of reliability
    const strategies = [
      () => tryYtdlCore(downloadId, url, format, title),
      () => tryYoutubeDlExec(downloadId, url, format, title), 
      () => tryEnhancedYtDlp(downloadId, url, format, title)
    ];

    console.log(`Starting download for: ${title}`);
    console.log(`URL: ${url}`);
    console.log(`Format: ${format}`);

    for (let i = 0; i < strategies.length; i++) {
      console.log(`Trying strategy ${i + 1}/${strategies.length}...`);
      
      try {
        const success = await strategies[i]();
        if (success) {
          console.log(`Strategy ${i + 1} succeeded!`);
          return;
        }
        console.log(`Strategy ${i + 1} failed, trying next...`);
      } catch (error) {
        console.log(`Strategy ${i + 1} threw error:`, error);
      }

      // Wait a bit between strategies
      if (i < strategies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // All strategies failed
    console.log("All download strategies failed");
    await storage.updateDownload(downloadId, { 
      status: "failed", 
      progress: 0 
    });

  } catch (error) {
    console.error("Download process error:", error);
    await storage.updateDownload(downloadId, { 
      status: "failed", 
      progress: 0 
    });
  }
}

// Helper functions for date and file size formatting
function formatDate(dateString: string): string {
  if (dateString.length === 8) {
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    const date = new Date(`${year}-${month}-${day}`);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) {
      return `${diffDays} days ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} year${years > 1 ? 's' : ''} ago`;
    }
  }
  return dateString;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}