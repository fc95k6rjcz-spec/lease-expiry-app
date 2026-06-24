// Next 14 metadata route -> served at /manifest.webmanifest
export default function manifest() {
  return {
    name: 'LEX — Lease Expiry',
    short_name: 'LEX',
    description: 'Occupier lead intelligence + on-site data scanner.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#06080c',
    theme_color: '#06080c',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
