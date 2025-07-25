import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, Link, Clock, Eye, User, Calendar, Video, Volume2, Loader2, CheckCircle, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoInfo {
  title: string;
  duration: string;
  thumbnail: string;
  channel: string;
  views: string;
  publishDate: string;
  availableFormats: Array<{
    format: string;
    quality: string;
    filesize: string;
  }>;
}

interface DownloadData {
  id: string;
  youtubeUrl: string;
  title: string;
  duration: string;
  thumbnail: string;
  channel: string;
  views: string;
  publishDate: string;
  format: string;
  status: "pending" | "downloading" | "completed" | "failed";
  progress: number;
  filePath?: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState("mp4-1080p");
  const [activeDownload, setActiveDownload] = useState<string | null>(null);
  const { toast } = useToast();

  // Analyze video mutation
  const analyzeMutation = useMutation({
    mutationFn: async (videoUrl: string) => {
      const response = await apiRequest("POST", "/api/analyze", { url: videoUrl });
      return response.json();
    },
    onSuccess: (data: VideoInfo) => {
      setVideoInfo(data);
      toast({
        title: "Video analyzed successfully",
        description: "Video information loaded. You can now download it.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze video. Please check the URL.",
        variant: "destructive",
      });
    },
  });

  // Download mutation
  const downloadMutation = useMutation({
    mutationFn: async (downloadData: any) => {
      const response = await apiRequest("POST", "/api/download", downloadData);
      return response.json();
    },
    onSuccess: (data: DownloadData) => {
      setActiveDownload(data.id);
      toast({
        title: "Download started",
        description: "Your video download has begun.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Download failed",
        description: error.message || "Failed to start download.",
        variant: "destructive",
      });
    },
  });

  // Poll download status
  const { data: downloadStatus } = useQuery<DownloadData>({
    queryKey: ["/api/download", activeDownload],
    enabled: !!activeDownload,
    refetchInterval: activeDownload ? 1000 : false,
  });

  const handleAnalyze = () => {
    if (!url.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a YouTube URL.",
        variant: "destructive",
      });
      return;
    }

    if (!url.includes("youtube.com/watch") && !url.includes("youtu.be/")) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL.",
        variant: "destructive",
      });
      return;
    }

    analyzeMutation.mutate(url);
  };

  const handleDownload = () => {
    if (!videoInfo) return;

    const downloadData = {
      youtubeUrl: url,
      title: videoInfo.title,
      duration: videoInfo.duration,
      thumbnail: videoInfo.thumbnail,
      channel: videoInfo.channel,
      views: videoInfo.views,
      publishDate: videoInfo.publishDate,
      format: selectedFormat,
    };

    downloadMutation.mutate(downloadData);
  };

  const handleClear = () => {
    setUrl("");
    setVideoInfo(null);
    setActiveDownload(null);
    setSelectedFormat("mp4-1080p");
  };

  const isDownloadCompleted = downloadStatus?.status === "completed";
  const isDownloadFailed = downloadStatus?.status === "failed";
  const isDownloading = downloadStatus?.status === "downloading";

  return (
    <div className="min-h-screen bg-void-black">
      {/* Header */}
      <header className="py-8 text-center border-b border-pure-white">
        <h1 className="text-4xl font-bold mb-2 text-pure-white">YouTube Downloader</h1>
        <p className="text-gray-300 text-lg">Download YouTube videos - Note: Some videos may be restricted by YouTube's anti-bot protection</p>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {/* URL Input Section */}
        <section className="mb-12">
          <Card className="bg-void-black border-pure-white">
            <CardHeader>
              <CardTitle className="text-2xl text-center text-pure-white">Enter YouTube URL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-void-black border-pure-white text-pure-white placeholder-gray-400 focus:border-pure-white pr-10"
                />
                <Link className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              </div>
              
              <div className="flex gap-4">
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzeMutation.isPending}
                  className="flex-1 bg-pure-white text-void-black hover:bg-gray-200 font-semibold"
                >
                  {analyzeMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="mr-2 h-4 w-4" />
                  )}
                  Analyze Video
                </Button>
                <Button
                  onClick={handleClear}
                  variant="outline"
                  className="border-pure-white text-pure-white hover:border-pure-white hover:bg-void-black"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Video Info Section */}
        {videoInfo && (
          <section className="mb-12">
            <Card className="bg-void-black border-pure-white">
              <CardHeader>
                <CardTitle className="text-2xl text-pure-white">Video Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Video Thumbnail */}
                  <div className="md:w-1/3">
                    <img
                      src={videoInfo.thumbnail}
                      alt="Video thumbnail"
                      className="w-full rounded-lg border border-pure-white"
                      onError={(e) => {
                        e.currentTarget.src = "https://images.unsplash.com/photo-1611224923853-80b023f02d71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=450";
                      }}
                    />
                  </div>
                  
                  {/* Video Details */}
                  <div className="md:w-2/3 space-y-4">
                    <h3 className="text-xl font-semibold text-pure-white">{videoInfo.title}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center">
                        <Clock className="mr-2 h-4 w-4 text-gray-400" />
                        <span className="text-gray-300">Duration: </span>
                        <span className="ml-1 font-medium text-pure-white">{videoInfo.duration}</span>
                      </div>
                      <div className="flex items-center">
                        <Eye className="mr-2 h-4 w-4 text-gray-400" />
                        <span className="text-gray-300">Views: </span>
                        <span className="ml-1 font-medium text-pure-white">{videoInfo.views}</span>
                      </div>
                      <div className="flex items-center">
                        <User className="mr-2 h-4 w-4 text-gray-400" />
                        <span className="text-gray-300">Channel: </span>
                        <span className="ml-1 font-medium text-pure-white">{videoInfo.channel}</span>
                      </div>
                      <div className="flex items-center">
                        <Calendar className="mr-2 h-4 w-4 text-gray-400" />
                        <span className="text-gray-300">Published: </span>
                        <span className="ml-1 font-medium text-pure-white">{videoInfo.publishDate}</span>
                      </div>
                    </div>

                    {/* Quality Options */}
                    {videoInfo.availableFormats.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-lg font-medium mb-3 text-pure-white">Available Quality</h4>
                        <div className="space-y-2">
                          {videoInfo.availableFormats.slice(0, 3).map((format, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-void-black rounded border border-pure-white">
                              <div className="flex items-center">
                                <Video className="mr-3 h-4 w-4 text-gray-400" />
                                <span className="font-medium text-pure-white">{format.quality} {format.format.toUpperCase()}</span>
                                {index === 0 && <span className="ml-2 text-sm text-success-green">(Best Quality)</span>}
                              </div>
                              <span className="text-sm text-gray-300">{format.filesize}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Download Section */}
        {videoInfo && (
          <section className="mb-12">
            <Card className="bg-void-black border-pure-white">
              <CardHeader>
                <CardTitle className="text-2xl text-pure-white">Download Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Format Selection */}
                <div>
                  <label className="block text-sm font-medium mb-3 text-pure-white">Download Format</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { value: "mp4-1080p", title: "1080p MP4", desc: "Full HD quality", icon: Video },
                      { value: "mp4-720p", title: "720p MP4", desc: "HD quality", icon: Video },
                      { value: "mp4-480p", title: "480p MP4", desc: "Standard quality", icon: Video },
                      { value: "mp4", title: "Best MP4", desc: "Highest available", icon: Video },
                      { value: "mp3", title: "MP3 Audio", desc: "Audio only", icon: Volume2 },
                      { value: "webm", title: "WEBM", desc: "Smaller size", icon: Video },
                    ].map((format) => (
                      <label
                        key={format.value}
                        className={cn(
                          "flex items-center p-4 bg-void-black rounded-lg border cursor-pointer transition-colors",
                          selectedFormat === format.value
                            ? "border-pure-white"
                            : "border-pure-white hover:border-pure-white"
                        )}
                      >
                        <input
                          type="radio"
                          name="format"
                          value={format.value}
                          checked={selectedFormat === format.value}
                          onChange={(e) => setSelectedFormat(e.target.value)}
                          className="mr-3"
                        />
                        <div>
                          <div className="font-medium text-pure-white">{format.title}</div>
                          <div className="text-sm text-gray-400">{format.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Download Button */}
                <div className="text-center">
                  <Button
                    onClick={handleDownload}
                    disabled={downloadMutation.isPending || isDownloading}
                    className="w-full md:w-auto px-12 py-4 bg-success-green text-void-black font-bold text-lg hover:bg-green-400 transition-all duration-200 transform hover:scale-105"
                  >
                    {downloadMutation.isPending ? (
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="mr-3 h-5 w-5" />
                    )}
                    Download Now
                  </Button>
                </div>

                {/* Download Progress */}
                {downloadStatus && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-pure-white">
                        {isDownloading ? "Attempting download with multiple methods..." : 
                         isDownloadCompleted ? "Download completed!" :
                         isDownloadFailed ? "Download failed" : "Processing..."}
                      </span>
                      <span className="text-sm text-gray-300">{downloadStatus.progress || 0}%</span>
                    </div>
                    <Progress 
                      value={downloadStatus.progress || 0} 
                      className="w-full bg-gray-700"
                    />
                    {isDownloading && (
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Trying different strategies to bypass YouTube restrictions</span>
                        <span>This may take a moment...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Success/Error Messages */}
                {isDownloadCompleted && (
                  <div className="p-4 bg-success-green bg-opacity-10 border border-success-green rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <CheckCircle className="text-success-green mr-3 h-5 w-5" />
                        <div>
                          <div className="text-success-green font-medium">Download completed successfully!</div>
                          <div className="text-sm text-gray-300 mt-1">File is ready for download</div>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          if (downloadStatus?.id) {
                            window.open(`/api/download/${downloadStatus.id}/file`, '_blank');
                          }
                        }}
                        className="bg-success-green text-void-black hover:bg-green-400 font-semibold"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download File
                      </Button>
                    </div>
                  </div>
                )}

                {isDownloadFailed && (
                  <div className="p-4 bg-error-red bg-opacity-10 border border-error-red rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <AlertTriangle className="text-error-red mr-3 h-5 w-5" />
                        <div>
                          <div className="text-error-red font-medium">Download failed</div>
                          <div className="text-sm text-gray-300 mt-1">YouTube blocked the download. This happens due to anti-bot protection. Try a different video or wait a moment.</div>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          setActiveDownload(null);
                          handleDownload();
                        }}
                        variant="outline"
                        className="border-error-red text-error-red hover:bg-error-red hover:text-void-black"
                      >
                        Try Again
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Features Section */}
        <section className="mb-12">
          <Card className="bg-void-black border-pure-white">
            <CardHeader>
              <CardTitle className="text-2xl text-center text-pure-white">Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  {
                    icon: Video,
                    title: "Maximum Quality",
                    description: "Download videos in the highest available quality with pristine audio"
                  },
                  {
                    icon: Download,
                    title: "Fast Processing",
                    description: "Quick analysis and download with optimized performance"
                  },
                  {
                    icon: CheckCircle,
                    title: "Safe & Secure",
                    description: "No data collection, everything processed locally on your device"
                  }
                ].map((feature, index) => {
                  const IconComponent = feature.icon;
                  return (
                    <div key={index} className="text-center space-y-3">
                      <div className="w-16 h-16 bg-pure-white text-void-black rounded-full flex items-center justify-center mx-auto">
                        <IconComponent className="h-8 w-8" />
                      </div>
                      <h3 className="font-semibold text-pure-white">{feature.title}</h3>
                      <p className="text-sm text-gray-300">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-gray py-8 text-center">
        <div className="container mx-auto px-4">
          <p className="text-gray-400 text-sm">
            Built with ❤️ for content creators and learners.
            <span className="block mt-2">Please respect copyright and only download content you have permission to use.</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
