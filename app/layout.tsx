import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "拾日 · 家庭手札",
  description: "記錄家庭的每一天，珍藏生活中的美好時光。",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('shiri-font-size');if(s&&['small','medium','large'].includes(s)){document.documentElement.setAttribute('data-font-size',s)}}catch(e){}}())`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
