import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'AnaesSOP - Anaesthetic Clinical Governance Database',
  description: 'Hybrid RAG retrieval system and policy life-cycle engine for hospital clinical guidelines, protocols, and cognitive aids.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="antialiased min-h-screen bg-slate-900 text-slate-100 selection:bg-teal-500/30 selection:text-teal-200">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
