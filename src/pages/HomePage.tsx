import { useEffect } from 'react';

export function HomePage() {
  useEffect(() => { document.title = 'THE HUNTERS A.D. 1492 WIKI'; }, []);

  return <section className="hero home-hero" aria-labelledby="home-title">
    <h1 id="home-title" className="sr-only">The Hunters A.D. 1492 Wiki</h1>
    <picture className="hero-keyart-picture">
      <source
        type="image/webp"
        srcSet="/images/hero-keyart-640.webp 640w, /images/hero-keyart.webp 1200w"
        sizes="100vw"
      />
      <img
        className="hero-keyart"
        src="/images/hero-keyart.webp"
        alt="The Hunters A.D. 1492 主視覺"
        width="1200"
        height="865"
        decoding="async"
        fetchPriority="high"
      />
    </picture>
    <div className="hero-foot"><span>THE HUNTERS A.D. 1492 WIKI</span><span>UNOFFICIAL COMMUNITY ARCHIVE</span></div>
  </section>;
}