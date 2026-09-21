import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Pique Rush — corrida pela bandeira', description: 'Dois celulares, dois times. Desvie, pule e capture a bandeira.', icons: {icon:'/favicon.svg'} };
export const viewport: Viewport = {width:'device-width', initialScale:1, themeColor:'#101823'};
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) {return <html lang="pt-BR"><body>{children}</body></html>}
