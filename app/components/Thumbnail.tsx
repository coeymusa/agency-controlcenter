// On-demand screenshot via thum.io (no auth, generous free tier).
// We can swap to a self-hosted Playwright capture later by changing this URL
// builder — every consumer goes through `thumbnailUrl(pitchUrl)`.

export function thumbnailUrl(pitchUrl: string | null, opts: { width?: number; crop?: number } = {}): string | null {
  if (!pitchUrl) return null;
  const w = opts.width ?? 400;
  const c = opts.crop ?? 500;
  // Encode the URL — thum.io uses path-style args, the URL goes last
  return `https://image.thum.io/get/width/${w}/crop/${c}/noanimate/${pitchUrl}`;
}

export function Thumbnail({
  pitchUrl,
  size = "sm",
  business,
}: {
  pitchUrl: string | null;
  size?: "sm" | "md" | "lg";
  business: string;
}) {
  const dims = size === "sm" ? { w: 64, h: 80, rendered: 200 } : size === "md" ? { w: 200, h: 140, rendered: 400 } : { w: 320, h: 220, rendered: 640 };
  const url = thumbnailUrl(pitchUrl, { width: dims.rendered, crop: Math.round(dims.rendered * dims.h / dims.w) });
  if (!url) {
    return (
      <div
        style={{
          width: dims.w, height: dims.h, borderRadius: 6,
          background: "var(--panel-2)", border: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--dim)", fontSize: 10, flexShrink: 0,
        }}
        title="no pitch URL"
      >
        no url
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`screenshot of ${business}`}
      loading="lazy"
      style={{
        width: dims.w, height: dims.h, objectFit: "cover", objectPosition: "top",
        borderRadius: 6, border: "1px solid var(--line)",
        background: "var(--panel-2)", flexShrink: 0,
      }}
    />
  );
}
