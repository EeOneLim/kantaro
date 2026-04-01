"use client";

import { useState, useEffect, FormEvent } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialValue?: string;
  placeholder?: string;
}

// Controlled search input. Lives in the hero on landing, sticky header after search.
// We sync `value` with `initialValue` so the header bar reflects the last query.
export default function SearchBar({
  onSearch,
  initialValue = "",
  placeholder = "Search for a song or artist...",
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);

  // Keep the input in sync when the parent's query changes (e.g. after a search completes)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search songs or artists"
        className="flex-1 bg-surface text-foreground placeholder:text-muted rounded-full px-4 py-3 text-base outline-none border border-border focus:border-accent transition-colors duration-200"
      />
      <button
        type="submit"
        aria-label="Search"
        className="bg-accent text-background font-semibold px-5 py-3 rounded-full hover:bg-accent-hover transition-colors duration-200 whitespace-nowrap"
      >
        Search
      </button>
    </form>
  );
}
