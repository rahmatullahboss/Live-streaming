const DIRECT_VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v", ".m3u8"];

// Our R2 asset URLs don't expose extension in path, so we allow them
const ALLOWED_ASSET_PATTERNS = ["/api/v1/assets/", "/v1/assets/"];

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

  // Allow our R2 asset URLs (they serve video with correct content-type)
  if (ALLOWED_ASSET_PATTERNS.some((pattern) => parsedUrl.pathname.includes(pattern))) {
    return null;
  }

  const pathname = parsedUrl.pathname.toLowerCase();
  if (!DIRECT_VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
    return "Ad video must be a direct video file URL such as .mp4, .webm, .mov, or .m3u8.";
  }

  return null;
}
