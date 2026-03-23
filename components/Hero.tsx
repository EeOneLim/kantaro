"use client";

import SearchBar from "./SearchBar";

interface HeroProps {
  onSearch: (query: string) => void;
}

export default function Hero({ onSearch }: HeroProps) {
  return (
    <section className="px-4 pt-8 pb-10">
      {/* Wordmark — only visible on landing; replaced by sticky header after search */}
      <p className="font-[family-name:var(--font-sora)] font-bold text-xl text-accent mb-10">
        Kantaro
      </p>

      <div className="max-w-lg">
        <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl font-bold text-foreground leading-tight mb-3">
          Learn Spanish
          <br />
          <span className="text-accent">through music.</span>
        </h1>
        <p className="text-muted text-lg mb-8">
          Search a song. Play it. Learn the words.
        </p>

        <SearchBar onSearch={onSearch} />
      </div>
    </section>
  );
}
