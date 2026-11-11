// Small original gift icons, drawn here so the overlay needs no image files.
// They are the fallback for when TikTok's own gift icons cannot be loaded.

const SVG = {
  rose: `<path d="M16 18v11" stroke="#2f9e57" stroke-width="2.4" stroke-linecap="round"/><path d="M16 24c-4 0-6-2-7-5 4 0 6 1 7 5z" fill="#3fbf6c"/><circle cx="16" cy="11" r="8.5" fill="#e8344e"/><path d="M16 4.5c4 1 6 4 5.5 8-1 3.5-5 4.5-7.5 2.5-2-1.8-1.5-5 1-5.5 1.8-.3 3 1 2.5 2.5" fill="none" stroke="#ff9bab" stroke-width="1.8" stroke-linecap="round"/>`,
  doughnut: `<circle cx="16" cy="16" r="12" fill="#d9a066"/><path d="M16 4.500a11.5 11.5 0 0 1 11.3 9.500c-2 1.5-3.5-.5-5.5 1s-1.5 4-4 4.5-3.5-2-6-1.5-3 3-5.5 2A11.5 11.5 0 0 1 16 4.500z" fill="#ff7eb6"/><circle cx="16" cy="16" r="4" fill="#2a2030"/><g stroke-width="1.8" stroke-linecap="round"><path d="M10 9l1.5 1.5" stroke="#fff"/><path d="M20 8l-1 2" stroke="#7fd3ff"/><path d="M23 13l-2 .5" stroke="#ffe37a"/><path d="M13 7l.5 2" stroke="#7dffb0"/></g>`,
  confetti: `<path d="M5 27l5-15 10 10z" fill="#ffd24a"/><path d="M7.2 20.500l5.8 5.800M9 15l9.5 9.5" stroke="#f08a24" stroke-width="1.6"/><g stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M17 12c1-3 0-5-2-7" stroke="#7fd3ff"/><path d="M21 15c3-1 5 0 7 2" stroke="#ff7eb6"/><path d="M20 10l4-5" stroke="#7dffb0"/></g><circle cx="26" cy="10" r="1.7" fill="#c9a2ff"/><circle cx="11" cy="6" r="1.5" fill="#ff7eb6"/><circle cx="27" cy="23" r="1.5" fill="#7fd3ff"/>`,
  galaxy: `<circle cx="16" cy="16" r="13" fill="#2a1a55"/><ellipse cx="16" cy="16" rx="12" ry="5" transform="rotate(-25 16 16)" fill="none" stroke="#b58cff" stroke-width="2.2"/><ellipse cx="16" cy="16" rx="7.5" ry="3" transform="rotate(-25 16 16)" fill="none" stroke="#7fd3ff" stroke-width="1.8"/><circle cx="16" cy="16" r="3" fill="#fff3c4"/><g fill="#fff"><circle cx="8" cy="9" r="1"/><circle cx="24" cy="8" r=".8"/><circle cx="25" cy="23" r="1"/><circle cx="9" cy="24" r=".8"/></g>`,
};
const GEM = `<path d="M16 3l11 13-11 13L5 16z" fill="currentColor"/><path d="M16 3l4 13-4 13-4-13z" fill="#fff" opacity=".35"/>`;

function drawn(key) {
  const span = document.createElement('span');
  span.className = 'gift-icon';
  span.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${SVG[key] || GEM}</svg>`;
  return span;
}

/**
 * Returns an element for a gift icon: an image address (TikTok's own icon,
 * or your file) or one of the built-in keys. If an image fails to load, the
 * drawn fallback takes its place, so the legend is never blank.
 */
export function giftIcon(icon, fallback) {
  if (typeof icon === 'string' && /[./:]/.test(icon)) {
    const img = document.createElement('img');
    img.className = 'gift-icon';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.replaceWith(drawn(fallback));
    img.src = icon;
    return img;
  }
  return drawn(icon);
}
