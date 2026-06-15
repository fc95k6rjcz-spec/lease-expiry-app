import './globals.css';
import { AuthProvider } from '../lib/auth';

export const metadata = {
  title: 'Lease Expiry Diary',
  description: 'Lease expiry diary, tenant CRM, stack plans and expansion signals.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
