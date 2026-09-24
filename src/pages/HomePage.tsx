import { useEffect } from 'react';

export function HomePage() {
  useEffect(() => { document.title = 'THE HUNTERS A.D. 1492 WIKI'; }, []);

  return <section className="hero home-hero" aria-labelledby="home-title">
    <h1 id="home-title" className="sr-only">The Hunters A.D. 1492 Wiki</h1>
    <img className="hero-keyart" src="/images/hero-keyart.png" alt="The Hunters A.D. 1492 主視覺" />
    <div className="hero-foot"><span>THE HUNTERS A.D. 1492 WIKI</span><span>UNOFFICIAL COMMUNITY ARCHIVE</span></div>
  </section>;
}