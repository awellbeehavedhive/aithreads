import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Decode HTML entities in a string
 * Handles common entities like &#8217; ('), &#8216; ('), &#8220; ("), &#8221; ("), &amp;, etc.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  // Use a map for common numeric entities
  const entities: Record<string, string> = {
    '&#8217;': "'",  // Right single quote
    '&#8216;': "'",  // Left single quote
    '&#8220;': '"',  // Left double quote
    '&#8221;': '"',  // Right double quote
    '&#8211;': '–',  // En dash
    '&#8212;': '—',  // Em dash
    '&#8230;': '…',  // Ellipsis
    '&#38;': '&',
    '&#39;': "'",
    '&#34;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  let result = text;

  // Replace known entities
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char);
  }

  // Handle any remaining numeric entities (&#NNN; or &#xNNN;)
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return result;
}

