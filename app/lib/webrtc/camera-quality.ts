export type CameraQuality = "adaptive" | "hd" | "full-hd";

export interface CameraVideoConstraintConfig {
  aspectRatio: { ideal: number };
  frameRate: { ideal: number; max: number };
  height: { ideal: number };
  resizeMode: "crop-and-scale";
  width: { ideal: number };
}

export function getQualityConstraints(quality: CameraQuality, isLandscape: boolean): CameraVideoConstraintConfig {
  const baseResolution =
    quality === "full-hd"
      ? { width: 1920, height: 1080, frameRate: 30 }
      : quality === "hd"
        ? { width: 1280, height: 720, frameRate: 30 }
        : { width: 960, height: 540, frameRate: 24 };

  return {
    width: { ideal: isLandscape ? baseResolution.width : baseResolution.height },
    height: { ideal: isLandscape ? baseResolution.height : baseResolution.width },
    aspectRatio: { ideal: isLandscape ? 16 / 9 : 9 / 16 },
    frameRate: { ideal: baseResolution.frameRate, max: baseResolution.frameRate },
    resizeMode: "crop-and-scale",
  };
}
