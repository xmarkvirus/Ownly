import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: { default: 'Ownly — Digital assets, traded thoughtfully', template: '%s | Ownly' }, description: 'Discover and list eligible digital properties on Ownly.', metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'), openGraph: { siteName: 'Ownly', type: 'website' } };
export default function RootLayout({ children }: Readonly<{children:React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
