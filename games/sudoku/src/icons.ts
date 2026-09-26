// Hand-drawn line icons. Stroke width comes from the theme (--icon-sw), so the
// same shapes read as fine brushwork in 먹 and chunky marker in 봄.

const wrap = (body: string) =>
  `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  undo: wrap('<path d="M9 7H5V3"/><path d="M5.5 7.5A8 8 0 1 1 4 13"/>'),
  erase: wrap('<path d="M8.5 19.5h11"/><path d="M4.4 14.6l8.2-8.2a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-7.5 7.5H8.3z"/><path d="M9.3 9.7l6 6"/>'),
  pencil: wrap('<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>'),
  auto: wrap(
    '<circle cx="6" cy="6" r="1.2"/><circle cx="12" cy="6" r="1.2"/><circle cx="18" cy="6" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/><circle cx="6" cy="18" r="1.2"/><circle cx="12" cy="18" r="1.2"/><circle cx="18" cy="18" r="1.2"/>',
  ),
  hint: wrap('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
  menu: wrap('<path d="M5 12h.01M12 12h.01M19 12h.01"/>'),
  book: wrap('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7"/>'),
  sound: wrap('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mute: wrap('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  arrow: wrap('<path d="M9 5l7 7-7 7"/>'),
};
