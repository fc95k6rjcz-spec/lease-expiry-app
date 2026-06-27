import './globals.css';
import { AuthProvider } from '../lib/auth';
import RegisterSW from '../components/RegisterSW';
import InstallChoice from '../components/InstallChoice';

export const metadata = {
  title: 'LEX — Lease Expiry',
  description: 'Occupier lead intelligence + on-site data scanner.',
  manifest: '/manifest.webmanifest',
  applicationName: 'LEX',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'LEX' },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: '#06080c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <RegisterSW />
        <InstallChoice />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
