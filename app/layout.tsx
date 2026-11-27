import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lovely Girl Self Defense',
  description: 'Everyday essentials designed to help you feel prepared and confident.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}