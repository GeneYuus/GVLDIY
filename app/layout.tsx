// app/layout.tsx
import type { Metadata } from 'next';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/azeret-mono';
import '@fontsource-variable/schibsted-grotesk';
import '@vepando/liquid-glass-react/style.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Greenville DIY Archive & Barter Market',
  description:
    'Upstate South Carolina and Carolinas DIY skate, underground music, 24-bit FLAC archive, and zero-fee artist barter market.',
  openGraph: {
    title: 'Greenville DIY Archive & Barter Market',
    description:
      'Upstate South Carolina and Carolinas DIY skate, underground music, 24-bit FLAC archive, and zero-fee artist barter market.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Greenville DIY Archive & Barter Market',
    description:
      'Upstate South Carolina and Carolinas DIY skate, underground music, 24-bit FLAC archive, and zero-fee artist barter market.',
  },
};

const DEV_HMR_QUIET_SCRIPT = [
  '(function(){',
  'if(typeof window==="undefined"||!window.WebSocket||window.__gvlHmrQuieted)return;',
  'window.__gvlHmrQuieted=true;',
  'var NativeWS=window.WebSocket;',
  'function QuietHmrSocket(url){',
  'this.url=String(url||"");',
  'this.readyState=1;',
  'this.protocol="";',
  'this.extensions="";',
  'this.bufferedAmount=0;',
  'this.binaryType="blob";',
  'this.onopen=null;',
  'this.onmessage=null;',
  'this.onerror=null;',
  'this.onclose=null;',
  '}',
  'QuietHmrSocket.CONNECTING=0;QuietHmrSocket.OPEN=1;QuietHmrSocket.CLOSING=2;QuietHmrSocket.CLOSED=3;',
  'QuietHmrSocket.prototype.CONNECTING=0;QuietHmrSocket.prototype.OPEN=1;QuietHmrSocket.prototype.CLOSING=2;QuietHmrSocket.prototype.CLOSED=3;',
  'QuietHmrSocket.prototype.send=function(){};',
  'QuietHmrSocket.prototype.close=function(){this.readyState=3;};',
  'QuietHmrSocket.prototype.addEventListener=function(){};',
  'QuietHmrSocket.prototype.removeEventListener=function(){};',
  'QuietHmrSocket.prototype.dispatchEvent=function(){return true;};',
  'function WrappedWS(url,protocols){',
  'var s=String(url||"");',
  'if(s.indexOf("/_next/webpack-hmr")!==-1){return new QuietHmrSocket(s);}',
  'return arguments.length===1?new NativeWS(url):new NativeWS(url,protocols);',
  '}',
  'WrappedWS.prototype=NativeWS.prototype;',
  'WrappedWS.CONNECTING=0;WrappedWS.OPEN=1;WrappedWS.CLOSING=2;WrappedWS.CLOSED=3;',
  'window.WebSocket=WrappedWS;',
  '})();',
].join('');

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isHmrDisabledInDev =
    process.env.NODE_ENV !== 'production' && process.env.DISABLE_HMR === 'true';

  return (
    <html lang="en" data-season="fall" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {isHmrDisabledInDev ? (
          <script suppressHydrationWarning>{DEV_HMR_QUIET_SCRIPT}</script>
        ) : null}
        {children}
      </body>
    </html>
  );
}
