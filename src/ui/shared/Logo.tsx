import Image from "next/image";

// The South County Cats mark (design/media/logo-transparent.png), everywhere the hi-fi
// carries it: the builder topbar (3a, 24px), the list bar (4a, 24px), the sign-in photo
// panel (4b, 38px, white on the photo), the public nav (Charlotte v2, 32px) and the
// carousel frame (Cat Carousel Motion 6a, 76px, white over the photo). The two
// files under `public/` are the one source at four times its largest use; the white one
// is the same shape painted white — never a CSS filter over the mark.

/** The mark's own proportions, so a height gives a width. */
const SOURCE = { width: 225, height: 152 } as const;

/** The heights the hi-fi sets, by where the mark sits. */
export const LOGO_HEIGHT = { chrome: 24, nav: 32, signIn: 38, carousel: 76 } as const;

export interface LogoProps {
  height: (typeof LOGO_HEIGHT)[keyof typeof LOGO_HEIGHT];
  /** `ink` on paper and card; `white` on the night ground and over a photo. */
  tone?: "ink" | "white";
  /** `South County Cats` where the mark stands alone; `""` where a name sits beside it. */
  alt: "South County Cats" | "";
  className?: string;
}

/** The mark at one of its set heights, as a static image with its own proportions. */
export function Logo({ height, tone = "ink", alt, className }: LogoProps) {
  return (
    <Image
      src={tone === "white" ? "/logo-white.png" : "/logo.png"}
      alt={alt}
      width={Math.round((height * SOURCE.width) / SOURCE.height)}
      height={height}
      unoptimized
      className={["shrink-0", className].filter(Boolean).join(" ")}
    />
  );
}
