const DIRECT_VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v", ".m3u8"];

export function getAdVideoUrlIssue(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return "Ad video URL must be a valid absolute URL.";
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (host === "youtu.be" || host.endsWith(".youtube.com") || host === "youtube.com") {
    return "YouTube watch/share URLs cannot be mixed into the outgoing canvas stream. Use a direct MP4/WebM/HLS file URL instead.";
  }

  const pathname = parsedUrl.pathname.toLowerCase();
  if (!DIRECT_VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
    return "Ad video must be a direct video file URL such as .mp4, .webm, .mov, or .m3u8.";
  }

  return null;
}
