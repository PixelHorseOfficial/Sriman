import React, { useEffect, useRef, useState } from "react";
import "./About.css";

const ABOUT_TEXT =
  "Sriman Kotaru is a passionate moto vlogger and motorcycle travel content creator from Hyderabad. " +
  "He documents road trips, motorcycle adventures, and breathtaking destinations across India. " +
  "His content blends cinematic storytelling with authentic riding experiences and bike insights. " +
  "Through every journey, he inspires riders to explore new places and embrace the spirit of adventure. " +
  "Driven by a love for motorcycles and travel, he continues to build a strong community of riding enthusiasts.";

const WORDS = ABOUT_TEXT.split(" ");

const IMAGE_ONE_THRESHOLD = 0.04;
const IMAGE_TWO_THRESHOLD = 0.38;


const STATS = [
  {
    key: "subscribers",
    target: 527,
    suffix: "K+",
    label: "Subscribers",
    description: "Riders following every road trip on YouTube",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.8 19c0-3.3 2.7-5.6 6.2-5.6s6.2 2.3 6.2 5.6" />
        <path d="M16 8.4c1.3.3 2.2 1.4 2.2 2.8s-.9 2.5-2.2 2.8" />
        <path d="M18.6 13.6c2 .5 3.4 1.9 3.4 3.9" />
      </svg>
    ),
  },
  {
    key: "likes",
    target: 10000,
    suffix: "+",
    label: "Likes",
    description: "Appreciation across every ride vlog and reel",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 20.3s-7.6-4.6-9.8-9.2C.6 7.6 2.4 4.4 5.6 3.8c2-.4 3.9.5 5 2.1a5.7 5.7 0 0 1 1.4-1.5c1.5-1.1 3.6-1.2 5.1-.1 2.7 1.9 3 5.5.9 8.4-2.6 3.6-6 5.7-6 5.7z" />
      </svg>
    ),
  },
  {
    key: "views",
    target: 228768191,
    suffix: "+",
    label: "Views",
    description: "Total watch time across every destination covered",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7-10.5-7-10.5-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

const formatCount = (num) => {
  if (num >= 1000000) {
    const millions = num / 1000000;
    return `${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  }
  if (num >= 1000) {
    const thousands = num / 1000;
    return `${thousands % 1 === 0 ? thousands : thousands.toFixed(1)}K`;
  }
  return String(Math.round(num));
};


const useCountUp = (target, trigger, duration = 1400) => {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (trigger === 0) return; // hasn't been triggered yet — stay at 0

    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    let start = null;
    const step = (timestamp) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      setValue(progress < 1 ? target * eased : target);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [trigger, target, duration]);

  return value;
};

const StatBox = ({ target, suffix, label, description, icon, playSignal }) => {
  const [hoverSignal, setHoverSignal] = useState(0);
  // Either the section scrolling into view (playSignal, driven by the
  // parent's IntersectionObserver) or a hover/focus on this card
  // (hoverSignal) restarts the count-up — whichever changed last.
  const trigger = playSignal + hoverSignal;
  const count = useCountUp(target, trigger);

  return (
    <div
      className="about-stat-box"
      tabIndex={0}
      onMouseEnter={() => setHoverSignal((n) => n + 1)}
      onFocus={() => setHoverSignal((n) => n + 1)}
    >
      <div className="about-stat-icon">{icon}</div>
      <div className="about-stat-number">
        {formatCount(count)}
        {suffix}
      </div>
      <div className="about-stat-label">{label}</div>
      <p className="about-stat-desc">{description}</p>
    </div>
  );
};

const About = () => {

  const wrapperRef = useRef(null);
  const rafRef = useRef(null);
  const [activeCount, setActiveCount] = useState(0);
  const [imageOneActive, setImageOneActive] = useState(false);
  const [imageTwoActive, setImageTwoActive] = useState(false);
  // Bumped every time the About section enters the viewport — either
  // scrolling down into it from below or back up into it from above —
  // so the stat cards replay their count-up without needing a hover.
  const [statsPlaySignal, setStatsPlaySignal] = useState(0);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setStatsPlaySignal((n) => n + 1);
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const computeProgress = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const vh = window.innerHeight;

      // Extra scrollable distance while the section stays pinned.
      const scrollable = rect.height - vh;

      let progress;
      if (scrollable <= 0) {
        progress = rect.top <= 0 ? 1 : 0;
      } else {
        // rect.top === 0            -> just pinned, nothing revealed yet
        // rect.top === -scrollable  -> about to unpin, fully revealed
        progress = -rect.top / scrollable;
      }

      progress = Math.min(1, Math.max(0, progress));
      setActiveCount(Math.round(progress * WORDS.length));
      setImageOneActive(progress > IMAGE_ONE_THRESHOLD);
      setImageTwoActive(progress > IMAGE_TWO_THRESHOLD);
    };

    const handleScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        computeProgress();
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    computeProgress();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="about-pin-wrapper" ref={wrapperRef}>
      <section className="about">
        <div className="about-inner">
          {/*  */}
          <div
            className={`about-pop-image about-pop-image--one${
              imageOneActive ? " is-active" : ""
            }`}
          >
            <div className="about-pop-image-inner" />
          </div>

          <div className="about-content">
            <div className="about-text">
              <p>
                {WORDS.map((word, i) => (
                  <span
                    key={i}
                    className={`about-word${i < activeCount ? " is-active" : ""}`}
                  >
                    {word}{" "}
                  </span>
                ))}
              </p>
            </div>

            {/* */}
            <div className="about-stats">
              {STATS.map((stat) => (
                <StatBox key={stat.key} {...stat} playSignal={statsPlaySignal} />
              ))}
            </div>
          </div>

          {/* Floating image two — bottom-right, pops in after image one.
              Swap the placeholder gradient in About.css
              (.about-pop-image--two .about-pop-image-inner) the same way. */}
          <div
            className={`about-pop-image about-pop-image--two${
              imageTwoActive ? " is-active" : ""
            }`}
          >
            <div className="about-pop-image-inner" />
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;