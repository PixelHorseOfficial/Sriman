import { useState } from "react";
import "./Gallery.css";

/**
 * 👉 REPLACE THESE WITH YOUR REAL CONTENT LATER.
 *
 * - thumbnail:      small square image shown in the list (left side).
 * - fallbackImage:  full-bleed background image used when videoId is empty,
 *                    and also shown instantly while the YouTube video loads.
 * - videoId:        the YouTube video ID only (e.g. from
 *                    https://www.youtube.com/watch?v=XXXXXXXXXXX -> "XXXXXXXXXXX").
 *                    Leave as "" to just show fallbackImage instead of a video.
 * - description:    shown only when the item is active/selected.
 */
const GALLERY_ITEMS = [
  {
    id: 1,
    name: "Ladakh",
    thumbnail: "/images/gallery-image2.jpeg",
    fallbackVideo:
      "/images/gallery-video2.mp4",
    videoId: "",
    description:
      "Riding the BMW 1250 GSA to PANGONG TSO.",
  },
 {
    id: 2,
    name: " Welcome to SPITI ",
    thumbnail: "/images/gallery-image1.jpeg",
    fallbackVideo:
      "/images/gallery-video1.mp4",
    // videoId: "_ndDY_QCdZg",   // 👈 this makes it play the video, not the image
    description:
           "Have to RIDE these Roads ONCE in your LIFE",
  },
  
  {
    id: 3,
    name: "HYD -- GOA",
    thumbnail: "/images/gallery-image3.jpeg",
    fallbackVideo: "/images/gallery-video3.mp4",
    videoId: "",
    description:
      "The Epic Ride to Goa",
  },
  {
    id: 4,
    name: "India to China Border on a Motorcycle ",
    thumbnail: "/images/gallery-image4.jpeg",
    fallbackVideo: "/images/gallery-video4.mp4",
    videoId: "",
    description:
      "Journey through the breathtaking landscapes of India to the China border on a motorcycle.",
  },
  {
    id: 5,
    name: "HYD -- PUNE",
    thumbnail: "/images/gallery-image5.jpeg",
    fallbackVideo: "/images/gallery-video5.mp4",
    videoId: "",
    description:
      "Embarking on an unforgettable motorcycle journey from Hyderabad to Pune, exploring the scenic routes and vibrant culture along the way.",
  },

   
];

function Gallery() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="gallery">
      <div className="gallery-sticky">
        {/* Stacked background layers, one per item — cross-faded with CSS opacity */}
        <div className="gallery-background">
          {GALLERY_ITEMS.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={item.id}
                className={`gallery-bg-layer${isActive ? " is-active" : ""}`}
              >
                {/* Fallback image always present so there's no flash/gap
                    while a YouTube iframe (if any) loads on top of it */}
                <video
                  className="gallery-bg-image"
                  src={item.fallbackVideo}
                  loop
                  muted
                  autoPlay
                /> 
                {/* {item.videoId && (
                  <iframe
                    className="gallery-bg-video"
                    src={`https://www.youtube.com/embed/${item.videoId}?autoplay=1&mute=1&loop=1&playlist=${item.videoId}&controls=0&showinfo=0&modestbranding=1&iv_load_policy=3&rel=0&playsinline=1`}
                    title={item.name}
                    frameBorder="0"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                )} */}
              </div>
            );
          })}
        </div>

        <div className="gallery-overlay" />

        <div className="gallery-center">
          <div className="gallery-content">
            <h1>VLOGS</h1>
            <p>Capture every unforgettable moment.</p>
          </div>

          <div className="gallery-list">
            {GALLERY_ITEMS.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`gallery-item${isActive ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => setActiveIndex(index)}
                >
                  <img
                    className="gallery-item-thumb"
                    src={item.thumbnail}
                    alt={item.name}
                  />

                  <div className="gallery-item-text">
                    <span className="gallery-item-name">{item.name}</span>
                    <p className="gallery-item-description">
                      {item.description}
                    </p>
                  </div>

                  <span className="gallery-item-count">
                    {String(index + 1).padStart(2, "0")} /{" "}
                    {String(GALLERY_ITEMS.length).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Gallery;