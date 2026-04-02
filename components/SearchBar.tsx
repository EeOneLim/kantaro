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

      {/* On mobile: icon-only button to save header space (AC-12.1)
          On sm+: full "Search" text button (AC-12.2) */}
      <button
        type="submit"
        aria-label="Search"
        className="bg-accent text-background font-semibold rounded-full hover:bg-accent-hover transition-colors duration-200 flex items-center justify-center
          w-9 h-9 sm:w-auto sm:h-auto sm:px-5 sm:py-3"
      >
        {/* Magnifying glass — visible on mobile only */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 sm:hidden"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>

        {/* "Search" label — visible on sm+ only */}
        <span className="hidden sm:inline whitespace-nowrap">Search</span>
      </button>
    </form>
  );
}
