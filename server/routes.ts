import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { videoAnalysisSchema, insertDownloadSchema } from "@shared/schema";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

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
          console.error("yt-dlp error:", error);
          res.status(400).json({ 
            message: "Failed to analyze video. Please check the URL and try again." 
          });
          return;
        }

        try {
          const videoInfo = JSON.parse(output);
          
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

      // Start download process in background
      startDownload(download.id, downloadData.youtubeUrl, downloadData.format || "mp4");
      
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
      res.status(500).json({ message: "Error downloading file" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

async function startDownload(downloadId: string, url: string, format: string) {
  try {
    await storage.updateDownload(downloadId, { status: "downloading", progress: 0 });

    const outputDir = path.join(process.cwd(), "downloads");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputTemplate = path.join(outputDir, "%(title)s.%(ext)s");
    
    let args = [
      "--output", outputTemplate,
      "--progress",
      "--no-warnings",
      "--prefer-free-formats",
      "--retries", "5",
      "--retry-sleep", "1",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "--add-header", "Accept-Language:en-US,en;q=0.9",
      "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "--extractor-args", "youtube:player_client=web,android",
      "--sleep-interval", "1",
      "--max-sleep-interval", "5",
      url
    ];

    // Add format-specific arguments with higher quality options
    if (format === "mp3") {
      args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
    } else if (format === "mp4-1080p") {
      args.push("--format", "(best[height<=1080]/best)[ext=mp4]/(best[height<=1080]/best)");
    } else if (format === "mp4-720p") {
      args.push("--format", "(best[height<=720]/best)[ext=mp4]/(best[height<=720]/best)");
    } else if (format === "mp4-480p") {
      args.push("--format", "(best[height<=480]/best)[ext=mp4]/(best[height<=480]/best)");
    } else if (format === "mp4") {
      args.push("--format", "best[ext=mp4]/best");
    } else if (format === "webm") {
      args.push("--format", "best[ext=webm]/best");
    } else {
      // Default fallback
      args.push("--format", "best");
    }

    const ytdlp = spawn("yt-dlp", args);

    let lastProgress = 0;

    ytdlp.stdout.on("data", (data) => {
      const output = data.toString();
      
      // Parse progress from yt-dlp output
      const progressMatch = output.match(/(\d+(?:\.\d+)?)%/);
      if (progressMatch) {
        const progress = Math.round(parseFloat(progressMatch[1]));
        if (progress > lastProgress) {
          lastProgress = progress;
          storage.updateDownload(downloadId, { progress });
        }
      }
    });

    ytdlp.stderr.on("data", (data) => {
      const output = data.toString();
      console.error("yt-dlp stderr:", output);
      
      // Also check for progress in stderr output
      const progressMatch = output.match(/(\d+(?:\.\d+)?)%/);
      if (progressMatch) {
        const progress = Math.round(parseFloat(progressMatch[1]));
        if (progress > lastProgress) {
          lastProgress = progress;
          storage.updateDownload(downloadId, { progress });
        }
      }
    });

    ytdlp.on("close", async (code) => {
      if (code === 0) {
        // Check if file actually exists
        const files = fs.readdirSync(outputDir).filter(f => !f.startsWith('.'));
        if (files.length > 0) {
          await storage.updateDownload(downloadId, { 
            status: "completed", 
            progress: 100,
            filePath: path.join(outputDir, files[files.length - 1])
          });
        } else {
          await storage.updateDownload(downloadId, { 
            status: "failed", 
            progress: 0 
          });
        }
      } else {
        console.error(`yt-dlp process exited with code ${code}`);
        await storage.updateDownload(downloadId, { 
          status: "failed", 
          progress: 0 
        });
      }
    });

  } catch (error) {
    console.error("Download error:", error);
    await storage.updateDownload(downloadId, { 
      status: "failed", 
      progress: 0 
    });

    // Try multiple alternative approaches
    const alternativeStrategies = [
      // Strategy 1: Use web player client with different format
      {
        name: "Web client with audio-only fallback",
        args: [
          "--output", path.join(process.cwd(), "downloads", "%(title)s.%(ext)s"),
          "--format", "worst/bestaudio",
          "--no-warnings",
          "--extractor-args", "youtube:player_client=web",
          "--user-agent", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          url
        ]
      },
      // Strategy 2: Use iOS client
      {
        name: "iOS client",
        args: [
          "--output", path.join(process.cwd(), "downloads", "%(title)s.%(ext)s"),
          "--format", "worst",
          "--no-warnings", 
          "--extractor-args", "youtube:player_client=ios",
          url
        ]
      },
      // Strategy 3: Use embedded player
      {
        name: "Embedded player",
        args: [
          "--output", path.join(process.cwd(), "downloads", "%(title)s.%(ext)s"),
          "--format", "worst",
          "--no-warnings",
          "--extractor-args", "youtube:player_client=web_embedded",
          url
        ]
      }
    ];

    let strategyIndex = 0;
    
    const tryNextStrategy = async () => {
      if (strategyIndex >= alternativeStrategies.length) {
        console.log("All strategies failed");
        await storage.updateDownload(downloadId, { 
          status: "failed", 
          progress: 0 
        });
        return;
      }

      const strategy = alternativeStrategies[strategyIndex];
      console.log(`Trying strategy ${strategyIndex + 1}: ${strategy.name}`);
      await storage.updateDownload(downloadId, { status: "downloading", progress: 0 });
      
      try {
        const fallbackYtdlp = spawn("yt-dlp", strategy.args);
        
        fallbackYtdlp.on("close", async (code) => {
          if (code === 0) {
            const outputDir = path.join(process.cwd(), "downloads");
            const files = fs.readdirSync(outputDir).filter(f => !f.startsWith('.'));
            if (files.length > 0) {
              await storage.updateDownload(downloadId, { 
                status: "completed", 
                progress: 100,
                filePath: path.join(outputDir, files[files.length - 1])
              });
            } else {
              strategyIndex++;
              setTimeout(tryNextStrategy, 1000);
            }
          } else {
            strategyIndex++;
            setTimeout(tryNextStrategy, 1000);
          }
        });

        fallbackYtdlp.on("error", () => {
          strategyIndex++;
          setTimeout(tryNextStrategy, 1000);
        });
        
      } catch (strategyError) {
        console.error(`Strategy ${strategy.name} failed:`, strategyError);
        strategyIndex++;
        setTimeout(tryNextStrategy, 1000);
      }
    };

    tryNextStrategy();
  }
}

function formatDate(dateString: string): string {
  if (!dateString || dateString.length !== 8) return "Unknown";
  
  const year = dateString.substring(0, 4);
  const month = dateString.substring(4, 6);
  const day = dateString.substring(6, 8);
  
  const date = new Date(`${year}-${month}-${day}`);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
