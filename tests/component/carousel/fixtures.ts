import type { CarouselCat } from "@/core/carousel/roster";

// Three live cats the way `GET /api/carousel` shapes them (T041): Solo has one photo and
// no clip, Clip has a photo and the 15s clip, Olive has three photos.

const alt = "A tabby cat on a windowsill.";

export const SOLO: CarouselCat = {
  url: "http://localhost:3000/cats/solo-nqxxjylu",
  name: "Solo",
  line: "Loves a sunny windowsill.",
  age: "4 months",
  sex: "female",
  photos: [{ src: "/media/solo/hero.jpg", alt, focal: { x: 50, y: 50 } }],
};

export const CLIP: CarouselCat = {
  url: "http://localhost:3000/cats/clip-jqyibspi",
  name: "Clip",
  line: "Will trade purrs for treats.",
  age: "10 months",
  sex: "male",
  photos: [{ src: "/media/clip/hero.jpg", alt, focal: { x: 40, y: 30 } }],
  video: {
    src: "/media/clip/web.mp4",
    poster: "/media/clip/poster.jpg",
    alt: "Clip chasing a bottle cap.",
    durationSeconds: 15,
  },
};

export const OLIVE: CarouselCat = {
  url: "http://localhost:3000/cats/olive-qc3iuxl2",
  name: "Olive",
  line: "Will trade purrs for treats.",
  photos: [
    { src: "/media/olive/1.jpg", alt, focal: { x: 50, y: 50 } },
    { src: "/media/olive/2.jpg", alt, focal: { x: 50, y: 50 } },
    { src: "/media/olive/3.jpg", alt, focal: { x: 50, y: 50 } },
  ],
};

export const ROSTER: CarouselCat[] = [SOLO, CLIP, OLIVE];
